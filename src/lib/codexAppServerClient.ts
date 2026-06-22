import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveFromProject } from "./paths.js";

export type CodexAppServerTransportKind = "stdio" | "unix" | "websocket" | "mock";

export interface JsonRpcErrorShape {
  code?: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResult {
  ok: boolean;
  method: string;
  responseSummary?: string;
  error?: JsonRpcErrorShape;
}

export interface CodexAppServerProbeAttempt {
  transport: CodexAppServerTransportKind;
  target: string;
  available: boolean;
  real: boolean;
  experimental?: boolean;
  reason?: string;
  initialized?: boolean;
  threadResume?: JsonRpcResult;
  turnStart?: JsonRpcResult;
}

export interface CodexAppServerProbe {
  checkedAt: string;
  threadId: string | null;
  currentThreadExpired: boolean;
  env: Record<string, string>;
  socketCandidates: string[];
  attempts: CodexAppServerProbeAttempt[];
  conclusion: "real_bridge_available" | "thread_registered_but_app_server_unavailable" | "missing_thread_id" | "protocol_unknown";
  recommendation: string;
}

export interface CodexAppServerSendResult {
  ok: boolean;
  real: boolean;
  transport: CodexAppServerTransportKind | "none";
  responseSummary?: string;
  error?: string;
}

interface StdioRpcOptions {
  threadId?: string;
  turnText?: string;
  timeoutMs?: number;
}

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: JsonRpcErrorShape;
  method?: string;
  params?: unknown;
}

const clientInfo = {
  name: "pptx_workbench",
  title: "PPTX Workbench",
  version: "1.6.11.1",
};

export function collectCodexAppServerEnv(): Record<string, string> {
  const keys = [
    "CODEX_APP_SERVER_URL",
    "CODEX_APP_SERVER_ENDPOINT",
    "CODEX_APP_SERVER_SOCKET",
    "CODEX_APP_SERVER_TRANSPORT",
    "CODEX_BRIDGE_ALLOW_MOCK",
    "CODEX_HOME",
    "CODEX_THREAD_ID",
    "CODEX_CURRENT_THREAD_ID",
    "OPENAI_CODEX_THREAD_ID",
  ];
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      result[key] = key.includes("TOKEN") || key.includes("SECRET") ? "[redacted]" : value;
    }
  }
  return result;
}

export async function discoverCodexSocketCandidates(): Promise<string[]> {
  const candidates = new Set<string>();
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  candidates.add(path.join(codexHome, "app-server-control", "app-server-control.sock"));
  if (process.env.CODEX_APP_SERVER_SOCKET?.trim()) {
    candidates.add(process.env.CODEX_APP_SERVER_SOCKET.trim());
  }
  for (const dir of [os.tmpdir(), resolveFromProject(".codex-bridge")]) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const name = entry.name.toLowerCase();
        if (entry.isSocket() && (name.includes("codex") || name.includes("app-server"))) {
          candidates.add(path.join(dir, entry.name));
        }
      }
    } catch {
      // Reasonable candidate directory may not exist; absence is reported by per-candidate stat below.
    }
  }
  const existing: string[] = [];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isSocket()) {
        existing.push(candidate);
      }
    } catch {
      // Keep probe narrow: non-existing candidates are not included.
    }
  }
  return existing;
}

export async function probeCodexAppServer(input: { threadId?: string; expired?: boolean; turnText?: string } = {}): Promise<CodexAppServerProbe> {
  const checkedAt = new Date().toISOString();
  const env = collectCodexAppServerEnv();
  const socketCandidates = await discoverCodexSocketCandidates();
  const attempts: CodexAppServerProbeAttempt[] = [];
  const allowMock = process.env.CODEX_BRIDGE_ALLOW_MOCK === "1";

  if (allowMock && (process.env.CODEX_APP_SERVER_ENDPOINT?.startsWith("mock://") || process.env.CODEX_APP_SERVER_URL?.startsWith("mock://"))) {
    attempts.push({
      transport: "mock",
      target: process.env.CODEX_APP_SERVER_ENDPOINT ?? process.env.CODEX_APP_SERVER_URL ?? "mock://codex-app-server",
      available: true,
      real: false,
      reason: "显式 CODEX_BRIDGE_ALLOW_MOCK=1，仅用于测试，不是真实 app-server。",
      initialized: true,
      threadResume: input.threadId ? { ok: true, method: "thread/resume", responseSummary: "mock thread/resume" } : undefined,
      turnStart: input.threadId ? { ok: true, method: "turn/start", responseSummary: "mock turn/start" } : undefined,
    });
  }

  attempts.push(await probeStdio(input));

  for (const socketPath of socketCandidates) {
    attempts.push({
      transport: "unix",
      target: socketPath,
      available: false,
      real: true,
      reason: "发现候选 unix socket；当前实现未手写 websocket-over-unix frame，仅记录候选并优先使用官方 stdio transport 探测。",
    });
  }

  const wsUrl = process.env.CODEX_APP_SERVER_URL?.startsWith("ws://") ? process.env.CODEX_APP_SERVER_URL : undefined;
  if (wsUrl) {
    attempts.push({
      transport: "websocket",
      target: wsUrl,
      available: false,
      real: true,
      experimental: true,
      reason: "官方标记 websocket experimental / unsupported；本版只记录，不作为生产桥接依赖。",
    });
  }

  const realSuccess = attempts.some((attempt) => attempt.real && attempt.available && (!input.threadId || attempt.threadResume?.ok === true) && (!input.turnText || attempt.turnStart?.ok === true));
  const conclusion = !input.threadId
    ? "missing_thread_id"
    : realSuccess
      ? "real_bridge_available"
      : attempts.some((attempt) => attempt.transport === "stdio" || attempt.transport === "unix" || attempt.transport === "websocket")
        ? "thread_registered_but_app_server_unavailable"
        : "protocol_unknown";

  return {
    checkedAt,
    threadId: input.threadId ?? null,
    currentThreadExpired: input.expired === true,
    env,
    socketCandidates,
    attempts,
    conclusion,
    recommendation: recommendationFor(conclusion),
  };
}

export async function sendWorkbenchEventToCodexAppServer(input: { threadId: string; taskText: string; payload: Record<string, unknown> }): Promise<CodexAppServerSendResult> {
  if (process.env.CODEX_BRIDGE_ALLOW_MOCK === "1" && (process.env.CODEX_APP_SERVER_ENDPOINT?.startsWith("mock://") || process.env.CODEX_APP_SERVER_URL?.startsWith("mock://"))) {
    return { ok: true, real: false, transport: "mock", responseSummary: "mock turn/start" };
  }
  const attempt = await probeStdio({ threadId: input.threadId, turnText: input.taskText, timeoutMs: 15000 });
  if (attempt.available && attempt.turnStart?.ok) {
    return {
      ok: true,
      real: true,
      transport: "stdio",
      responseSummary: attempt.turnStart.responseSummary,
    };
  }
  return {
    ok: false,
    real: true,
    transport: "stdio",
    error: attempt.turnStart?.error?.message ?? attempt.threadResume?.error?.message ?? attempt.reason ?? "未发现可用 Codex app-server transport",
  };
}

export async function writeCodexAppServerProbeMarkdown(probe: CodexAppServerProbe): Promise<string> {
  const outputPath = resolveFromProject("outputs", "codex-app-server-probe.md");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const lines = [
    "# Codex App-Server Probe",
    "",
    `- 当前时间：${probe.checkedAt}`,
    `- threadId：${probe.threadId ?? "缺失"}`,
    `- current-thread 是否过期：${probe.currentThreadExpired ? "是" : "否"}`,
    `- 最终结论：${probe.conclusion}`,
    "",
    "## 环境变量",
    "",
    ...Object.entries(probe.env).map(([key, value]) => `- ${key}: ${value}`),
    ...(Object.keys(probe.env).length === 0 ? ["- 未发现相关环境变量"] : []),
    "",
    "## Socket 候选",
    "",
    ...probe.socketCandidates.map((candidate) => `- ${candidate}`),
    ...(probe.socketCandidates.length === 0 ? ["- 未发现合理 socket 候选"] : []),
    "",
    "## Transport 尝试",
    "",
    ...probe.attempts.flatMap((attempt) => [
      `### ${attempt.transport}: ${attempt.target}`,
      "",
      `- available: ${attempt.available}`,
      `- real: ${attempt.real}`,
      ...(attempt.experimental !== undefined ? [`- experimental: ${attempt.experimental}`] : []),
      ...(attempt.reason ? [`- reason: ${attempt.reason}`] : []),
      `- initialized: ${attempt.initialized === true ? "yes" : "no"}`,
      `- thread/resume: ${attempt.threadResume ? summarizeRpcResult(attempt.threadResume) : "not-called"}`,
      `- turn/start: ${attempt.turnStart ? summarizeRpcResult(attempt.turnStart) : "not-called"}`,
      "",
    ]),
    "## 下一步建议",
    "",
    probe.recommendation,
    "",
  ];
  await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  return outputPath;
}

async function probeStdio(input: StdioRpcOptions): Promise<CodexAppServerProbeAttempt> {
  try {
    const session = spawn("codex", ["app-server", "--stdio"], {
      cwd: resolveFromProject(),
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    const rpc = new JsonlRpcSession(session, input.timeoutMs ?? 10000);
    const initialize = await rpc.request("initialize", {
      clientInfo,
      capabilities: {
        optOutNotificationMethods: ["item/agentMessage/delta"],
      },
    });
    if (!initialize.ok) {
      await rpc.close();
      return {
        transport: "stdio",
        target: "codex app-server --stdio",
        available: false,
        real: true,
        initialized: false,
        reason: initialize.error?.message ?? "initialize failed",
      };
    }
    rpc.notify("initialized", {});
    let threadResume: JsonRpcResult | undefined;
    let turnStart: JsonRpcResult | undefined;
    if (input.threadId) {
      threadResume = await rpc.request("thread/resume", { threadId: input.threadId });
      if (threadResume.ok && input.turnText) {
      turnStart = await rpc.request("turn/start", {
        threadId: input.threadId,
        input: [{ type: "text", text: input.turnText, text_elements: [] }],
      });
      }
    }
    await rpc.close();
    return {
      transport: "stdio",
      target: "codex app-server --stdio",
      available: input.threadId ? Boolean(threadResume?.ok && (!input.turnText || turnStart?.ok)) : true,
      real: true,
      initialized: true,
      threadResume,
      turnStart,
      reason: input.threadId ? undefined : "未提供 threadId，仅完成 initialize 探测。",
    };
  } catch (error) {
    return {
      transport: "stdio",
      target: "codex app-server --stdio",
      available: false,
      real: true,
      initialized: false,
      reason: error instanceof Error ? error.message : "stdio probe failed",
    };
  }
}

class JsonlRpcSession {
  private nextId = 1;
  private buffer = "";
  private pending = new Map<number, (response: RpcResponse) => void>();

  constructor(private readonly child: ReturnType<typeof spawn>, private readonly timeoutMs: number) {
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => this.onData(chunk));
  }

  async request(method: string, params: Record<string, unknown>): Promise<JsonRpcResult> {
    const id = this.nextId++;
    const responsePromise = new Promise<RpcResponse>((resolve) => {
      this.pending.set(id, resolve);
    });
    this.write({ id, method, params });
    const timeout = new Promise<RpcResponse>((resolve) => {
      setTimeout(() => resolve({ id, error: { message: `${method} timed out after ${this.timeoutMs}ms` } }), this.timeoutMs);
    });
    const response = await Promise.race([responsePromise, timeout]);
    this.pending.delete(id);
    if (response.error) {
      return { ok: false, method, error: normalizeRpcError(response.error) };
    }
    return { ok: true, method, responseSummary: summarizeUnknown(response.result) };
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.write({ method, params });
  }

  async close(): Promise<void> {
    this.child.stdin?.end();
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
    }
  }

  private write(message: Record<string, unknown>): void {
    this.child.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) {
        this.handleLine(line);
      }
      index = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    try {
      const message = JSON.parse(line) as unknown;
      if (!isRecord(message) || typeof message.id !== "number") {
        return;
      }
      const resolve = this.pending.get(message.id);
      if (resolve) {
        resolve(message as RpcResponse);
      }
    } catch {
      // Non-JSON tracing should be ignored; structured errors are returned as JSON-RPC errors.
    }
  }
}

function summarizeRpcResult(result: JsonRpcResult): string {
  if (result.ok) {
    return `ok ${result.responseSummary ?? ""}`.trim();
  }
  return `error ${result.error?.code ?? ""} ${result.error?.message ?? ""}`.trim();
}

function normalizeRpcError(error: JsonRpcErrorShape): JsonRpcErrorShape {
  return {
    code: typeof error.code === "number" ? error.code : undefined,
    message: typeof error.message === "string" ? error.message : "JSON-RPC error",
    data: error.data,
  };
}

function summarizeUnknown(value: unknown): string {
  if (!isRecord(value)) {
    return typeof value === "string" ? value.slice(0, 160) : JSON.stringify(value)?.slice(0, 160);
  }
  const keys = Object.keys(value).slice(0, 8);
  const id = typeof value.id === "string" ? ` id=${value.id}` : "";
  const thread = isRecord(value.thread) && typeof value.thread.id === "string" ? ` thread=${value.thread.id}` : "";
  const turn = isRecord(value.turn) && typeof value.turn.id === "string" ? ` turn=${value.turn.id}` : "";
  return `keys=${keys.join(",")}${id}${thread}${turn}`;
}

function recommendationFor(conclusion: CodexAppServerProbe["conclusion"]): string {
  if (conclusion === "real_bridge_available") {
    return "真实 app-server 可用；被动探测已完成 initialize/thread-resume，真实 queued 事件发送时才调用 turn/start。";
  }
  if (conclusion === "missing_thread_id") {
    return "缺少 current-thread.json 或 threadId；请先由 builder、当前对话注册命令或 URL token 绑定当前会话。";
  }
  if (conclusion === "thread_registered_but_app_server_unavailable") {
    return "当前会话已注册，但未发现可用 app-server transport；事件应保持 queued，不能标记 sent。";
  }
  return "协议或 transport 状态不明确；请核对本机 codex CLI 版本和 app-server README。";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
