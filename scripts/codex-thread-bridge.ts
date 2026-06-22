import { dispatchCodexBridgeQueue } from "../src/lib/codexBridgeDispatcher.js";

const limitArgIndex = process.argv.indexOf("--limit");
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 5;
const result = await dispatchCodexBridgeQueue({ limit: Number.isFinite(limit) ? limit : 5 });

console.log(JSON.stringify(result, null, 2));
