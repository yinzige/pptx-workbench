import { createCodexBridgeToken } from "../src/lib/codexBridge.js";

const threadId = currentThreadId();

if (!threadId) {
  console.error(JSON.stringify({
    ok: false,
    status: "missing_thread_id",
    message: "当前环境没有暴露 Codex threadId；拒绝创建一次性 bridge token。",
    expectedEnv: ["CODEX_THREAD_ID", "CODEX_CURRENT_THREAD_ID", "OPENAI_CODEX_THREAD_ID"],
  }, null, 2));
  process.exit(1);
}

const pending = await createCodexBridgeToken({
  threadId,
  source: process.env.CODEX_BRIDGE_SOURCE ?? "url-token",
});

console.log(JSON.stringify({
  ok: true,
  token: pending.token,
  expiresAt: pending.expiresAt,
  url: `http://127.0.0.1:5173/?bridgeToken=${encodeURIComponent(pending.token)}`,
  message: "已创建一次性 bridge token；10 分钟内使用一次后即失效。",
}, null, 2));

function currentThreadId(): string | undefined {
  return [
    process.env.CODEX_THREAD_ID,
    process.env.CODEX_CURRENT_THREAD_ID,
    process.env.OPENAI_CODEX_THREAD_ID,
  ].map((value) => value?.trim()).find(Boolean);
}
