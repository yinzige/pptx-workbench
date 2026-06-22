import { probeCodexAppServer, sendWorkbenchEventToCodexAppServer, writeCodexAppServerProbeMarkdown } from "../src/lib/codexAppServerClient.js";
import { readCodexBridgeConfig, readCodexBridgeEvents, updateCodexBridgeAppServer, updateCodexBridgeEventStatus } from "../src/lib/codexBridge.js";

const config = await readCodexBridgeConfig();
const events = await readCodexBridgeEvents();
const queued = events.filter((event) => event.status === "queued");

if (!config?.threadId || config.status !== "connected") {
  for (const event of queued) {
    await updateCodexBridgeEventStatus(event.id, "bridge_unavailable", {
      error: "未连接 Codex：缺少 .codex-bridge/current-thread.json 或 threadId。",
    });
  }
  console.log(JSON.stringify({
    status: "bridge_unavailable",
    processed: queued.length,
    message: "未连接 Codex；queued 事件已标记 bridge_unavailable。",
  }, null, 2));
  process.exit(0);
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

if (probe.conclusion !== "real_bridge_available" && !(process.env.CODEX_BRIDGE_ALLOW_MOCK === "1" && probe.attempts.some((attempt) => attempt.transport === "mock" && attempt.available))) {
  console.log(JSON.stringify({
    status: "app_server_unavailable",
    threadId: config.threadId,
    processed: 0,
    queued: queued.length,
    probeReport: "outputs/codex-app-server-probe.md",
    message: "已注册 threadId，但未发现可用 Codex app-server transport；queued 事件保持入队状态，不标记 sent。",
  }, null, 2));
  process.exit(0);
}

let processed = 0;
let failed = 0;

for (const event of queued) {
  const taskText = event.taskText ?? bridgeTaskText(event);
  const attemptCount = (event.attemptCount ?? 0) + 1;
  const sent = await sendWorkbenchEventToCodexAppServer({
    threadId: config.threadId,
    taskText,
    payload: event.payload,
  });
  if (!sent.ok) {
    failed += 1;
    await updateCodexBridgeEventStatus(event.id, "queued", {
      taskText,
      targetThreadId: config.threadId,
      attemptCount,
      error: sent.error ?? "未发现可用 Codex app-server transport。",
    });
    continue;
  }
  processed += 1;
  await updateCodexBridgeEventStatus(event.id, "waiting_codex", {
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
}

console.log(JSON.stringify({
  status: failed > 0 ? "partial" : "waiting_codex",
  threadId: config.threadId,
  processed,
  failed,
  probeReport: "outputs/codex-app-server-probe.md",
  message: "已按 Codex app-server JSON-RPC 协议尝试发送；成功事件已标记为 waiting_codex。",
}, null, 2));

function bridgeTaskText(event: { id: string; type: string; payload: Record<string, unknown> }): string {
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
