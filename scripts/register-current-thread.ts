import { detectAppServer, writeCodexBridgeConfig } from "../src/lib/codexBridge.js";

const threadId = currentThreadId();

if (!threadId) {
  console.error(JSON.stringify({
    ok: false,
    status: "missing_thread_id",
    message: "当前环境没有暴露 Codex threadId；拒绝写入假 bridge 配置。",
    expectedEnv: ["CODEX_THREAD_ID", "CODEX_CURRENT_THREAD_ID", "OPENAI_CODEX_THREAD_ID"],
  }, null, 2));
  process.exit(1);
}

const config = await writeCodexBridgeConfig({
  threadId,
  source: process.env.CODEX_BRIDGE_SOURCE ?? "manual-current-thread",
  appServer: detectAppServer(),
});

console.log(JSON.stringify({
  ok: true,
  status: config.appServer?.available ? "connected" : "connected_app_server_unavailable",
  configPath: ".codex-bridge/current-thread.json",
  threadId: config.threadId,
  expiresAt: config.expiresAt,
  appServer: config.appServer,
  message: config.appServer?.available
    ? "已注册当前 Codex 会话。"
    : "已注册 threadId，但未发现真实 Codex app-server transport；事件会入队，不标记 sent。",
}, null, 2));

function currentThreadId(): string | undefined {
  return [
    process.env.CODEX_THREAD_ID,
    process.env.CODEX_CURRENT_THREAD_ID,
    process.env.OPENAI_CODEX_THREAD_ID,
  ].map((value) => value?.trim()).find(Boolean);
}
