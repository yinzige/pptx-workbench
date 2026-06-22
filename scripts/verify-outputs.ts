import fs from "node:fs/promises";
import path from "node:path";
import { auditPptxFile } from "../src/lib/pptxAudit.js";
import { inspectPptxPackage } from "../src/lib/pptxPackage.js";
import { resolveFromProject } from "../src/lib/paths.js";
import { defaultSpecPath, loadDeckSpec } from "../src/lib/specLoader.js";

const outputDir = resolveFromProject("outputs");
const required = [
  "PowerPoint-rich.pptx",
  "WPS-compatible.pptx",
  "motion-plan.yaml",
  "visual-qa.md",
  "playback-qa.md",
  "playback-qa-log.jsonl",
  "delivery-note.md",
  "revision-plan.yaml",
  "preview-parity.md",
  "codex-app-server-probe.md",
];

for (const file of required) {
  const absolutePath = path.join(outputDir, file);
  const stat = await fs.stat(absolutePath);
  if (stat.size <= 0 && file !== "playback-qa-log.jsonl") {
    throw new Error(`Output file is empty: ${absolutePath}`);
  }
  console.log(`${file} ${stat.size} bytes`);
}

const spec = await loadDeckSpec(defaultSpecPath);
const designSystemPath = resolveFromProject("specs", "presentation-design-system.yaml");
const codexInboxPath = resolveFromProject("events", "codex-inbox.jsonl");
await fs.stat(codexInboxPath);
const designSystem = await fs.readFile(designSystemPath, "utf8");
assertContains(designSystem, "schema: pptx-workbench.presentation-design-system.v1", "design system schema");
assertContains(designSystem, "visualStyle:", "design system visual style");
assertContains(designSystem, "typography:", "design system typography");
assertContains(designSystem, "spacing:", "design system spacing");
assertContains(designSystem, "colorTokens:", "design system color tokens");
assertContains(designSystem, "layoutRules:", "design system layout rules");
assertContains(designSystem, "motionRules:", "design system motion rules");
assertContains(designSystem, "compatibilityRules:", "design system compatibility rules");
assertContains(designSystem, "antiPatterns:", "design system anti patterns");
const packageJson = JSON.parse(await fs.readFile(resolveFromProject("package.json"), "utf8")) as { version?: string };
if (packageJson.version !== "1.6.11.2") {
  throw new Error(`package.json version must be 1.6.11.2 for v1.6.11.2; got ${packageJson.version ?? "missing"}`);
}
assertContains(await fs.readFile(resolveFromProject("package.json"), "utf8"), "bridge:register-current", "v1.6.11.2 current thread register script");
assertContains(await fs.readFile(resolveFromProject("package.json"), "utf8"), "bridge:create-token", "v1.6.11.2 bridge token script");
assertContains(await fs.readFile(resolveFromProject("package.json"), "utf8"), "bridge:probe-app-server", "v1.6.11.2 app-server probe script");

const specSource = await fs.readFile(defaultSpecPath, "utf8");
assertContains(spec.title, "v1.6.11.2", "spec v1.6.11.2 title");
assertContains(spec.title, "同源预览", "spec same-source preview sample title");
assertNotContains(specSource, "v0.8 Click-cluster Sample", "old v0.8 sample title");
assertNotContains(specSource, "LOCAL PPTX WORKBENCH · V0.8", "old v0.8 eyebrow");
assertNotContains(specSource, "V1.1", "old v1.1 spec eyebrow");
assertNotContains(specSource, "V1.2", "old v1.2 spec eyebrow");
for (const title of ["封面 / 承诺揭示", "兼容策略", "生成流程", "Rich 与 WPS 对比", "交付建议"]) {
  if (!spec.slides.some((slide) => slide.title === title)) {
    throw new Error(`v1.2 Chinese sample deck is missing slide title: ${title}`);
  }
}

if (spec.slides.length < 3 || spec.slides.length > 5) {
  throw new Error(`v0.8 sample must contain 3-5 slides; got ${spec.slides.length}`);
}

for (const slide of spec.slides) {
  if (!slide.sceneBeats || slide.sceneBeats.length === 0) {
    throw new Error(`Every v0.8 slide must have at least one scene beat: ${slide.id}`);
  }
}

const expectedRichSlides = spec.slides.length;
const totalSceneBeats = spec.slides.reduce((sum, slide) => sum + (slide.sceneBeats?.length ?? 0), 0);
const expectedWpsSlides = expectedRichSlides + totalSceneBeats;

const richPath = path.join(outputDir, "PowerPoint-rich.pptx");
const wpsPath = path.join(outputDir, "WPS-compatible.pptx");
const rich = await inspectPptxPackage(richPath);
const wps = await inspectPptxPackage(wpsPath);

if (rich.slideCount !== expectedRichSlides) {
  throw new Error(`PowerPoint-rich slide count mismatch: expected ${expectedRichSlides}, got ${rich.slideCount}`);
}
if (wps.slideCount !== expectedWpsSlides) {
  throw new Error(`WPS-compatible slide count mismatch: expected ${expectedWpsSlides}, got ${wps.slideCount}`);
}

for (const slide of rich.slides) {
  if (slide.transitionCount < 1) {
    throw new Error(`PowerPoint-rich slide ${slide.slideNumber} must contain p:transition`);
  }
  if (slide.timingCount < 1) {
    throw new Error(`PowerPoint-rich slide ${slide.slideNumber} must contain p:timing`);
  }
  if (slide.animEffectCount < 1) {
    throw new Error(`PowerPoint-rich slide ${slide.slideNumber} must contain p:animEffect`);
  }
  if (slide.clickTriggerCount !== 1) {
    throw new Error(`PowerPoint-rich slide ${slide.slideNumber} must contain exactly one clickEffect trigger; got ${slide.clickTriggerCount}`);
  }
  if (slide.afterEffectCount !== 0) {
    throw new Error(`PowerPoint-rich slide ${slide.slideNumber} must not use afterEffect as a separate timing branch in v0.8; got ${slide.afterEffectCount}`);
  }
  if (slide.withEffectCount < 2) {
    throw new Error(`PowerPoint-rich slide ${slide.slideNumber} must bind callout and orange bar as automatic withEffect children; got ${slide.withEffectCount}`);
  }
  const uniqueSlideTargets = new Set(slide.timingTargets.map((target) => target.shapeId));
  if (uniqueSlideTargets.size < 2) {
    throw new Error(`PowerPoint-rich slide ${slide.slideNumber} must target at least two shapes in one click cluster; got ${uniqueSlideTargets.size}`);
  }
  const missingTargets = slide.timingTargets.filter((target) => !target.exists);
  if (missingTargets.length > 0) {
    throw new Error(`PowerPoint-rich slide ${slide.slideNumber} timing target shape ids are missing: ${JSON.stringify(missingTargets)}`);
  }
}

for (const slide of wps.slides) {
  if (slide.transitionCount < 1) {
    throw new Error(`WPS-compatible slide ${slide.slideNumber} must contain p:transition`);
  }
}

if (rich.timingCount < expectedRichSlides) {
  throw new Error(`PowerPoint-rich must contain timing on multiple slides; expected at least ${expectedRichSlides}, got ${rich.timingCount}`);
}
if (rich.animEffectCount < expectedRichSlides) {
  throw new Error(`PowerPoint-rich must contain multiple p:animEffect nodes; expected at least ${expectedRichSlides}, got ${rich.animEffectCount}`);
}
const uniqueRichTargetIds = new Set(rich.timingTargets.map((target) => `${target.slideEntry}:${target.shapeId}`));
if (uniqueRichTargetIds.size < expectedRichSlides) {
  throw new Error(`PowerPoint-rich must target at least one shape per slide; got ${uniqueRichTargetIds.size} unique slide/shape targets`);
}

const motionPlan = await fs.readFile(path.join(outputDir, "motion-plan.yaml"), "utf8");
const visualQa = await fs.readFile(path.join(outputDir, "visual-qa.md"), "utf8");
const playbackQa = await fs.readFile(path.join(outputDir, "playback-qa.md"), "utf8");
const deliveryNote = await fs.readFile(path.join(outputDir, "delivery-note.md"), "utf8");
const revisionPlan = await fs.readFile(path.join(outputDir, "revision-plan.yaml"), "utf8");
const previewParity = await fs.readFile(path.join(outputDir, "preview-parity.md"), "utf8");

assertContains(revisionPlan, "schema: pptx-workbench.revision-plan.v1", "revision-plan schema");
assertContains(revisionPlan, "projectName:", "revision-plan projectName");
assertContains(revisionPlan, "specPath:", "revision-plan specPath");
assertContains(revisionPlan, "auditFile:", "revision-plan auditFile");
assertContains(revisionPlan, "generatedAt:", "revision-plan generatedAt");
assertContains(revisionPlan, "status: draft", "revision-plan draft status");
assertContains(revisionPlan, "goals:", "revision-plan goals");
assertContains(revisionPlan, "actions:", "revision-plan actions");

assertContains(previewParity, "# Preview Parity Checklist", "preview parity title");
assertContains(previewParity, "Version: v1.6.11.2", "preview parity version");
assertContains(previewParity, "Renderer contract", "preview parity renderer contract");
assertContains(previewParity, "Per-slide element checklist", "preview parity per-slide checklist");
assertContains(previewParity, "web_preview_supported", "preview parity web support column");
assertContains(previewParity, "pptx_export_supported", "preview parity pptx support column");
assertContains(previewParity, "hiddenUntilBeat", "preview parity hiddenUntilBeat column");
for (const slide of spec.slides) {
  assertContains(previewParity, `### ${slide.id}`, `preview parity slide ${slide.id}`);
  for (const layer of slide.layers) {
    for (const element of layer.elements) {
      assertContains(previewParity, element.id, `preview parity element ${slide.id}/${element.id}`);
    }
  }
}

assertContains(motionPlan, "schema: pptx-workbench.motion-plan.v0.8", "motion-plan v0.8 schema");
assertContains(motionPlan, "sampleType: multi-page-playback-sample", "motion-plan multi-page sample marker");
assertContains(motionPlan, `slideCount: ${expectedRichSlides}`, "motion-plan slide count");
assertContains(motionPlan, `sceneBeatCount: ${totalSceneBeats}`, "motion-plan scene beat count");
assertContains(motionPlan, `expectedSlideCount: ${expectedWpsSlides}`, "motion-plan WPS expected slide count");
assertContains(motionPlan, "sceneBeats:", "motion-plan sceneBeats section");
assertContains(motionPlan, "nativeObjectTiming:", "motion-plan nativeObjectTiming section");
assertContains(motionPlan, "clickClusters:", "motion-plan clickClusters section");
assertContains(motionPlan, "orchestration: parallel-with-light-stagger", "PowerPoint-rich cluster parallel/stagger plan");
assertContains(motionPlan, "orchestration: state-page-transition", "WPS-compatible state-page cluster plan");
assertContains(motionPlan, "degradationStrategy:", "motion-plan degradation strategy");
assertContains(motionPlan, "v0.8ClickClusterContract:", "v0.8 click cluster contract");
assertContains(motionPlan, "requiredClickTriggerCountPerSlide: 1", "v0.8 click trigger count contract");
assertContains(motionPlan, "requiredClusterBinding: callout and orange bar share the same click-triggered parent", "v0.8 shared parent contract");
assertContains(motionPlan, "orangeBarFollowMode: automatic-withEffect-child-delay", "v0.8 orange bar automatic follow mode");
assertContains(motionPlan, "secondClickRequired: fail", "v0.8 second click failure condition");
assertContains(motionPlan, "v0.8RichVisibilityContract:", "v0.8 visibility contract");
assertContains(motionPlan, "preClickState:", "pre-click state");
assertContains(motionPlan, "postClickState:", "post-click state");
assertContains(motionPlan, "targetDurationMs: 1100", "1100ms animation duration");
assertContains(motionPlan, "visibleChangeStandard:", "visible change standard");
assertContains(motionPlan, "powerpointAnimationPaneStatus: recognized-by-user-in-PowerPoint", "PowerPoint animation pane recognition");
assertContains(motionPlan, "compatibilityMatrix:", "motion-plan compatibility matrix");
assertContains(motionPlan, "wpsSupportPromise: none-for-rich-object-animation", "WPS rich non-support promise");
assertContains(motionPlan, "keynoteStatus: pass-same-as-PowerPoint", "Keynote compatibility status");
assertContains(motionPlan, "wpsRichStatus: fail-use-WPS-compatible", "WPS rich failure status");
assertContains(motionPlan, "status: fail-rich-standard", "WPS rich fail-rich-standard status");
assertContains(motionPlan, "fallback: safest single-file delivery when client software is unknown", "safe single-file fallback");
assertContains(motionPlan, "syncRole: accent-highlight-bar", "highlight sync role");

const requiredPlaybackFields = [
  "status: manual_pending",
  "validation_mode:",
  "manual_or_auto_acceptance_status:",
  "## v0.8 multi-page playback scope",
  "## v0.7 regression addressed in v0.8",
  "v0.8 fix: callout and orange bar are generated under the same click-triggered parent",
  "if a second click is needed for the orange bar, the Rich file fails",
  "## Per-page playback expectations",
  "click_trigger_count",
  "second_click_required",
  "## Real playback acceptance table",
  "Microsoft PowerPoint",
  "WPS",
  "Apple Keynote",
  "opens_without_repair",
  "can_play",
  "click_count",
  "visible_change_after_click",
  "auto_complete",
  "needs_rapid_clicking",
  "needs_long_press",
  "empty_wait_detected",
  "object_drift_detected",
  "validation_status",
  "manual_pending",
  "PowerPoint animation pane status: user confirmed",
  "v0.5 manual compatibility conclusion: PowerPoint-rich passes in Microsoft PowerPoint and Apple Keynote, but fails the Rich standard in WPS.",
  "v0.5 manual compatibility conclusion: WPS-compatible passes in WPS and Microsoft PowerPoint.",
  "Microsoft PowerPoint / Apple Keynote: use `PowerPoint-rich.pptx`.",
  "WPS / uncertain playback environment / external stable delivery: use `WPS-compatible.pptx`.",
  "If only one file can be delivered, default to `WPS-compatible.pptx`.",
  "Do not recommend opening `PowerPoint-rich.pptx` in WPS.",
  "## Manual playback script",
  "## Acceptance record template",
  "## v0.5 confirmed compatibility matrix",
  "PowerPoint-rich.pptx | Microsoft PowerPoint | pass",
  "PowerPoint-rich.pptx | Apple Keynote | pass",
  "PowerPoint-rich.pptx | WPS | fail-rich-standard",
  "WPS-compatible.pptx | WPS | pass",
  "WPS-compatible.pptx | Microsoft PowerPoint | pass",
];
for (const field of requiredPlaybackFields) {
  assertContains(playbackQa, field, `playback QA field ${field}`);
}

const requiredVisualFields = [
  "# Visual QA",
  "Version: v0.8 multi-page click-cluster sample",
  "## Per-slide static QA",
  "manual_layout_review_pending",
  "not final cinematic design polish",
];
for (const field of requiredVisualFields) {
  assertContains(visualQa, field, `visual QA field ${field}`);
}

const requiredDeliveryFields = [
  "# PPTX Workbench Delivery Note",
  "Version: v0.8 multi-page click-cluster sample",
  "This delivery contains a 5-page sample deck.",
  "Microsoft PowerPoint",
  "Apple Keynote",
  "WPS",
  "`PowerPoint-rich.pptx` is for Microsoft PowerPoint and Apple Keynote.",
  "`PowerPoint-rich.pptx` is not recommended for WPS.",
  "`WPS-compatible.pptx` is for WPS, uncertain playback environments, and external stable delivery.",
  "If the customer only allows one file, deliver `WPS-compatible.pptx` by default.",
];
for (const field of requiredDeliveryFields) {
  assertContains(deliveryNote, field, `delivery note field ${field}`);
}

const serverSource = await fs.readFile(resolveFromProject("src", "server.ts"), "utf8");
const clientSource = await fs.readFile(resolveFromProject("src", "client", "main.ts"), "utf8");
const styleSource = await fs.readFile(resolveFromProject("src", "client", "styles.css"), "utf8");
const readmeSource = await fs.readFile(resolveFromProject("README.md"), "utf8");
const exportManagerSource = await fs.readFile(resolveFromProject("src", "lib", "exportManager.ts"), "utf8");
const auditSource = await fs.readFile(resolveFromProject("src", "lib", "pptxAudit.ts"), "utf8");
const revisionPlanSource = await fs.readFile(resolveFromProject("src", "lib", "revisionPlan.ts"), "utf8");
const codexInboxSource = await fs.readFile(resolveFromProject("src", "lib", "codexInbox.ts"), "utf8");
const codexBridgeSource = await fs.readFile(resolveFromProject("src", "lib", "codexBridge.ts"), "utf8");
const codexAppServerClientSource = await fs.readFile(resolveFromProject("src", "lib", "codexAppServerClient.ts"), "utf8");
const codexBridgeDispatcherSource = await fs.readFile(resolveFromProject("src", "lib", "codexBridgeDispatcher.ts"), "utf8");
const codexBridgeScriptSource = await fs.readFile(resolveFromProject("scripts", "codex-thread-bridge.ts"), "utf8");
const codexProbeScriptSource = await fs.readFile(resolveFromProject("scripts", "probe-codex-app-server.ts"), "utf8");
const uploadRegistrySource = await fs.readFile(resolveFromProject("src", "lib", "uploadRegistry.ts"), "utf8");
const undoManagerSource = await fs.readFile(resolveFromProject("src", "lib", "undoManager.ts"), "utf8");
const codexQueueSource = await fs.readFile(resolveFromProject("src", "lib", "codexQueue.ts"), "utf8");
assertContains(serverSource, "/api/audit-pptx", "audit PPTX API route");
assertContains(serverSource, "/api/verify", "verify summary API route");
assertContains(serverSource, "/api/export", "desktop export API route");
assertContains(serverSource, "/api/workbench-state", "workbench state API route");
assertContains(serverSource, "/api/playback-qa", "playback QA API route");
assertContains(serverSource, "/api/playback-qa/session", "playback QA session API route");
assertContains(serverSource, "/api/upload-reference", "v1.6.11.2 upload reference API route");
assertContains(serverSource, "/api/upload-reference/metadata", "v1.6.11.2 large upload metadata API route");
assertContains(serverSource, 'limit: "50mb"', "v1.6.11.2 upload raw route stays under 50mb");
assertContains(serverSource, "/api/codex-queue/process", "v1.6.11.2 Codex queue API route");
assertContains(serverSource, "appendUploadIntent", "v1.6.11.2 upload intent event writer");
assertContains(serverSource, "uploadIntent", "v1.6.11.2 workbench state upload intent path");
assertContains(serverSource, "/api/undo", "v1.6.11.2 undo API route");
assertContains(serverSource, "/api/redo", "v1.6.11.2 redo API route");
assertContains(serverSource, "/api/revision-plan", "revision plan API route");
assertContains(serverSource, "/api/revision-plan/from-audit", "revision plan from audit API route");
assertContains(serverSource, "/api/revision-plan/action", "manual revision action API route");
assertContains(serverSource, "/api/codex-inbox", "Codex inbox API route");
assertContains(serverSource, "/api/codex-bridge", "v1.6.11.2 Codex bridge API route");
assertContains(serverSource, "/api/codex-bridge/connect-token", "v1.6.11.2 Codex bridge token connect route");
assertContains(serverSource, "/api/codex-bridge/dispatch", "v1.6.11.2 Codex bridge dispatch route");
assertContains(serverSource, "appendCodexBridgeEvent", "v1.6.11.2 unified bridge event writer");
assertContains(serverSource, "appendCodexBridgeReceipt", "v1.6.11.2 bridge receipt writer");
assertContains(serverSource, "dispatchCodexBridgeQueue", "v1.6.11.2 bridge dispatch from upload and open-ended annotations");
assertContains(serverSource, "autoRegisterCurrentThreadFromEnvironment", "v1.6.11.2 server startup binds current Codex thread");
assertContains(serverSource, "server-env-current-thread", "v1.6.11.2 server env bridge source");
assertContains(serverSource, "codexBridge,", "v1.6.11.2 workbench state Codex bridge summary");
assertContains(serverSource, "appendCodexInboxEvent", "Codex inbox append route");
assertContains(serverSource, "codexInbox:", "workbench state Codex inbox summary");
assertContains(serverSource, "lastUploadedAudit", "last uploaded audit cache");
assertContains(serverSource, "rootPath is not supported", "export rejects rootPath");
assertContains(serverSource, "createLockedExport", "locked export helper use");
assertContains(serverSource, "readLastExportHistory", "workbench state reads export history");
assertContains(serverSource, "lockedRoot", "workbench state locked root response");
assertContains(serverSource, "lastExportDir", "workbench state last export response");
assertContains(serverSource, "sceneBeatCount", "workbench state scene beat count");
assertContains(serverSource, "revisionPlan:", "v1.6 workbench state revisionPlan summary");
assertContains(serverSource, "currentPreview:", "v1.6 workbench state preview capability summary");
assertContains(serverSource, "playback:", "v1.6 workbench state playback capability summary");
assertContains(serverSource, "overlayDefaults", "v1.6 workbench state overlay defaults");
assertContains(serverSource, "writesDisk: true", "v1.6.11.2 playback QA writes disk");
assertContains(serverSource, "designSystem:", "v1.6.11.2 workbench state design system summary");
assertContains(serverSource, "lastExportMatchesProject", "v1.6.11.2 export history match status");
assertContains(serverSource, "historical-export", "v1.6.11.2 historical export status");
assertContains(serverSource, "syncRevisionPlanProject", "v1.6.11.2 revision plan project sync");
assertContains(serverSource, "generateDecks(spec)", "v1.6.11.2 export regenerates before copy");
assertContains(exportManagerSource, 'exportRootDir = "/Users/bruce/Desktop/PPT"', "locked export root");
assertContains(exportManagerSource, 'defaultProjectName = "测试-v1.6.11.2"', "default v1.6 project name");
assertContains(exportManagerSource, "exportHistoryPath", "export history path");
assertContains(exportManagerSource, "export-history.jsonl", "export history JSONL file");
assertContains(exportManagerSource, "appendExportHistory", "export history append helper");
assertContains(exportManagerSource, "readLastExportHistory", "export history read helper");
assertContains(exportManagerSource, "sanitizeFileName", "filename sanitization");
assertContains(exportManagerSource, "defaultFolderName", "default folder name helper");
assertContains(exportManagerSource, "dateStamp", "YYYYMMDD date helper");
assertContains(exportManagerSource, "pptxFileNames", "project-derived PPTX file names");
assertContains(exportManagerSource, "PowerPoint.pptx", "PowerPoint filename suffix");
assertContains(exportManagerSource, "兼容.pptx", "compatible filename suffix");
assertContains(exportManagerSource, "folderName}(${index})", "duplicate folder suffix");
assertContains(exportManagerSource, "isInsideRoot", "export path traversal guard");
assertNotContains(exportManagerSource, "rootPath", "export helper rootPath support");
assertContains(uploadRegistrySource, "large-file-audit", "v1.6.11.2 large file audit mode");
assertContains(uploadRegistrySource, "50 * 1024 * 1024", "v1.6.11.2 upload split threshold");
assertContains(undoManagerSource, "const maxUndo = 100", "v1.6.11.2 max undo stack");
assertContains(undoManagerSource, "redoStackDir", "v1.6.11.2 redo stack");
assertContains(undoManagerSource, "createUndoSnapshotInternal", "v1.6.11.2 redo does not clear redo stack before restore");
assertContains(codexQueueSource, "createUndoSnapshot", "v1.6.11.2 Codex queue creates undo snapshot");
assertContains(codexQueueSource, "applyDeterministicEdit", "v1.6.11.2 Codex queue deterministic edits");
assertContains(codexQueueSource, "删除句号", "v1.6.11.2 Codex queue supports period deletion");
assertContains(codexQueueSource, "needs-codex", "v1.6.11.2 Codex queue does not fake design edits");
assertContains(codexQueueSource, "afterSpec === beforeSpec", "v1.6.11.2 Codex queue rejects empty diff");
assertNotContains(codexQueueSource, "codexNotes", "v1.6.11.2 Codex queue must not fake process by notes only");
await fs.stat(resolveFromProject("src", "lib", "uploadIntent.ts"));
await fs.stat(resolveFromProject("src", "lib", "codexBridge.ts"));
await fs.stat(resolveFromProject("src", "lib", "codexBridgeDispatcher.ts"));
await fs.stat(resolveFromProject("src", "lib", "codexAppServerClient.ts"));
await fs.stat(resolveFromProject("scripts", "codex-thread-bridge.ts"));
await fs.stat(resolveFromProject("scripts", "probe-codex-app-server.ts"));
await fs.stat(resolveFromProject("scripts", "register-current-thread.ts"));
await fs.stat(resolveFromProject("scripts", "create-bridge-token.ts"));
await fs.stat(resolveFromProject("specs", "native-animation-catalog.yaml"));
await fs.stat(resolveFromProject("specs", "reference-style.yaml"));
await fs.stat(resolveFromProject("specs", "template-patterns.yaml"));
await fs.stat(resolveFromProject("specs", "motion-patterns.yaml"));
await fs.stat(resolveFromProject("specs", "asset-board.yaml"));
assertContains(revisionPlanSource, "revisionPlanPath", "revision plan output path");
assertContains(revisionPlanSource, "outputs\", \"revision-plan.yaml", "revision plan YAML path");
assertContains(revisionPlanSource, "createRevisionPlanFromAudit", "revision plan from audit helper");
assertContains(revisionPlanSource, "appendUserRevisionAction", "revision action append helper");
assertContains(revisionPlanSource, "source: \"audit-recommendation\"", "audit recommendation source");
assertContains(revisionPlanSource, "source: \"user-comment\"", "user comment source");
assertContains(revisionPlanSource, "status: \"todo\"", "revision action todo status");
assertContains(revisionPlanSource, "objectId", "v1.6.11.2 revision action objectId");
assertContains(revisionPlanSource, "objectRole", "v1.6.11.2 revision action objectRole");
assertContains(codexInboxSource, 'resolveFromProject("events", "codex-inbox.jsonl")', "Codex inbox JSONL path");
assertContains(codexInboxSource, "selectedSlideId", "Codex inbox selected slide field");
assertContains(codexInboxSource, "selectedObjectId", "Codex inbox selected object field");
assertContains(codexInboxSource, "selectedObjectType", "Codex inbox selected object type field");
assertContains(codexInboxSource, "selectionBounds", "Codex inbox selection bounds field");
assertContains(codexInboxSource, "userInstruction", "Codex inbox instruction field");
assertContains(codexInboxSource, "scope", "Codex inbox scope field");
assertContains(codexInboxSource, "createdAt", "Codex inbox createdAt field");
assertContains(codexBridgeSource, 'resolveFromProject("events", "codex-events.jsonl")', "v1.6.11.2 Codex bridge JSONL path");
assertContains(codexBridgeSource, 'resolveFromProject("outputs", "codex-bridge-receipts.jsonl")', "v1.6.11.2 Codex bridge receipt path");
assertContains(codexBridgeSource, 'resolveFromProject(".codex-bridge", "current-thread.json")', "v1.6.11.2 current thread config path");
assertContains(codexBridgeSource, 'resolveFromProject(".codex-bridge", "pending-tokens.jsonl")', "v1.6.11.2 pending bridge token path");
assertContains(codexBridgeSource, "createCodexBridgeToken", "v1.6.11.2 one-time bridge token creator");
assertContains(codexBridgeSource, "consumeCodexBridgeToken", "v1.6.11.2 one-time bridge token consumer");
assertContains(codexBridgeSource, "updateCodexBridgeAppServer", "v1.6.11.2 app-server probe writes current bridge status");
assertContains(codexBridgeSource, "expiresAt", "v1.6.11.2 bridge expiry field");
assertContains(codexBridgeSource, "used: true", "v1.6.11.2 token single-use marker");
assertContains(codexBridgeSource, "detectAppServer", "v1.6.11.2 app-server detection");
assertContains(codexBridgeSource, "CODEX_BRIDGE_ALLOW_MOCK", "v1.6.11.2 mock app-server requires explicit opt-in");
assertContains(codexBridgeSource, "不把普通 HTTP endpoint 当作真实 app-server", "v1.6.11.2 does not treat guessed HTTP endpoint as real app-server");
assertContains(codexAppServerClientSource, "JSON-RPC", "v1.6.11.2 app-server JSON-RPC client");
assertContains(codexAppServerClientSource, "codex app-server --stdio", "v1.6.11.2 stdio app-server transport");
assertContains(codexAppServerClientSource, "thread/resume", "v1.6.11.2 thread resume method");
assertContains(codexAppServerClientSource, "turn/start", "v1.6.11.2 turn start method");
assertContains(codexAppServerClientSource, "text_elements: []", "v1.6.11.2 turn/start matches generated schema text input");
assertContains(codexAppServerClientSource, "outputs\", \"codex-app-server-probe.md", "v1.6.11.2 app-server probe report path");
assertContains(codexAppServerClientSource, "experimental / unsupported", "v1.6.11.2 websocket limitation note");
assertContains(codexProbeScriptSource, "probeCodexAppServer", "v1.6.11.2 probe script");
assertContains(codexProbeScriptSource, "updateCodexBridgeAppServer", "v1.6.11.2 probe updates UI bridge status");
assertContains(codexBridgeDispatcherSource, "sendWorkbenchEventToCodexAppServer", "v1.6.11.2 bridge uses JSON-RPC app-server client");
assertContains(codexBridgeDispatcherSource, "updateCodexBridgeAppServer", "v1.6.11.2 bridge updates UI bridge status");
assertContains(codexBridgeDispatcherSource, "targetThreadId", "v1.6.11.2 bridge records target thread");
assertContains(codexBridgeDispatcherSource, "sentAt", "v1.6.11.2 bridge records sentAt");
assertContains(codexBridgeDispatcherSource, "attemptCount", "v1.6.11.2 bridge records attempt count");
assertContains(codexBridgeSource, "bridge_unavailable", "v1.6.11.2 bridge unavailable status");
assertContains(codexBridgeSource, "waiting_codex", "v1.6.11.2 waiting Codex status");
assertContains(codexBridgeSource, "annotation_submitted", "v1.6.11.2 annotation bridge event type");
assertContains(codexBridgeSource, "upload_reference", "v1.6.11.2 upload bridge event type");
assertContains(codexBridgeSource, "updateCodexBridgeEventForInbox", "v1.6.11.2 annotation result updates matching bridge event");
assertContains(codexBridgeSource, "appendCodexBridgeReceipt", "v1.6.11.2 bridge receipt append helper");
assertContains(codexBridgeDispatcherSource, "dispatchCodexBridgeQueue", "v1.6.11.2 shared bridge dispatcher");
assertContains(codexBridgeDispatcherSource, "eventIds", "v1.6.11.2 dispatcher can target current bridge event");
assertContains(codexBridgeDispatcherSource, "inboxEventId", "v1.6.11.2 dispatcher can target current annotation event");
assertContains(codexBridgeDispatcherSource, "sendWorkbenchEventToCodexAppServer", "v1.6.11.2 dispatcher sends via app-server");
assertContains(codexBridgeDispatcherSource, "attemptCount >= 3", "v1.6.11.2 dispatcher caps retries");
assertContains(codexBridgeScriptSource, "dispatchCodexBridgeQueue", "v1.6.11.2 bridge CLI uses shared dispatcher");
assertContains(clientSource, "项目", "v1.4 project navigation");
assertContains(clientSource, "预览", "v1.4 preview navigation");
assertContains(clientSource, "审计", "v1.4 audit navigation");
assertContains(clientSource, "导出", "v1.4 export navigation");
assertContains(clientSource, "Codex", "v1.4 Codex navigation");
assertNotContains(clientSource, "<button type=\"button\">文件</button>", "removed fake PowerPoint File menu");
assertNotContains(clientSource, "<button type=\"button\" class=\"active\">开始</button>", "removed fake PowerPoint Home tab");
assertNotContains(clientSource, "<button type=\"button\">插入</button>", "removed fake PowerPoint Insert tab");
assertNotContains(clientSource, "<button type=\"button\">设计</button>", "removed fake PowerPoint Design tab");
assertNotContains(clientSource, "<button type=\"button\">切换</button>", "removed fake PowerPoint Transition tab");
assertNotContains(clientSource, "<button type=\"button\">审阅</button>", "removed fake PowerPoint Review tab");
assertContains(clientSource, 'id="upload-reference-trigger"', "v1.6.11.2 top-level upload action");
assertContains(clientSource, ">上传</button>", "v1.6.11.2 upload button label");
assertNotContains(clientSource, 'id="generate"', "v1.6.11.2 removes top-level generate button");
assertContains(clientSource, "兼容性检查", "Chinese compatibility check action");
assertContains(clientSource, "导出", "Chinese export action");
assertContains(clientSource, "更多", "Chinese more action");
assertContains(clientSource, "批注", "Chinese annotation action");
assertContains(clientSource, "批注中", "Chinese annotating state");
assertContains(clientSource, "添加批注或修改要求", "annotation hover text");
assertContains(clientSource, "当前页：", "top current slide indicator");
assertContains(clientSource, "codex-bridge-status", "v1.6.11.2 top Codex bridge status");
assertContains(clientSource, "未连接 Codex", "v1.6.11.2 disconnected Codex status copy");
assertContains(clientSource, "已连接 Codex", "v1.6.11.2 connected Codex status copy");
assertContains(clientSource, "Codex 桥接不可用，事件已排队", "v1.6.11.2 bridge unavailable queued copy");
assertContains(clientSource, "连接 token 已失效，请重新连接", "v1.6.11.2 expired token status copy");
assertContains(clientSource, "已注册会话，未发现 app-server", "v1.6.11.2 app-server unavailable copy");
assertContains(clientSource, "/api/codex-bridge/connect-token", "v1.6.11.2 frontend consumes bridge token");
assertContains(clientSource, 'class="toolbar-right"', "top right action container");
assertContains(clientSource, 'id="annotation-toggle"', "top right annotation button");
assertNotContains(clientSource, '<div class="preview-toolbar"', "main preview state toolbar");
assertNotContains(clientSource, "继续播放", "bottom continue playback action");
if ((clientSource.match(/id="playback-top"/g) ?? []).length !== 1) {
  throw new Error("v1.6.11.2 must expose exactly one top-level playback entry");
}
assertContains(clientSource, "/api/export", "desktop export frontend call");
assertContains(clientSource, "项目名", "project name UI");
assertContains(clientSource, "测试-v1.6.11.2", "default project name UI");
assertContains(clientSource, "修改", "edit project name UI");
assertContains(clientSource, "type ThemeMode", "v1.4.3 theme mode type");
assertContains(clientSource, "themeMode", "v1.4.3 theme state");
assertContains(clientSource, "data-theme-mode", "v1.4.3 theme data attribute");
assertContains(clientSource, "跟随系统", "v1.4.3 system theme label");
assertContains(clientSource, "浅色", "v1.4.3 light theme label");
assertContains(clientSource, "深色", "v1.4.3 dark theme label");
assertContains(clientSource, "project-name-popover", "v1.4.3 visible project name editor");
assertContains(clientSource, "project-name-input", "v1.4.3 project name input");
assertContains(clientSource, "导出弹窗、PPTX 文件名和 Codex 面板已同步", "v1.4.3 project name sync QA log");
assertNotContains(clientSource, "window.prompt", "project name edit must not use browser prompt");
assertContains(clientSource, "/api/revision-plan", "revision plan frontend GET");
assertContains(clientSource, "/api/revision-plan/from-audit", "revision plan from audit frontend POST");
assertContains(clientSource, "/api/codex-inbox", "Codex inbox frontend POST");
assertContains(clientSource, "生成改稿计划", "generate revision plan action");
assertContains(clientSource, "events/codex-inbox.jsonl", "Codex inbox prompt path");
assertContains(clientSource, "bridge 队列", "v1.6.11.2 annotation writes bridge queue copy");
assertContains(clientSource, "selectedSlideId", "annotation selectedSlideId field");
assertContains(clientSource, "selectedObjectId", "annotation selectedObjectId field");
assertContains(clientSource, "selectedObjectType", "annotation selectedObjectType field");
assertContains(clientSource, "selectionBounds", "annotation selectionBounds field");
assertContains(clientSource, "userInstruction", "annotation userInstruction field");
assertContains(clientSource, 'scope: "object"', "object-level annotation scope");
assertContains(clientSource, 'scope: "region"', "region annotation scope");
assertContains(clientSource, "Ask Codex", "object annotation Ask Codex capsule");
assertContains(clientSource, "type AnnotationMode", "v1.6.11.2 annotation mode type");
assertContains(clientSource, "annotationMode", "v1.6.11.2 annotation mode state");
assertContains(clientSource, "annotation-mode-toggle", "v1.6.11.2 annotation secondary mode button");
assertContains(clientSource, "自由批注", "v1.6.11.2 free annotation mode label");
assertContains(clientSource, "annotation-drag-region", "free region drag annotation overlay");
assertContains(clientSource, "candidateObjectIds", "region annotation candidate object ids");
assertContains(clientSource, 'method: "DELETE"', "pending annotation delete API call");
assertContains(clientSource, "描述要修改的内容，或提出问题。", "object annotation placeholder");
assertContains(clientSource, "annotation-selection", "annotation selection overlay");
assertContains(clientSource, "annotation-composer", "annotation composer");
assertContains(clientSource, "renderCodexInboxList", "bottom Codex inbox list");
assertContains(clientSource, "/api/codex-queue/process", "v1.6.11.2 Codex queue process API");
assertNotContains(clientSource, "让 Codex 处理", "v1.6.11.2 annotation processing is automatic");
assertContains(clientSource, "await processCodexQueue()", "v1.6.11.2 annotation submit auto-processes queue");
assertContains(clientSource, "需要 Codex 处理", "v1.6.11.2 design edits are not fake processed");
assertContains(clientSource, "已发送到当前 Codex 对话", "v1.6.11.2 open-ended annotation dispatch feedback");
assertContains(clientSource, "等待 Codex 在对话中确认用途", "v1.6.11.2 upload waits for Codex conversation");
assertContains(clientSource, "已上传，并已发送到当前 Codex 对话确认用途", "v1.6.11.2 upload dispatch feedback");
assertNotContains(clientSource, "已写入 events/upload-intent.jsonl；等待用户选择", "v1.6.11.2 upload event path is not main UI copy");
assertContains(clientSource, "撤销 0 / 100", "v1.6.11.2 always-visible undo action");
assertContains(clientSource, "返回 0", "v1.6.11.2 always-visible redo action");
assertContains(clientSource, "/api/undo", "v1.6.11.2 undo API frontend call");
assertContains(clientSource, "/api/redo", "v1.6.11.2 redo API frontend call");
assertContains(clientSource, "/api/upload-reference/metadata", "v1.6.11.2 large upload metadata route");
assertContains(clientSource, "largePptxThresholdBytes", "v1.6.11.2 frontend upload size split");
assertContains(clientSource, "锁定导出", "locked export dialog");
assertContains(clientSource, "导出文件夹名", "export folder name input");
assertContains(clientSource, "lockedExportRoot", "locked export root preview");
assertContains(clientSource, "projectName", "export projectName body");
assertContains(clientSource, "folderName", "export folderName body");
assertContains(clientSource, "PowerPoint.pptx", "frontend PowerPoint filename preview");
assertContains(clientSource, "兼容.pptx", "frontend compatible filename preview");
assertNotContains(clientSource, "导入 PPTX 审计", "v1.6.11.2 UI cleanup removes old audit menu action");
assertNotContains(clientSource, "上传 PPTX 审计", "v1.6.11.2 UI cleanup removes old upload audit copy");
assertContains(clientSource, '<div class="toolbar-right">', "v1.6.11.2 right toolbar contains annotation and history actions");
assertContains(clientSource, 'id="undo-action"', "v1.6.11.2 undo action remains visible");
assertContains(clientSource, 'id="redo-action"', "v1.6.11.2 redo action remains visible");
assertContains(clientSource, "/api/audit-pptx", "audit PPTX frontend call");
assertContains(clientSource, "页面状态", "v1.4 Page State panel");
assertContains(clientSource, "动画与兼容", "v1.4 Motion and Compatibility panel");
assertContains(clientSource, "审计建议", "v1.4 Audit Recommendations panel");
assertContains(clientSource, "Codex 任务", "v1.4 Codex Task panel");
assertContains(clientSource, "tech-console", "v1.4.1 tech console shell");
assertContains(clientSource, "交付摘要", "v1.6.11.2 delivery summary card");
assertContains(clientSource, "delivery-control", "v1.4.1 delivery control class");
assertContains(clientSource, "severity-badge", "v1.4.1 audit severity badges");
assertContains(clientSource, "risk-badge", "v1.4.1 risk badges");
assertContains(clientSource, "animation-timeline", "v1.6 motion animation timeline");
assertNotContains(clientSource, "Codex 上下文", "v1.6.11.2 hides copyable Codex context from main flow");
assertNotContains(clientSource, "复制提示词", "v1.6.11.2 hides copy prompt from main flow");
assertContains(clientSource, "/api/workbench-state", "v1.4 workbench state frontend call");
assertContains(clientSource, "toggle-slide-nav", "v1.4 collapsible slide nav");
assertContains(clientSource, "toggle-inspector", "v1.4 collapsible inspector");
assertContains(clientSource, "restore-slide-nav", "v1.4.3 slide nav restore tab");
assertContains(clientSource, "restore-inspector", "v1.4.3 inspector restore tab");
assertContains(clientSource, "幻灯片", "v1.4.3 slide restore label");
assertContains(clientSource, "协作面板", "v1.4.3 inspector restore label");
assertNotContains(clientSource, "PowerPoint / Keynote：PowerPoint-rich.pptx", "top compatibility explanation removed");
assertNotContains(clientSource, "WPS / 不确定环境：WPS-compatible.pptx", "top WPS compatibility explanation removed");
assertContains(clientSource, "bottom-statusbar", "v1.4 bottom status bar");
assertContains(clientSource, "bottom-drawer", "v1.4 collapsed QA drawer");
assertContains(clientSource, "批注", "Workbench Comments dock");
assertContains(clientSource, "改稿计划", "Workbench Revision Plan tab");
assertContains(clientSource, "QA 记录", "Workbench QA Log dock");
assertContains(clientSource, "当前选中对象", "v1.1 selected object inspector");
assertContains(clientSource, "对象 ID", "v1.1 selected object id field");
assertContains(clientSource, "图层角色", "v1.1 layer role field");
assertContains(clientSource, "位置", "v1.1 object position field");
assertContains(clientSource, "尺寸", "v1.1 object size field");
assertContains(clientSource, "是否参与动画", "v1.1 animation participation field");
assertContains(clientSource, "clickEffect parent", "v1.1 clickEffect cluster view");
assertContains(clientSource, "withEffect children", "v1.1 withEffect cluster view");
assertContains(clientSource, "delay", "v1.6 timeline delay field");
assertContains(clientSource, "duration", "v1.6 timeline duration field");
assertContains(clientSource, "WPS 状态页映射", "v1.6.11.2 WPS state mapping field");
assertContains(clientSource, "qa-log-list", "v1.1 compact QA log markup");
assertContains(clientSource, "展开详情", "v1.1 optional QA detail disclosure");
assertContains(clientSource, "type PreviewState", "v1.2 preview state model");
assertContains(clientSource, '"rich-before"', "v1.2 rich-before state");
assertContains(clientSource, '"rich-after"', "v1.2 rich-after state");
assertContains(clientSource, '"wps-state-0"', "v1.2 wps-state-0 state");
assertContains(clientSource, '"wps-state-1"', "v1.2 wps-state-1 state");
assertContains(clientSource, '"diff"', "v1.2 diff state");
assertContains(clientSource, "Rich 点击前", "v1.2 Rich before UI");
assertContains(clientSource, "Rich 点击后", "v1.2 Rich after UI");
assertContains(clientSource, "WPS 初始", "v1.2 WPS initial UI");
assertContains(clientSource, "WPS 点击后", "v1.2 WPS after UI");
assertContains(clientSource, "差异视图", "v1.2 diff UI");
assertContains(clientSource, "预览设置", "v1.6.11.2 preview states moved into settings");
assertContains(clientSource, "revealVisible", "v1.2 reveal visibility state");
assertContains(clientSource, "slide-clean", "v1.6 clean canvas default state");
assertContains(clientSource, "Reveal 调试", "v1.6 reveal debug overlay control");
assertContains(clientSource, "可见 reveal elements", "v1.2 visible reveal inspector field");
assertContains(clientSource, "隐藏 reveal elements", "v1.2 hidden reveal inspector field");
assertContains(clientSource, "当前 preview state", "v1.2 preview state inspector field");
assertContains(clientSource, "WPS 状态页映射", "v1.6.11.2 WPS state mapping in motion panel");
assertContains(clientSource, "切换预览", "v1.2 QA log preview switch action");
assertContains(clientSource, "单文件默认", "v1.2 diff single-file default note");
assertContains(clientSource, "逐页问题", "audit page issues UI");
assertContains(clientSource, "动画点击风险", "audit click risks UI");
assertContains(clientSource, "WPS 兼容风险", "audit WPS risks UI");
assertContains(clientSource, "改稿计划草案", "audit revision plan draft UI");
assertContains(clientSource, "审计完成：发现", "audit recommendation QA log summary");
assertContains(clientSource, "type OverlayKey", "v1.6 overlay state type");
assertContains(clientSource, "overlaySettings", "v1.6 overlay settings");
assertContains(clientSource, "对齐线", "v1.6 alignment guide toggle");
assertContains(clientSource, "安全框", "v1.6 safe frame toggle");
assertContains(clientSource, "对象边界", "v1.6 object bounds toggle");
assertContains(clientSource, "状态标签", "v1.6 state badge toggle");
assertContains(clientSource, "Reveal 调试", "v1.6 reveal debug toggle");
assertContains(clientSource, "renderSlideSurface", "v1.6 shared slide rendering");
assertContains(clientSource, "thumb-slide-surface", "v1.6 real slide thumbnail surface");
assertContains(clientSource, "slide-clean", "v1.6 clean slide default mode");
assertContains(clientSource, "播放", "v1.6 playback button");
assertContains(clientSource, "playbackActive", "v1.6 playback state");
assertContains(clientSource, "type PlaybackMode", "v1.6 playback mode type");
assertContains(clientSource, "enterPlayback", "v1.6 enter playback");
assertContains(clientSource, "exitPlayback", "v1.6 exit playback");
assertContains(clientSource, "playbackNext", "v1.6 playback next");
assertContains(clientSource, "playbackAnimating", "v1.6.11.2 playback blocks clicks during animation");
assertContains(clientSource, "playPlaybackPreflightAnimations", "v1.6.11.2 playback preflight animation player");
assertContains(clientSource, ".finished", "v1.6.11.2 playback waits for animation finish promise");
assertContains(clientSource, "playbackPrevious", "v1.6 playback previous");
assertContains(clientSource, "handlePlaybackKeydown", "v1.6 playback keyboard handler");
assertContains(clientSource, "isTypingTarget", "v1.6 shortcut input guard");
assertContains(clientSource, "Home", "v1.6 Home shortcut");
assertContains(clientSource, "End", "v1.6 End shortcut");
assertContains(clientSource, "click_index", "v1.6 playback QA click index");
assertContains(clientSource, "manual_extra_clicks_required", "v1.6 playback QA extra click field");
assertContains(clientSource, "empty_wait_seconds", "v1.6 playback QA empty wait field");
assertContains(clientSource, "click_overrun", "v1.6.11.2 click overrun field");
assertContains(clientSource, "invisible_change_risk", "v1.6.11.2 invisible change risk field");
assertContains(clientSource, "event_type", "v1.6.11.2 playback QA event type");
assertContains(clientSource, "scene-beat-click", "v1.6.11.2 playback QA scene beat event");
assertContains(clientSource, "slide-transition", "v1.6.11.2 playback QA slide transition event");
assertContains(clientSource, "coveredSlides", "v1.6.11.2 playback QA covered slides field");
assertContains(clientSource, "expectedSlides", "v1.6.11.2 playback QA expected slides field");
assertContains(clientSource, "sceneBeatClicks", "v1.6.11.2 playback QA sceneBeatClicks field");
assertContains(clientSource, "manualExtraClicks", "v1.6.11.2 playback QA manualExtraClicks field");
assertContains(clientSource, "仅覆盖部分页面", "v1.6.11.2 playback partial coverage conclusion");
assertContains(clientSource, "不能判定“点击逻辑正确”", "v1.6.11.2 playback no false-positive conclusion");
assertContains(clientSource, "persistPlaybackQaSession", "v1.6.11.2 playback QA persistence");
assertContains(clientSource, "/api/playback-qa/session", "v1.6.11.2 playback QA session frontend POST");
assertContains(clientSource, "/api/playback-qa", "v1.6.11.2 playback QA frontend GET");
assertContains(clientSource, "playbackLastPersistStatus", "v1.6.11.2 playback QA persisted status");
assertContains(clientSource, "历史导出", "v1.6.11.2 historical export UI label");
assertContains(clientSource, "objectId", "v1.6.11.2 object-level revision field");
assertContains(clientSource, "objectRole", "v1.6.11.2 object-level revision role");
assertContains(clientSource, "playback-click", "v1.6.11.2 QA log playback-click category");
assertContains(clientSource, "playback-session", "v1.6.11.2 QA log playback-session category");
assertContains(clientSource, "PowerPoint-style animation timeline", "v1.6 PowerPoint-style timeline label");
assertContains(clientSource, "animation-timeline", "v1.6 animation timeline markup");
assertContains(clientSource, "timeline-bar", "v1.6 timeline bar markup");
assertContains(clientSource, "renderSpecElement", "v1.6.11.2 same-source deck-spec element renderer");
assertContains(clientSource, "orderedSlideElements", "v1.6.11.2 same-source layer traversal");
assertContains(clientSource, "elementStyle", "v1.6.11.2 element geometry/style mapper");
assertContains(clientSource, "13.333", "v1.6.11.2 coordinate mapping width basis");
assertContains(clientSource, "7.5", "v1.6.11.2 coordinate mapping height basis");
assertContains(clientSource, "more-actions-popover", "v1.6.11.2 more actions popover");
assertContains(clientSource, "preview-settings-popover", "v1.6.11.2 preview settings popover");
assertContains(clientSource, "timeline-modal", "v1.6.11.2 full timeline modal");
assertContains(clientSource, "查看时间轴", "v1.6.11.2 timeline secondary window action");
assertNotContains(clientSource, "slide-stage-title", "v1.6.11.2 old hard-coded preview title");
assertNotContains(clientSource, "slide-body-copy", "v1.6.11.2 old hard-coded preview body");
assertNotContains(clientSource, "slide-info-layer", "v1.6.11.2 old hard-coded reveal layer");
assertContains(clientSource, "onClick", "v1.6 timeline onClick marker");
assertContains(clientSource, "withPrevious", "v1.6 timeline withPrevious marker");
assertContains(clientSource, "afterPrevious", "v1.6 timeline afterPrevious marker");
assertContains(clientSource, "loop", "v1.6 timeline loop marker");
assertContains(clientSource, "type BottomTab", "v1.6 bottom tab type");
assertContains(clientSource, "bottomTab", "v1.6 bottom tab state");
assertContains(clientSource, "bottom-tab-panel", "v1.6 bottom tab panels");
assertContains(clientSource, "revision-actions-list", "v1.6 revision action list");
assertContains(auditSource, "PptxAuditRecommendations", "audit recommendations type");
assertContains(auditSource, "overallRisk", "audit overall risk");
assertContains(auditSource, "pageIssues", "audit page issues");
assertContains(auditSource, "clickRisks", "audit click risks");
assertContains(auditSource, "wpsCompatibilityRisks", "audit WPS risks");
assertContains(auditSource, "pptx-workbench.revision-plan.v1", "revision plan schema");
assertContains(auditSource, "clickEffect", "audit clickEffect risk logic");
assertContains(auditSource, "afterEffect", "audit afterEffect risk logic");
assertContains(styleSource, ".selection-box", "v1.1 canvas selection box CSS");
assertContains(styleSource, ".selection-handle", "v1.1 canvas selection handles CSS");
assertContains(styleSource, ".object-label", "v1.1 canvas object label CSS");
assertContains(styleSource, ".safe-margin", "v1.1 canvas safe margin CSS");
assertContains(styleSource, ".guide-line", "v1.1 canvas guide line CSS");
assertContains(styleSource, ".object-card", "v1.1 selected object card CSS");
assertContains(styleSource, ".cluster-card", "v1.1 motion cluster card CSS");
assertContains(styleSource, ".qa-log-list", "v1.1 compact QA log CSS");
assertContains(styleSource, ".preview-toolbar", "v1.2 preview toolbar CSS");
assertContains(styleSource, ".segmented-control", "v1.2 segmented control CSS");
assertContains(clientSource, "shouldShowElement", "v1.6.11.2 hidden reveal control");
assertContains(clientSource, "shouldShowElement", "v1.6.11.2 revealed element control");
assertContains(styleSource, ".diff-overlay", "v1.2 diff overlay CSS");
assertContains(styleSource, ".state-card", "v1.2 state preview card CSS");
assertContains(styleSource, ".modal-backdrop", "export dialog backdrop CSS");
assertContains(styleSource, ".export-dialog", "export dialog CSS");
assertContains(styleSource, ".recommendation-summary", "audit recommendation summary CSS");
assertContains(styleSource, ".revision-plan-preview", "revision plan preview CSS");
assertContains(styleSource, ".workflow-steps", "v1.4 workflow CSS");
assertContains(styleSource, ".need-confirm", "v1.4 current confirmation CSS");
assertContains(styleSource, ".production-toolbar", "v1.4 compact toolbar CSS");
assertContains(styleSource, ".app-shell.nav-collapsed", "v1.4 collapsed slide nav CSS");
assertContains(styleSource, ".app-shell.inspector-collapsed", "v1.4 collapsed inspector CSS");
assertContains(styleSource, ".bottom-statusbar", "v1.4 bottom status bar CSS");
assertContains(styleSource, ".bottom-drawer.hidden", "v1.4 collapsed bottom drawer CSS");
assertContains(styleSource, "@media (max-width: 980px)", "v1.4 narrow responsive CSS");
assertContains(styleSource, "v1.4.2 split-screen UI repair", "v1.4.2 repair CSS marker");
assertContains(styleSource, "v1.4.3 Light Glass Productivity Cockpit", "v1.4.3 glass cockpit CSS marker");
assertContains(styleSource, "--background", "v1.4.3 background token");
assertContains(styleSource, "--surface", "v1.4.3 surface token");
assertContains(styleSource, "--glass-surface", "v1.4.3 glass surface token");
assertContains(styleSource, "--border", "v1.4.3 border token");
assertContains(styleSource, "--text-primary", "v1.4.3 text primary token");
assertContains(styleSource, "--text-muted", "v1.4.3 text muted token");
assertContains(styleSource, "--accent", "v1.4.3 accent token");
assertContains(styleSource, "--warning", "v1.4.3 warning token");
assertContains(styleSource, "--success", "v1.4.3 success token");
assertContains(styleSource, "--shadow", "v1.4.3 shadow token");
assertContains(styleSource, "--radius", "v1.4.3 radius token");
assertContains(styleSource, "prefers-color-scheme", "v1.4.3 system theme media query");
assertContains(styleSource, '[data-theme-mode="light"]', "v1.4.3 light theme selector");
assertContains(styleSource, '[data-theme-mode="dark"]', "v1.4.3 dark theme selector");
assertContains(styleSource, "backdrop-filter", "v1.4.3 glass blur");
assertContains(styleSource, ".project-name-popover", "v1.4.3 project name popover CSS");
assertContains(styleSource, ".project-name-panel", "v1.4.3 project name panel CSS");
assertContains(styleSource, ".theme-segments", "v1.4.3 theme switch CSS");
assertContains(styleSource, "modal-fade-in", "v1.4.3 modal fade transition");
assertContains(styleSource, ".tech-console", "v1.4.1 tech console CSS");
assertContains(styleSource, ".restore-tab", "v1.4.3 restore tab CSS");
assertContains(styleSource, ".restore-left", "v1.4.3 left restore tab CSS");
assertContains(styleSource, ".restore-right", "v1.4.3 right restore tab CSS");
assertContains(styleSource, "grid-template-columns: 34px minmax(0, 1fr) 36px", "v1.6.11.2 both collapsed rails keep canvas priority");
assertContains(styleSource, "grid-template-columns: 210px minmax(0, 1fr) 36px", "v1.6.11.2 collapsed right keeps restore rail");
assertContains(styleSource, "overflow-wrap: anywhere", "v1.4.3 right panel overflow wrap");
assertContains(styleSource, "word-break: normal", "v1.6.11.2 avoids single-character vertical wrapping");
assertContains(styleSource, ".animation-timeline", "v1.6 animation timeline CSS");
assertContains(styleSource, ".risk-badge", "v1.4.1 risk badge CSS");
assertContains(styleSource, ".severity-badge", "v1.4.1 severity badge CSS");
assertContains(styleSource, ".delivery-control", "v1.4.1 delivery control CSS");
assertContains(styleSource, "v1.5 revision-plan cockpit polish", "v1.5 UI polish marker");
assertContains(styleSource, ".comment-form", "v1.5 comment form CSS");
assertContains(styleSource, ".inline-action", "v1.5 inline action CSS");
assertContains(styleSource, "grid-template-columns: 70px 84px 44px minmax(0, 1fr)", "v1.5 QA time no-wrap column");
assertContains(styleSource, "white-space: nowrap", "v1.5 QA time nowrap");
assertContains(styleSource, "word-break: keep-all", "v1.5 QA time keep-all");
assertContains(styleSource, "v1.6.11.2 Codex-style same-source preview", "v1.6 CSS marker");
assertContains(styleSource, ".overlay-toggles", "v1.6 overlay toggles CSS");
assertContains(styleSource, ".slide-clean", "v1.6 clean slide CSS");
assertContains(styleSource, ".thumb-slide-surface", "v1.6 real slide thumbnail CSS");
assertContains(styleSource, ".animation-timeline", "v1.6 animation timeline CSS");
assertContains(styleSource, ".timeline-bar", "v1.6 timeline bar CSS");
assertContains(styleSource, ".bottom-tabs", "v1.6 bottom tabs CSS");
assertContains(styleSource, ".bottom-tab-panel", "v1.6 bottom tab panel CSS");
assertContains(styleSource, ".playback-overlay", "v1.6 playback overlay CSS");
assertContains(styleSource, ".playback-stage", "v1.6 playback stage CSS");
assertContains(styleSource, ".playback-qa-row", "v1.6 playback QA row CSS");
assertContains(styleSource, "v1.6.11.2 production acceptance layout", "v1.6.11.2 layout CSS marker");
assertContains(styleSource, "fit-to-available-area", "v1.6.11.2 fit strategy marker");
assertContains(styleSource, ".floating-popover[data-anchor-ready=\"true\"]", "v1.6.11.2 anchored popover CSS");
assertContains(styleSource, "v1.6.11.2 Codex-native PPTX production foundation", "v1.6.11.2 production foundation CSS");
assertContains(styleSource, ".codex-toolbar", "v1.6.11.2 compact top toolbar CSS");
assertContains(styleSource, ".annotation-button", "v1.6.11.2 annotation button CSS");
assertContains(styleSource, ".annotation-mode-toggle", "v1.6.11.2 annotation mode toggle CSS");
assertContains(styleSource, ".annotation-region-mode", "v1.6.11.2 free annotation cursor CSS");
assertContains(styleSource, "data:image/svg+xml", "v1.6.11.2 free annotation custom cursor");
assertContains(styleSource, ".annotation-selection", "v1.6.11.2 selection CSS");
assertContains(styleSource, ".annotation-ask-codex", "v1.6.11.2 Ask Codex capsule CSS");
assertContains(styleSource, ".annotation-drag-region", "v1.6.11.2 region drag CSS");
assertContains(styleSource, ".annotation-composer", "v1.6.11.2 annotation composer CSS");
assertContains(styleSource, "width: clamp(300px, 24cqw, 460px)", "v1.6.11.2 annotation composer width");
assertContains(styleSource, ".annotation-composer #annotation-submit:disabled", "v1.6.11.2 annotation submit empty state");
assertContains(styleSource, ".annotation-composer #annotation-submit.is-ready", "v1.6.11.2 annotation submit ready state");
assertContains(styleSource, "max-height: 68px", "v1.6.11.2 long annotation text height cap");
assertContains(styleSource, ".annotation-composer-input.is-multiline #annotation-submit", "v1.6.11.2 multiline submit bottom-right alignment");
assertContains(styleSource, "scrollbar-color", "v1.6.11.2 long annotation text scroll affordance");
assertContains(styleSource, "v1.6.11.2 dark readability: left thumbnails", "v1.6.11.2 dark thumbnail text readability");
assertContains(styleSource, ".app-shell[data-theme-mode=\"dark\"] .slide-thumb:not(.active) .thumb-meta strong", "v1.6.11.2 dark inactive thumbnail title contrast");
assertContains(styleSource, ".app-shell[data-theme-mode=\"dark\"] .slide-thumb.active .thumb-meta strong", "v1.6.11.2 dark active thumbnail title contrast");
assertContains(styleSource, ".app-shell[data-theme-mode=\"dark\"] .slide-thumb.active .thumb-meta small", "v1.6.11.2 dark active thumbnail subtitle contrast");
assertContains(styleSource, ".app-shell[data-theme-mode=\"system\"] .slide-thumb:not(.active) .thumb-index", "v1.6.11.2 system dark inactive thumbnail index contrast");
assertContains(styleSource, ".app-shell[data-theme-mode=\"system\"] .slide-thumb.active .thumb-index", "v1.6.11.2 system dark active thumbnail index contrast");
assertContains(styleSource, ".project-name-panel #project-name-save:not(:disabled)", "v1.6.11.2 project name primary save button");
assertContains(styleSource, "place-items: center", "v1.6.11.2 centered segmented menu text");
assertContains(clientSource, "bindAnnotationComposerControls", "v1.6.11.2 annotation composer input binding");
assertContains(clientSource, "submit.disabled = !hasText", "v1.6.11.2 annotation submit button state");
assertContains(clientSource, "submit.textContent = isMultiline ? \"✓\" : \"↑\"", "v1.6.11.2 annotation submit single and multiline icon");
assertContains(clientSource, "shiftKey", "v1.6.11.2 annotation composer shift-enter multiline");
assertContains(clientSource, "annotationComposerLineCount", "v1.6.11.2 stable annotation composer line count");
assertContains(clientSource, "lineCount > 1", "v1.6.11.2 annotation mode avoids height flicker");
assertContains(clientSource, "positionAnnotationComposerWithinWorkspace", "v1.6.11.2 annotation composer workspace positioning");
assertContains(clientSource, "clampToRange", "v1.6.11.2 annotation composer avoids side panels");
assertContains(clientSource, "annotationPlacementDirections", "v1.6.11.2 annotation composer uses PPT-center placement");
assertContains(clientSource, "seededFraction", "v1.6.11.2 annotation composer stable placement jitter");
assertContains(clientSource, "dx < -horizontalThreshold ? \"right\"", "v1.6.11.2 annotation composer puts left targets on right");
assertContains(clientSource, "dy < -verticalThreshold ? \"bottom\"", "v1.6.11.2 annotation composer puts upper targets below");
assertContains(clientSource, "dy > verticalThreshold ? \"bottom\"", "v1.6.11.2 annotation composer puts lower targets below by default");
assertContains(clientSource, "preferred.push(\"bottom\")", "v1.6.11.2 annotation composer puts center targets below by default");
assertContains(clientSource, "lowerTargetGap", "v1.6.11.2 annotation composer keeps lower targets close");
assertContains(styleSource, ".annotation-composer-input.is-multiline", "v1.6.11.2 annotation composer multiline layout");
assertContains(styleSource, "line-height: 32px", "v1.6.11.2 annotation composer single line vertical centering");
assertContains(styleSource, ".codex-inbox-list", "v1.6.11.2 bottom annotation list CSS");
assertContains(styleSource, ".codex-inbox-row p", "v1.6.11.2 bottom annotation body typography");
assertContains(styleSource, ".app-shell[data-theme-mode=\"light\"] .annotation-ask-codex", "v1.6.11.2 light annotation Ask Codex style");
assertContains(styleSource, ".app-shell[data-theme-mode=\"light\"] .annotation-composer-input", "v1.6.11.2 light annotation composer style");
assertContains(styleSource, ".app-shell[data-theme-mode=\"system\"] .annotation-composer-input", "v1.6.11.2 system light annotation composer style");
assertNotContains(styleSource, "#playback-next {\n  border-color: #60a5fa;", "v1.6.11.2 playback next must not be permanently active");
assertNotContains(clientSource, 'data-bottom-tab="notes"', "v1.6.11.2 removes fake notes tab");
assertNotContains(clientSource, "暂无页面备注", "v1.6.11.2 removes fake notes placeholder");
assertContains(clientSource, "previewDescriptors[\"rich-after\"]", "v1.6.11.2 thumbnails fixed to final state");
assertContains(clientSource, "toggleAnchoredPopover", "v1.6.11.2 anchored popover helper");
assertContains(clientSource, "positionPopover", "v1.6.11.2 popover positioning helper");
assertContains(clientSource, "wpsStateShortDescription", "v1.6.11.2 slim WPS state summary");
assertContains(readmeSource, "Codex-native local workbench", "README public project positioning");
assertContains(readmeSource, "editable, animated `.pptx` decks", "README PPTX project goal");
assertContains(readmeSource, "Deck-spec driven slide model", "README deck-spec driven model");
assertContains(readmeSource, "Object and free-region annotation UI", "README annotation capability");
assertContains(readmeSource, "Codex Bridge", "README bridge section");
assertContains(readmeSource, "events/codex-events.jsonl", "README unified bridge queue");
assertContains(readmeSource, ".codex-bridge/current-thread.json", "README current thread config");
assertContains(readmeSource, "outputs/codex-bridge-receipts.jsonl", "README bridge receipts path");
assertContains(readmeSource, "upload events are recorded and immediately dispatched", "README v1.6.11.2 upload dispatch loop");
assertContains(readmeSource, "open-ended annotations", "README v1.6.11.2 open-ended annotation dispatch loop");
assertContains(readmeSource, "PowerPoint-rich.pptx", "README PowerPoint output");
assertContains(readmeSource, "WPS-compatible.pptx", "README WPS output");
assertContains(readmeSource, "Browser playback mode is a QA simulator", "README playback QA limitation");
assertContains(readmeSource, "Not a full PowerPoint clone", "README scope boundary");

const auditSmoke = await auditPptxFile(richPath, "PowerPoint-rich.pptx");
if (!auditSmoke.validZip || !auditSmoke.validPptx) {
  throw new Error(`Audit smoke failed for PowerPoint-rich.pptx: ${JSON.stringify(auditSmoke)}`);
}
if (auditSmoke.slideCount !== expectedRichSlides) {
  throw new Error(`Audit smoke slide count mismatch: expected ${expectedRichSlides}, got ${auditSmoke.slideCount}`);
}
if (auditSmoke.timingCount !== rich.timingCount || auditSmoke.animEffectCount !== rich.animEffectCount) {
  throw new Error("Audit smoke must report the same timing/animation counts as package inspection");
}
if (!auditSmoke.recommendations.summary || !auditSmoke.recommendations.revisionPlanDraft) {
  throw new Error("Audit smoke must include recommendations and revisionPlanDraft");
}
if (auditSmoke.recommendations.revisionPlanDraft.schema !== "pptx-workbench.revision-plan.v1") {
  throw new Error(`Unexpected revision plan schema: ${auditSmoke.recommendations.revisionPlanDraft.schema}`);
}

for (const slide of spec.slides) {
  assertContains(motionPlan, `slideId: ${slide.id}`, `motion-plan slide ${slide.id}`);
  assertContains(visualQa, `| ${slide.id} |`, `visual QA slide ${slide.id}`);
  assertContains(playbackQa, `| ${slide.id} |`, `playback QA slide ${slide.id}`);
}

console.log(
  JSON.stringify(
    {
      rich: {
        slideCount: rich.slideCount,
        transitionCount: rich.transitionCount,
        timingCount: rich.timingCount,
        animEffectCount: rich.animEffectCount,
        clickTriggerCount: rich.clickTriggerCount,
        withEffectCount: rich.withEffectCount,
        afterEffectCount: rich.afterEffectCount,
        timingTargets: rich.timingTargets,
      },
      wps: {
        slideCount: wps.slideCount,
        transitionCount: wps.transitionCount,
        timingCount: wps.timingCount,
        animEffectCount: wps.animEffectCount,
      },
      documents: {
        motionPlan: "v0.8 click-cluster",
        visualQa: "per-slide entries",
        playbackQa: "per-page playback expectations",
        deliveryNote: "v0.8 delivery strategy",
      },
      auditSmoke: {
        fileName: auditSmoke.fileName,
        validPptx: auditSmoke.validPptx,
        slideCount: auditSmoke.slideCount,
        transitionCount: auditSmoke.transitionCount,
        timingCount: auditSmoke.timingCount,
        animEffectCount: auditSmoke.animEffectCount,
      },
    },
    null,
    2,
  ),
);

function assertContains(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
}

function assertNotContains(haystack: string, needle: string, label: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`Unexpected ${label}: ${needle}`);
  }
}
