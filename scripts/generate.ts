import { generateDecks } from "../src/lib/renderDeck.js";
import { ensurePlaybackQaLogFile } from "../src/lib/playbackQa.js";
import { ensureRevisionPlanFile } from "../src/lib/revisionPlan.js";
import { defaultSpecPath, loadDeckSpec } from "../src/lib/specLoader.js";

const specPath = process.argv[2] ?? defaultSpecPath;
const spec = await loadDeckSpec(specPath);
const result = await generateDecks(spec);
await ensureRevisionPlanFile();
await ensurePlaybackQaLogFile();

console.log(JSON.stringify(result, null, 2));
