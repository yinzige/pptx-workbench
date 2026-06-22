import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveFromProject } from "./paths.js";

export type CodexBridgeEventType =
  | "upload_reference"
  | "annotation_submitted"
  | "revision_requested"
  | "undo_completed"
  | "redo_completed"
  | "export_completed"
  | "playback_qa_recorded"
  | "audit_failed";

export type CodexBridgeEventStatus =
  | "queued"
  | "sent"
  | "waiting_codex"
  | "processing"
  | "applied"
  | "needs_codex"
  | "failed"
  | "bridge_unavailable";

export type CodexBridgeConfigStatus =
  | "connected"
  | "missing_thread_id"
  | "bridge_unavailable"
  | "expired";

export interface CodexBridgeAppServer {
  available: boolean;
  transport: "auto" | "none" | "mock" | "stdio" | "unix" | "websocket";
  endpoint: string | null;
  reason?: string;
}

export interface CodexBridgeConfig {
  threadId?: string;
  workspace: string;
  source?: string;
  connectedAt?: string;
  expiresAt?: string;
  status: CodexBridgeConfigStatus;
  appServer?: CodexBridgeAppServer;
}

export interface CodexBridgeEvent {
  id: string;
  type: CodexBridgeEventType;
  status: CodexBridgeEventStatus;
  createdAt: string;
  updatedAt?: string;
  source: "workbench" | "codex-thread-bridge";
  threadId?: string;
  targetThreadId?: string;
  sentAt?: string;
  attemptCount?: number;
  payload: Record<string, unknown>;
  taskText?: string;
  error?: string;
}

export interface CodexBridgeSummary {
  configPath: string;
  eventsPath: string;
  receiptsPath: string;
  pendingTokensPath: string;
  connected: boolean;
  status: CodexBridgeConfigStatus | "not_configured" | "token_invalid" | "token_expired";
  threadId: string | null;
  workspace: string;
  source: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  appServer: CodexBridgeAppServer;
  eventCount: number;
  queuedCount: number;
  waitingCount: number;
  bridgeUnavailableCount: number;
  latestEvent: CodexBridgeEvent | null;
}

export interface CodexBridgePendingToken {
  token: string;
  threadId: string;
  workspace: string;
  source: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedAt?: string;
}

export const codexBridgeDir = resolveFromProject(".codex-bridge");
export const codexBridgeConfigPath = resolveFromProject(".codex-bridge", "current-thread.json");
export const codexBridgePendingTokensPath = resolveFromProject(".codex-bridge", "pending-tokens.jsonl");
export const codexBridgeEventsPath = resolveFromProject("events", "codex-events.jsonl");
export const codexBridgeReceiptsPath = resolveFromProject("outputs", "codex-bridge-receipts.jsonl");
export const defaultBridgeTtlMs = 24 * 60 * 60 * 1000;
export const bridgeTokenTtlMs = 10 * 60 * 1000;

export async function ensureCodexBridgeFiles(): Promise<void> {
  await fs.mkdir(codexBridgeDir, { recursive: true });
  await fs.mkdir(path.dirname(codexBridgeEventsPath), { recursive: true });
  await fs.appendFile(codexBridgeEventsPath, "", "utf8");
  await fs.appendFile(codexBridgePendingTokensPath, "", "utf8");
}

export async function readCodexBridgeConfig(): Promise<CodexBridgeConfig | null> {
  try {
    const raw = await fs.readFile(codexBridgeConfigPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    const threadId = normalizeOptionalString(parsed.threadId);
    const expiresAt = normalizeOptionalString(parsed.expiresAt);
    const expired = isExpired(expiresAt);
    const status: CodexBridgeConfigStatus = expired
      ? "expired"
      : parsed.status === "connected" && threadId
        ? "connected"
        : parsed.status === "bridge_unavailable"
          ? "bridge_unavailable"
          : "missing_thread_id";
    return {
      ...(threadId ? { threadId } : {}),
      workspace: normalizeOptionalString(parsed.workspace) ?? resolveFromProject(),
      source: normalizeOptionalString(parsed.source),
      connectedAt: normalizeOptionalString(parsed.connectedAt),
      expiresAt,
      status,
      appServer: normalizeAppServer(parsed.appServer),
    };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function readCodexBridgeEvents(): Promise<CodexBridgeEvent[]> {
  await ensureCodexBridgeFiles();
  const source = await fs.readFile(codexBridgeEventsPath, "utf8");
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => normalizeStoredBridgeEvent(JSON.parse(line)));
}

export async function readCodexBridgeSummary(): Promise<CodexBridgeSummary> {
  await ensureCodexBridgeFiles();
  const [config, events] = await Promise.all([readCodexBridgeConfig(), readCodexBridgeEvents()]);
  const appServer = config?.appServer ?? defaultAppServerStatus();
  const connected = config?.status === "connected" && Boolean(config.threadId);
  return {
    configPath: codexBridgeConfigPath,
    eventsPath: codexBridgeEventsPath,
    receiptsPath: codexBridgeReceiptsPath,
    pendingTokensPath: codexBridgePendingTokensPath,
    connected,
    status: config?.status ?? "not_configured",
    threadId: config?.threadId ?? null,
    workspace: config?.workspace ?? resolveFromProject(),
    source: config?.source ?? null,
    connectedAt: config?.connectedAt ?? null,
    expiresAt: config?.expiresAt ?? null,
    expired: config?.status === "expired",
    appServer,
    eventCount: events.length,
    queuedCount: events.filter((event) => event.status === "queued").length,
    waitingCount: events.filter((event) => event.status === "waiting_codex").length,
    bridgeUnavailableCount: events.filter((event) => event.status === "bridge_unavailable").length,
    latestEvent: events.at(-1) ?? null,
  };
}

export async function appendCodexBridgeEvent(input: {
  type: CodexBridgeEventType;
  payload?: Record<string, unknown>;
  status?: CodexBridgeEventStatus;
  taskText?: string;
}): Promise<CodexBridgeEvent> {
  await ensureCodexBridgeFiles();
  const config = await readCodexBridgeConfig();
  const createdAt = new Date().toISOString();
  const hasThread = config?.status === "connected" && Boolean(config.threadId);
  const appServer = config?.appServer ?? defaultAppServerStatus();
  const requestedStatus = input.status ?? "queued";
  const status = hasThread
    ? appServer.available
      ? requestedStatus
      : "queued"
    : "bridge_unavailable";
  const error = !hasThread
    ? bridgeUnavailableReason(config)
    : !appServer.available
      ? "已注册 threadId，但未接入可用 app-server；事件已入队。"
      : undefined;
  const event: CodexBridgeEvent = {
    id: `evt_${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    status,
    createdAt,
    source: "workbench",
    ...(hasThread && config?.threadId ? { threadId: config.threadId } : {}),
    ...(hasThread && config?.threadId ? { targetThreadId: config.threadId } : {}),
    ...(hasThread ? { attemptCount: 0 } : {}),
    payload: input.payload ?? {},
    ...(input.taskText ? { taskText: input.taskText } : {}),
    ...(error ? { error } : {}),
  };
  await fs.appendFile(codexBridgeEventsPath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function updateCodexBridgeEventStatus(
  id: string,
  status: CodexBridgeEventStatus,
  patch: Partial<Pick<CodexBridgeEvent, "error" | "payload" | "taskText" | "targetThreadId" | "sentAt" | "attemptCount">> = {},
): Promise<CodexBridgeEvent | null> {
  const events = await readCodexBridgeEvents();
  let updated: CodexBridgeEvent | null = null;
  const updatedAt = new Date().toISOString();
  const next = events.map((event) => {
    if (event.id !== id) {
      return event;
    }
    updated = {
      ...event,
      ...patch,
      ...(patch.payload ? { payload: { ...event.payload, ...patch.payload } } : {}),
      status,
      updatedAt,
    };
    return updated;
  });
  await fs.writeFile(codexBridgeEventsPath, next.map((event) => JSON.stringify(event)).join("\n") + (next.length > 0 ? "\n" : ""), "utf8");
  return updated;
}

export async function updateCodexBridgeEventForInbox(
  inboxEventId: string,
  status: CodexBridgeEventStatus,
  patch: Partial<Pick<CodexBridgeEvent, "error" | "payload" | "taskText" | "targetThreadId" | "sentAt" | "attemptCount">> = {},
): Promise<CodexBridgeEvent | null> {
  const events = await readCodexBridgeEvents();
  const match = [...events]
    .reverse()
    .find((event) => event.type === "annotation_submitted" && event.payload.inboxEventId === inboxEventId);
  if (!match) {
    return null;
  }
  return updateCodexBridgeEventStatus(match.id, status, patch);
}

export async function appendCodexBridgeReceipt(input: {
  kind: "annotation" | "upload" | "dispatch" | "export" | "playback";
  status: string;
  eventId?: string;
  bridgeEventId?: string;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await fs.mkdir(path.dirname(codexBridgeReceiptsPath), { recursive: true });
  const receipt = {
    time: new Date().toISOString(),
    ...input,
  };
  await fs.appendFile(codexBridgeReceiptsPath, `${JSON.stringify(receipt)}\n`, "utf8");
}

export async function writeCodexBridgeConfig(input: {
  threadId: string;
  source: string;
  workspace?: string;
  ttlMs?: number;
  appServer?: CodexBridgeAppServer;
}): Promise<CodexBridgeConfig> {
  await ensureCodexBridgeFiles();
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new Error("缺少当前 Codex threadId，拒绝写入 bridge 配置。");
  }
  const connectedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? defaultBridgeTtlMs)).toISOString();
  const config: CodexBridgeConfig = {
    threadId,
    workspace: input.workspace ?? resolveFromProject(),
    source: input.source,
    connectedAt,
    expiresAt,
    status: "connected",
    appServer: input.appServer ?? detectAppServer(),
  };
  await fs.writeFile(codexBridgeConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

export async function updateCodexBridgeAppServer(appServer: CodexBridgeAppServer): Promise<CodexBridgeConfig | null> {
  const config = await readCodexBridgeConfig();
  if (!config) {
    return null;
  }
  const next: CodexBridgeConfig = {
    ...config,
    appServer,
  };
  await ensureCodexBridgeFiles();
  await fs.writeFile(codexBridgeConfigPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function createCodexBridgeToken(input: {
  threadId: string;
  source?: string;
  workspace?: string;
  ttlMs?: number;
}): Promise<CodexBridgePendingToken> {
  await ensureCodexBridgeFiles();
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new Error("缺少当前 Codex threadId，拒绝创建 bridge token。");
  }
  const createdAt = new Date().toISOString();
  const tokenRecord: CodexBridgePendingToken = {
    token: crypto.randomBytes(24).toString("base64url"),
    threadId,
    workspace: input.workspace ?? resolveFromProject(),
    source: input.source ?? "url-token",
    createdAt,
    expiresAt: new Date(Date.now() + (input.ttlMs ?? bridgeTokenTtlMs)).toISOString(),
    used: false,
  };
  await fs.appendFile(codexBridgePendingTokensPath, `${JSON.stringify(tokenRecord)}\n`, "utf8");
  return tokenRecord;
}

export async function consumeCodexBridgeToken(token: string): Promise<{
  ok: boolean;
  status: "connected" | "token_invalid" | "token_expired" | "token_used";
  message: string;
  config?: CodexBridgeConfig;
}> {
  await ensureCodexBridgeFiles();
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { ok: false, status: "token_invalid", message: "连接 token 无效，请重新连接。" };
  }
  const tokens = await readCodexBridgePendingTokens();
  const index = tokens.findIndex((item) => item.token === cleanToken);
  if (index < 0) {
    return { ok: false, status: "token_invalid", message: "连接 token 无效，请重新连接。" };
  }
  const pending = tokens[index];
  if (pending.used) {
    return { ok: false, status: "token_used", message: "连接 token 已使用，请重新连接。" };
  }
  if (isExpired(pending.expiresAt)) {
    return { ok: false, status: "token_expired", message: "连接 token 已失效，请重新连接。" };
  }
  const usedAt = new Date().toISOString();
  tokens[index] = { ...pending, used: true, usedAt };
  await fs.writeFile(codexBridgePendingTokensPath, tokens.map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
  const config = await writeCodexBridgeConfig({
    threadId: pending.threadId,
    source: pending.source,
    workspace: pending.workspace,
    appServer: detectAppServer(),
  });
  return { ok: true, status: "connected", message: "已连接 Codex。", config };
}

export function detectAppServer(): CodexBridgeAppServer {
  const endpoint = normalizeOptionalString(process.env.CODEX_APP_SERVER_URL) ?? normalizeOptionalString(process.env.CODEX_APP_SERVER_ENDPOINT);
  if (process.env.CODEX_BRIDGE_ALLOW_MOCK === "1" && (process.env.CODEX_APP_SERVER_TRANSPORT === "mock" || endpoint?.startsWith("mock://"))) {
    return {
      available: true,
      transport: "mock",
      endpoint: endpoint ?? "mock://codex-app-server",
      reason: "显式 mock 模式，仅用于测试，不是真实 Codex app-server。",
    };
  }
  return {
    available: false,
    transport: "none",
    endpoint: endpoint ?? null,
    reason: endpoint
      ? "已发现 endpoint 环境变量，但 v1.6.11.2 不把普通 HTTP endpoint 当作真实 app-server；请运行 JSON-RPC 探测。"
      : "未发现真实 Codex app-server transport；当前只注册 threadId，事件会入队，不标记 sent。",
  };
}

export function annotationTaskText(input: {
  eventId: string;
  slideId: string;
  objectId: string | null;
  selectedText?: string;
  instruction: string;
}): string {
  return [
    "Workbench 收到一条批注，请处理：",
    "",
    `事件 ID：${input.eventId}`,
    `页面：${input.slideId}`,
    `对象：${input.objectId ?? "自由区域/页面"}`,
    `当前文本：${input.selectedText ?? ""}`,
    `用户要求：${input.instruction}`,
    "",
    "请修改 /Users/bruce/Documents/PPT/pptx-workbench/specs/example.deck-spec.yaml。",
    "完成后刷新 Workbench 预览，并把事件状态改为 applied。",
    "如果无法确定如何修改，请在当前对话中提问，不要在网页中假装完成。",
  ].join("\n");
}

export function uploadTaskText(input: { fileName: string; fileSize: number; uploadMode: string }): string {
  return [
    "Workbench 收到一个 PPTX 上传事件：",
    "",
    `文件名：${input.fileName}`,
    `大小：${input.fileSize}`,
    `模式：${input.uploadMode}`,
    "",
    "请在当前对话中询问用户：",
    "这个 PPTX 是用来参考风格、修改原文件、整合进当前作品，还是蒸馏知识？",
    "不要让网页承担这个问答。",
  ].join("\n");
}

function normalizeStoredBridgeEvent(value: unknown): CodexBridgeEvent {
  const record = isRecord(value) ? value : {};
  return {
    id: normalizeRequiredString(record.id, "id"),
    type: normalizeEventType(record.type),
    status: normalizeEventStatus(record.status),
    createdAt: normalizeRequiredString(record.createdAt, "createdAt"),
    updatedAt: normalizeOptionalString(record.updatedAt),
    source: record.source === "codex-thread-bridge" ? "codex-thread-bridge" : "workbench",
    threadId: normalizeOptionalString(record.threadId),
    targetThreadId: normalizeOptionalString(record.targetThreadId),
    sentAt: normalizeOptionalString(record.sentAt),
    attemptCount: typeof record.attemptCount === "number" ? record.attemptCount : undefined,
    payload: isRecord(record.payload) ? record.payload : {},
    taskText: normalizeOptionalString(record.taskText),
    error: normalizeOptionalString(record.error),
  };
}

async function readCodexBridgePendingTokens(): Promise<CodexBridgePendingToken[]> {
  await ensureCodexBridgeFiles();
  const source = await fs.readFile(codexBridgePendingTokensPath, "utf8");
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => normalizePendingToken(JSON.parse(line)));
}

function normalizePendingToken(value: unknown): CodexBridgePendingToken {
  const record = isRecord(value) ? value : {};
  return {
    token: normalizeRequiredString(record.token, "token"),
    threadId: normalizeRequiredString(record.threadId, "threadId"),
    workspace: normalizeOptionalString(record.workspace) ?? resolveFromProject(),
    source: normalizeOptionalString(record.source) ?? "url-token",
    createdAt: normalizeRequiredString(record.createdAt, "createdAt"),
    expiresAt: normalizeRequiredString(record.expiresAt, "expiresAt"),
    used: record.used === true,
    usedAt: normalizeOptionalString(record.usedAt),
  };
}

function normalizeAppServer(value: unknown): CodexBridgeAppServer | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const transport = normalizeOptionalString(value.transport);
  return {
    available: value.available === true,
    transport: transport === "mock" || transport === "auto" || transport === "none" || transport === "stdio" || transport === "unix" || transport === "websocket" ? transport : "none",
    endpoint: normalizeOptionalString(value.endpoint) ?? null,
    reason: normalizeOptionalString(value.reason),
  };
}

function defaultAppServerStatus(): CodexBridgeAppServer {
  return {
    available: false,
    transport: "none",
    endpoint: null,
    reason: "未注册当前 Codex 会话。",
  };
}

function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) {
    return false;
  }
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= Date.now();
}

function bridgeUnavailableReason(config: CodexBridgeConfig | null): string {
  if (!config) {
    return "未连接 Codex：缺少 .codex-bridge/current-thread.json 或 threadId。";
  }
  if (config.status === "expired") {
    return "当前 bridge threadId 已过期，请重新连接。";
  }
  if (!config.threadId) {
    return "未连接 Codex：缺少当前 threadId。";
  }
  return "未连接 Codex：当前 bridge 状态不是 connected。";
}

function normalizeEventType(value: unknown): CodexBridgeEventType {
  const allowed: CodexBridgeEventType[] = [
    "upload_reference",
    "annotation_submitted",
    "revision_requested",
    "undo_completed",
    "redo_completed",
    "export_completed",
    "playback_qa_recorded",
    "audit_failed",
  ];
  return allowed.includes(value as CodexBridgeEventType) ? value as CodexBridgeEventType : "revision_requested";
}

function normalizeEventStatus(value: unknown): CodexBridgeEventStatus {
  const allowed: CodexBridgeEventStatus[] = [
    "queued",
    "sent",
    "waiting_codex",
    "processing",
    "applied",
    "needs_codex",
    "failed",
    "bridge_unavailable",
  ];
  return allowed.includes(value as CodexBridgeEventStatus) ? value as CodexBridgeEventStatus : "queued";
}

function normalizeRequiredString(value: unknown, field: string): string {
  const text = normalizeOptionalString(value);
  if (!text) {
    throw new Error(`Missing required Codex bridge field: ${field}`);
  }
  return text;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
