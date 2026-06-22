import { probeCodexAppServer, writeCodexAppServerProbeMarkdown } from "../src/lib/codexAppServerClient.js";
import { readCodexBridgeConfig, updateCodexBridgeAppServer } from "../src/lib/codexBridge.js";

const config = await readCodexBridgeConfig();
const threadId = config?.status === "connected" ? config.threadId : undefined;
const probe = await probeCodexAppServer({
  threadId,
  expired: config?.status === "expired",
});
const reportPath = await writeCodexAppServerProbeMarkdown(probe);
const realAvailableAttempt = probe.attempts.find((attempt) => attempt.real && attempt.available && attempt.threadResume?.ok === true);
if (config?.status === "connected") {
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
}

console.log(JSON.stringify({
  ok: true,
  reportPath,
  conclusion: probe.conclusion,
  threadId: probe.threadId,
  attempts: probe.attempts.map((attempt) => ({
    transport: attempt.transport,
    target: attempt.target,
    available: attempt.available,
    real: attempt.real,
    reason: attempt.reason,
    threadResume: attempt.threadResume?.ok ?? null,
    turnStart: attempt.turnStart?.ok ?? null,
  })),
}, null, 2));
