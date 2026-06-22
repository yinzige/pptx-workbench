import { probeCodexAppServer, sendWorkbenchEventToCodexAppServer, writeCodexAppServerProbeMarkdown } from "./codexAppServerClient.js";
import {
  readCodexBridgeConfig,
  readCodexBridgeEvents,
  updateCodexBridgeAppServer,
  updateCodexBridgeEventStatus,
  type CodexBridgeEvent,
} from "./codexBridge.js";

export interface CodexBridgeDispatchResult {
  status: "idle" | "waiting_codex" | "partial" | "app_server_unavailable" | "bridge_unavailable";
  threadId: string | null;
  processed: number;
  failed: number;
  queued: number;
  probeReport?: string;
  message: string;
  events: Array<{
    id: string;
    type: string;
    status: string;
    error?: string;
  }>;
}

export async function dispatchCodexBridgeQueue(input: {
  limit?: number;
  includeWaiting?: boolean;
  eventIds?: string[];
  inboxEventId?: string;
} = {}): Promise<CodexBridgeDispatchResult> {
  const config = await readCodexBridgeConfig();
  const events = await readCodexBridgeEvents();
  const eventIdSet = new Set(input.eventIds ?? []);
  const candidates = events
    .filter((event) => event.status === "queued" || (input.includeWaiting === true && event.status === "waiting_codex"))
    .filter((event) => eventIdSet.size === 0 || eventIdSet.has(event.id))
    .filter((event) => !input.inboxEventId || event.payload.inboxEventId === input.inboxEventId)
    .slice(0, Math.max(1, input.limit ?? 5));

  if (candidates.length === 0) {
    return {
      status: "idle",
      threadId: config?.threadId ?? null,
      processed: 0,
      failed: 0,
      queued: 0,
      message: "没有待发送的 Codex bridge 事件。",
      events: [],
    };
  }

  if (!config?.threadId || config.status !== "connected") {
    const results = [];
    for (const event of candidates) {
      const updated = await updateCodexBridgeEventStatus(event.id, "bridge_unavailable", {
        error: "未连接 Codex：缺少 .codex-bridge/current-thread.json 或 threadId。",
      });
      results.push({ id: event.id, type: event.type, status: updated?.status ?? "bridge_unavailable", error: updated?.error });
    }
    return {
      status: "bridge_unavailable",
      threadId: null,
      processed: 0,
      failed: candidates.length,
      queued: candidates.length,
      message: "未连接 Codex；queued 事件已标记 bridge_unavailable。",
      events: results,
    };
  }

  const probe = await probeCodexAppServer({ threadId: config.threadId });
  await writeCodexAppServerProbeMarkdown(probe);
  const realAvailableAttempt = probe.attempts.find((attempt) => attempt.real && attempt.available && attempt.threadResume?.ok === true);
  await updateCodexBridgeAppServer(realAvailableAttempt
    ? {
        available: true,
        transport: realAvailableAttempt.transport,
        endpoint: realAvailableAttempt.target,
        reason: "JSON-RPC probe 已完成 initialize/thread-resume；真实 queued 事件发送时调用 turn/start。",
      }
    : {
        available: false,
        transport: "none",
        endpoint: null,
        reason: probe.recommendation,
      });

  const mockAvailable = process.env.CODEX_BRIDGE_ALLOW_MOCK === "1" && probe.attempts.some((attempt) => attempt.transport === "mock" && attempt.available);
  if (probe.conclusion !== "real_bridge_available" && !mockAvailable) {
    return {
      status: "app_server_unavailable",
      threadId: config.threadId,
      processed: 0,
      failed: 0,
      queued: candidates.length,
      probeReport: "outputs/codex-app-server-probe.md",
      message: "已注册 threadId，但未发现可用 Codex app-server transport；queued 事件保持入队状态，不标记 sent。",
      events: candidates.map((event) => ({ id: event.id, type: event.type, status: event.status, error: event.error })),
    };
  }

  let processed = 0;
  let failed = 0;
  const results = [];
  for (const event of candidates) {
    const taskText = event.taskText ?? bridgeTaskText(event);
    const attemptCount = (event.attemptCount ?? 0) + 1;
    const sent = await sendWorkbenchEventToCodexAppServer({
      threadId: config.threadId,
      taskText,
      payload: event.payload,
    });
    if (!sent.ok) {
      failed += 1;
      const status = attemptCount >= 3 ? "failed" : "queued";
      const updated = await updateCodexBridgeEventStatus(event.id, status, {
        taskText,
        targetThreadId: config.threadId,
        attemptCount,
        error: sent.error ?? "未发现可用 Codex app-server transport。",
      });
      results.push({ id: event.id, type: event.type, status: updated?.status ?? status, error: updated?.error });
      continue;
    }
    processed += 1;
    const updated = await updateCodexBridgeEventStatus(event.id, "waiting_codex", {
      taskText,
      targetThreadId: config.threadId,
      sentAt: new Date().toISOString(),
      attemptCount,
      payload: {
        ...event.payload,
        appServerTransport: sent.transport,
        jsonRpcResponseSummary: sent.responseSummary,
        realAppServer: sent.real,
      },
    });
    results.push({ id: event.id, type: event.type, status: updated?.status ?? "waiting_codex" });
  }

  return {
    status: failed > 0 ? "partial" : "waiting_codex",
    threadId: config.threadId,
    processed,
    failed,
    queued: candidates.length,
    probeReport: "outputs/codex-app-server-probe.md",
    message: "已按 Codex app-server JSON-RPC 协议尝试发送；成功事件已标记为 waiting_codex。",
    events: results,
  };
}

function bridgeTaskText(event: CodexBridgeEvent): string {
  return [
    "Workbench 收到一条事件，请处理：",
    "",
    `事件 ID：${event.id}`,
    `类型：${event.type}`,
    `payload：${JSON.stringify(event.payload, null, 2)}`,
    "",
    "请根据事件修改 /Users/bruce/Documents/PPT/pptx-workbench/specs/example.deck-spec.yaml 或在当前对话中向用户提问。",
    "不要在网页中假装完成；只有真实 deck-spec diff 和预览刷新后才能标记 applied。",
  ].join("\n");
}
