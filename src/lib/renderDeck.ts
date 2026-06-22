import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeckSpec,
  ElementSpec,
  GenerationResult,
  ImageElementSpec,
  LayerRole,
  SceneBeatSpec,
  ShapeElementSpec,
  SlideSpec,
  TextElementSpec,
} from "./deckTypes.js";
import { addFadeTransitions, addPowerPointRichMotion, type NativeObjectTimingInfo } from "./pptxPackage.js";
import { resolveFromProject } from "./paths.js";

type PptxOptions = Record<string, unknown>;

interface PptxSlide {
  background?: { color: string };
  addText(text: string, options: PptxOptions): PptxSlide;
  addShape(shapeName: string, options: PptxOptions): PptxSlide;
  addImage(options: PptxOptions): PptxSlide;
  addNotes(notes: string): PptxSlide;
}

interface PptxPresentation {
  layout: string;
  subject: string;
  company: string;
  lang: string;
  author: string;
  creator: string;
  theme: PptxOptions;
  title: string;
  addSlide(): PptxSlide;
  writeFile(options: { fileName: string }): Promise<unknown>;
}

type PptxConstructor = new () => PptxPresentation;

const PptxGenJS = await loadPptxConstructor();

const wide = { w: 13.333, h: 7.5 };

const layerOrder: LayerRole[] = ["background", "decor", "hero", "text", "info_layer"];

export async function generateDecks(spec: DeckSpec): Promise<GenerationResult> {
  const outputDir = path.resolve(resolveFromProject(spec.outputs?.directory ?? "outputs"));
  await fs.mkdir(outputDir, { recursive: true });

  const powerpointRich = path.join(outputDir, "PowerPoint-rich.pptx");
  const wpsCompatible = path.join(outputDir, "WPS-compatible.pptx");
  const motionPlan = path.join(outputDir, "motion-plan.yaml");
  const visualQa = path.join(outputDir, "visual-qa.md");
  const playbackQa = path.join(outputDir, "playback-qa.md");
  const deliveryNote = path.join(outputDir, "delivery-note.md");
  const previewParity = path.join(outputDir, "preview-parity.md");

  const nativeTimings = await buildPowerPointRich(spec, powerpointRich);
  await buildWpsCompatible(spec, wpsCompatible);
  await fs.writeFile(motionPlan, buildMotionPlan(spec, nativeTimings), "utf8");
  await fs.writeFile(visualQa, buildVisualQa(spec), "utf8");
  await fs.writeFile(playbackQa, buildPlaybackQa(spec, nativeTimings), "utf8");
  await fs.writeFile(deliveryNote, buildDeliveryNote(spec), "utf8");
  await fs.writeFile(previewParity, buildPreviewParity(spec), "utf8");

  return {
    outputDir,
    files: {
      powerpointRich,
      wpsCompatible,
      motionPlan,
      visualQa,
      playbackQa,
      deliveryNote,
      previewParity,
    },
  };
}

async function buildPowerPointRich(spec: DeckSpec, outPath: string): Promise<NativeObjectTimingInfo[]> {
  const pptx = createPresentation(spec);
  pptx.subject = "Codex-native PPTX Workbench PowerPoint-rich export";
  pptx.company = "Local Codex Workbench";
  pptx.lang = "zh-CN";

  for (const slideSpec of spec.slides) {
    const slide = pptx.addSlide();
    renderSlide(slide, spec, slideSpec, {
      mode: "powerpoint-rich",
      activeBeat: undefined,
      stateLabel: undefined,
    });
    slide.addNotes(buildSlideNotes(slideSpec));
  }

  await pptx.writeFile({ fileName: outPath });
  return addPowerPointRichMotion(outPath, spec);
}

async function buildWpsCompatible(spec: DeckSpec, outPath: string): Promise<void> {
  const pptx = createPresentation(spec);
  pptx.subject = "Codex-native PPTX Workbench WPS-compatible state-page export";
  pptx.company = "Local Codex Workbench";
  pptx.lang = "zh-CN";

  for (const slideSpec of spec.slides) {
    const beats = slideSpec.sceneBeats ?? [];
    const baseSlide = pptx.addSlide();
    renderSlide(baseSlide, spec, slideSpec, {
      mode: "wps-compatible",
      activeBeat: undefined,
      stateLabel: "State 0 · base",
    });

    beats.forEach((beat, index) => {
      const slide = pptx.addSlide();
      renderSlide(slide, spec, slideSpec, {
        mode: "wps-compatible",
        activeBeat: beat,
        stateLabel: `State ${index + 1} · ${beat.label}`,
      });
      slide.addNotes(`WPS state page for beat ${beat.id}. Object timing is intentionally flattened.`);
    });
  }

  await pptx.writeFile({ fileName: outPath });
  await addFadeTransitions(outPath);
}

function createPresentation(spec: DeckSpec): PptxPresentation {
  const pptx = new PptxGenJS();
  pptx.layout = spec.slideSize ?? "LAYOUT_WIDE";
  pptx.author = "pptx-workbench";
  pptx.creator = "pptx-workbench";
  pptx.theme = {
    headFontFace: spec.theme.fonts.heading,
    bodyFontFace: spec.theme.fonts.body,
    lang: "zh-CN",
  };
  pptx.title = spec.title;
  return pptx;
}

async function loadPptxConstructor(): Promise<PptxConstructor> {
  const moduleValue = (await import("pptxgenjs")) as unknown;
  if (!isRecord(moduleValue) || typeof moduleValue.default !== "function") {
    throw new Error("pptxgenjs default export is not constructable");
  }
  return moduleValue.default as PptxConstructor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderSlide(
  slide: PptxSlide,
  spec: DeckSpec,
  slideSpec: SlideSpec,
  options: {
    mode: "powerpoint-rich" | "wps-compatible";
    activeBeat: SceneBeatSpec | undefined;
    stateLabel: string | undefined;
  },
): void {
  if (slideSpec.background) {
    slide.background = { color: colorToken(spec, slideSpec.background) };
  }

  const activeRevealSet = new Set(options.activeBeat?.revealElements ?? []);
  const allElements = orderedElements(slideSpec);

  for (const element of allElements) {
    if (!shouldRenderElement(element, activeRevealSet, options.mode)) {
      continue;
    }
    renderElement(slide, spec, element);
  }

  if (options.stateLabel) {
    addStateBadge(slide, spec, options.stateLabel);
  }
}

function orderedElements(slideSpec: SlideSpec): ElementSpec[] {
  return [...slideSpec.layers]
    .sort((a, b) => layerOrder.indexOf(a.role) - layerOrder.indexOf(b.role))
    .flatMap((layer) => layer.elements.map((element) => ({ ...element, role: element.role ?? layer.role })));
}

function shouldRenderElement(
  element: ElementSpec,
  activeRevealSet: Set<string>,
  mode: "powerpoint-rich" | "wps-compatible",
): boolean {
  if (!element.hiddenUntilBeat) {
    return true;
  }
  if (mode === "powerpoint-rich") {
    return true;
  }
  return activeRevealSet.has(element.id);
}

function renderElement(slide: PptxSlide, spec: DeckSpec, element: ElementSpec): void {
  if (element.kind === "text") {
    renderText(slide, spec, element);
    return;
  }
  if (element.kind === "shape") {
    renderShape(slide, spec, element);
    return;
  }
  renderImage(slide, element);
}

function renderText(slide: PptxSlide, spec: DeckSpec, element: TextElementSpec): void {
  slide.addText(element.text, {
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    margin: 0.04,
    fontFace: element.fontFace ?? spec.theme.fonts.body,
    fontSize: element.fontSize ?? 20,
    color: colorToken(spec, element.color ?? "ink"),
    bold: element.bold,
    italic: element.italic,
    align: element.align,
    valign: element.valign,
    fit: element.fit,
    breakLine: false,
  });
}

function renderShape(slide: PptxSlide, spec: DeckSpec, element: ShapeElementSpec): void {
  if (element.shape === "line") {
    slide.addShape("line", {
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      line: {
        color: colorToken(spec, element.line?.color ?? "ink"),
        width: element.line?.width ?? 1,
        transparency: element.line?.transparency,
      },
    });
    return;
  }

  const shapeType =
    element.shape === "ellipse"
      ? "ellipse"
      : element.shape === "roundRect"
        ? "roundRect"
        : "rect";

  slide.addShape(shapeType, {
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    fill: {
      color: colorToken(spec, element.fill ?? "paper"),
      transparency: element.transparency,
    },
    line: {
      color: colorToken(spec, element.line?.color ?? "transparent"),
      width: element.line?.width ?? 0,
      transparency: element.line?.transparency,
    },
  });
}

function renderImage(slide: PptxSlide, element: ImageElementSpec): void {
  const resolved = path.resolve(resolveFromProject(), element.src);
  slide.addImage({
    path: resolved,
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    transparency: element.transparency,
  });
}

function addStateBadge(slide: PptxSlide, spec: DeckSpec, text: string): void {
  slide.addShape("roundRect", {
    x: wide.w - 3.15,
    y: 0.22,
    w: 2.85,
    h: 0.36,
    fill: { color: colorToken(spec, "accent"), transparency: 8 },
    line: { color: colorToken(spec, "accent"), transparency: 100 },
  });
  slide.addText(text, {
    x: wide.w - 3.0,
    y: 0.29,
    w: 2.55,
    h: 0.18,
    fontFace: spec.theme.fonts.body,
    fontSize: 8,
    bold: true,
    color: colorToken(spec, "paper"),
    margin: 0,
    fit: "shrink",
  });
}

function colorToken(spec: DeckSpec, tokenOrHex: string): string {
  if (tokenOrHex === "transparent") {
    return "FFFFFF";
  }
  const value = spec.theme.colors[tokenOrHex] ?? tokenOrHex;
  return value.replace(/^#/, "");
}

function buildSlideNotes(slideSpec: SlideSpec): string {
  const beats = (slideSpec.sceneBeats ?? []).map((beat) => `- ${beat.id}: ${beat.label}`).join("\n");
  return [
    `Slide: ${slideSpec.id}`,
    "Animation structure is reserved in motion-plan.yaml.",
    beats ? `Scene beats:\n${beats}` : "Scene beats: none",
  ].join("\n");
}

function buildMotionPlan(spec: DeckSpec, nativeTimings: NativeObjectTimingInfo[]): string {
  const clusters = spec.animationClusters ?? [];
  const beatCount = totalBeatCount(spec);
  const lines = [
    `deck: ${yamlString(spec.title)}`,
    "schema: pptx-workbench.motion-plan.v0.8",
    "version: v0.8",
    "sampleType: multi-page-playback-sample",
    `slideCount: ${spec.slides.length}`,
    `sceneBeatCount: ${beatCount}`,
    "exports:",
    "  powerpoint-rich:",
    "    strategy: native-transition-plus-object-timing",
    "    transition: fade",
    "    timing: native-object-entrance",
    "    animEffect: fade",
    "    note: Real p:transition, p:timing, and p:animEffect nodes are injected on every spec slide with a scene beat. v0.8 groups both targets under one click-triggered parent.",
    "  wps-compatible:",
    "    strategy: state-page-expansion",
    "    transition: fade",
    "    expectedSlideCountFormula: spec slides + scene beat count",
    `    expectedSlideCount: ${spec.slides.length + beatCount}`,
    "    note: Scene beats are flattened into extra state pages and each state page receives p:transition fade.",
    "degradationStrategy:",
    "  powerpoint-rich:",
    "    primary: native-object-timing",
    "    intendedApps:",
    "      - Microsoft PowerPoint",
    "      - Apple Keynote",
    "    notRecommendedApps:",
    "      - WPS",
    "    wpsSupportPromise: none-for-rich-object-animation",
    "    fallback: use WPS-compatible state pages for WPS, uncertain playback environments, or external stable delivery",
    "  wps-compatible:",
    "    primary: state-page-expansion",
    "    intendedApps:",
    "      - WPS",
    "      - Microsoft PowerPoint",
    "      - uncertain playback environments",
    "    fallback: safest single-file delivery when client software is unknown",
    "compatibilityMatrix:",
    "  - file: PowerPoint-rich.pptx",
    "    app: Microsoft PowerPoint",
    "    status: pass",
    "    notes: Native object animation plays correctly.",
    "  - file: PowerPoint-rich.pptx",
    "    app: Apple Keynote",
    "    status: pass",
    "    notes: Playback matches PowerPoint in the user validation.",
    "  - file: PowerPoint-rich.pptx",
    "    app: WPS",
    "    status: fail-rich-standard",
    "    notes: WPS keeps only a simplified fade/ending behavior and does not correctly play the English callout plus orange bar object animation.",
    "  - file: WPS-compatible.pptx",
    "    app: WPS",
    "    status: pass",
    "    notes: State-page expansion plus fade transition plays correctly.",
    "  - file: WPS-compatible.pptx",
    "    app: Microsoft PowerPoint",
    "    status: pass",
    "    notes: State-page expansion matches WPS playback.",
    "multiPageCoverage:",
    "  required: every spec slide has at least one scene beat",
    "  rich: every spec slide receives fade transition and native timing for the first scene beat",
    "  wps: every scene beat maps to one additional state page",
    "sceneBeats:",
    ...buildSceneBeatPlan(spec),
    "nativeObjectTiming:",
    ...buildNativeTimingPlan(nativeTimings),
    "v0.8ClickClusterContract:",
    "  regressionFromV0_7: callout plus orange bar could appear as two manual animation steps in PowerPoint",
    "  requiredClickTriggerCountPerSlide: 1",
    "  requiredClusterBinding: callout and orange bar share the same click-triggered parent",
    "  orangeBarFollowMode: automatic-withEffect-child-delay",
    "  secondClickRequired: fail",
    "  rapidClickingAllowed: false",
    "  longPressAllowed: false",
    "v0.8RichVisibilityContract:",
    "  preClickState: every scene beat target is controlled by entrance timing and should be unrevealed at slideshow start",
    "  postClickState: one click reveals the page-specific callout plus orange highlight bar",
    "  targetDurationMs: 1100",
    "  visibleChangeStandard: recording must clearly show before/after change without rapid clicking or long press",
    "  powerpointAnimationPaneStatus: recognized-by-user-in-PowerPoint",
    "  keynoteStatus: pass-same-as-PowerPoint",
    "  wpsRichStatus: fail-use-WPS-compatible",
    "  acceptedIf: visible reveal completes after one click during slideshow",
    "  rejectedIf: object is already visibly revealed before click or reveal is too weak to see in recording",
    "clickClusters:",
    ...buildClickClusterPlan(spec, nativeTimings),
    "clusters:",
  ];

  for (const cluster of clusters) {
    lines.push(`  - id: ${cluster.id}`);
    lines.push(`    target: ${cluster.target}`);
    lines.push(`    slideId: ${cluster.slideId}`);
    lines.push(`    beatId: ${cluster.beatId}`);
    lines.push(`    strategy: ${cluster.strategy}`);
    lines.push("    members:");
    cluster.members.forEach((member) => lines.push(`      - ${member}`));
    if (cluster.notes) {
      lines.push(`    notes: ${yamlString(cluster.notes)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildSceneBeatPlan(spec: DeckSpec): string[] {
  const lines: string[] = [];
  let wpsPageNumber = 1;
  for (const slide of spec.slides) {
    const beats = slide.sceneBeats ?? [];
    wpsPageNumber += 1;
    if (beats.length === 0) {
      lines.push(`  - slideId: ${slide.id}`);
      lines.push("    beatId: missing");
      lines.push("    label: missing");
      lines.push("    verification: fail-no-scene-beat");
      continue;
    }
    for (const beat of beats) {
      const statePageNumber = wpsPageNumber;
      lines.push(`  - slideId: ${slide.id}`);
      lines.push(`    beatId: ${beat.id}`);
      lines.push(`    label: ${yamlString(beat.label)}`);
      lines.push(`    description: ${yamlString(beat.description ?? "")}`);
      lines.push("    expectedClicks: 1");
      lines.push("    clickClusterIds:");
      lines.push(`      - ${clickClusterId(slide.id, beat.id, "rich")}`);
      lines.push(`      - ${clickClusterId(slide.id, beat.id, "wps")}`);
      lines.push(`    wpsStatePage: ${statePageNumber}`);
      lines.push("    reveals:");
      for (const elementId of beat.revealElements ?? []) {
        lines.push(`      - ${elementId}`);
      }
      wpsPageNumber += 1;
    }
  }
  return lines;
}

function buildVisualQa(spec: DeckSpec): string {
  const slideCount = spec.slides.length;
  const layers = new Set(spec.slides.flatMap((slide) => slide.layers.map((layer) => layer.role)));
  const lines = [
    "# Visual QA",
    "",
    `- Deck: ${spec.title}`,
    "- Version: v0.8 multi-page click-cluster sample",
    `- Source spec slides: ${slideCount}`,
    `- Layer roles present: ${[...layers].join(", ")}`,
    "- Static visual scope: this is a readable multi-page workbench sample, not final cinematic design polish.",
    "- Checked by generator:",
    "  - All slides have ordered layer rendering.",
    "  - Text, image, and shape elements are supported.",
    "  - WPS export adds state badges to make flattened scene states auditable.",
    "  - v0.8 keeps a visible info_layer reveal target on every page and fixes Rich click-cluster grouping.",
    "",
    "## Per-slide static QA",
    "",
    "| slide | title | static_structure | scene_beat | rich_target | wps_state_fallback | visual_status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const slide of spec.slides) {
    const beat = slide.sceneBeats?.[0];
    lines.push(
      `| ${slide.id} | ${slide.title ?? slide.id} | readable base layout with ordered layers | ${beat?.id ?? "missing"} | ${beat?.revealElements?.join(" + ") ?? "missing"} | base page + beat state page | manual_layout_review_pending |`,
    );
  }
  lines.push(
    "",
    "- Manual checks still required:",
    "  - Open `PowerPoint-rich.pptx` in Microsoft PowerPoint and inspect layout fidelity.",
    "  - Open `WPS-compatible.pptx` in WPS and confirm state-page playback order.",
  );
  return `${lines.join("\n")}\n`;
}

function buildPlaybackQa(spec: DeckSpec, nativeTimings: NativeObjectTimingInfo[]): string {
  const beatCount = totalBeatCount(spec);
  const lines = [
    "# Playback QA",
    "",
    "status: manual_pending",
    "validation_mode: automated_package_checks_plus_manual_playback_template",
    "automated_open_smoke: not_run_by_generator",
    "manual_or_auto_acceptance_status: manual_required",
    "",
    "## v0.8 multi-page playback scope",
    "",
    `- Source spec slides: ${spec.slides.length}`,
    `- Scene beat count: ${beatCount}`,
    `- PowerPoint-rich native timing clusters: ${nativeTimings.length}`,
    `- Expected WPS-compatible slides: ${spec.slides.length + beatCount}`,
    "- PowerPoint-rich export:",
    "  - Contains full slide content and speaker notes that point to `motion-plan.yaml`.",
    "  - v0.8 keeps real `<p:transition><p:fade/></p:transition>` nodes on every slide XML.",
    "  - v0.8 keeps real `<p:timing>` and multiple `<p:animEffect transition=\"in\" filter=\"fade\">` nodes across the multi-page sample.",
    "  - v0.8 fixes the Rich click cluster: each slide has exactly one `clickEffect` parent and both animated objects run as `withEffect` children.",
    "  - PowerPoint animation pane status: user confirmed the Rich animation object is recognized.",
    "  - v0.5 manual compatibility conclusion: PowerPoint-rich passes in Microsoft PowerPoint and Apple Keynote, but fails the Rich standard in WPS.",
    "- WPS-compatible export:",
    "  - Uses state-page expansion instead of object timing.",
    "  - Keeps transition-only playback; no complex object timing is required for WPS.",
    "  - v0.5 manual compatibility conclusion: WPS-compatible passes in WPS and Microsoft PowerPoint.",
    "- Delivery rule:",
    "  - Microsoft PowerPoint / Apple Keynote: use `PowerPoint-rich.pptx`.",
    "  - WPS / uncertain playback environment / external stable delivery: use `WPS-compatible.pptx`.",
    "  - If only one file can be delivered, default to `WPS-compatible.pptx`.",
    "  - Do not recommend opening `PowerPoint-rich.pptx` in WPS.",
    "- Automated package checks:",
    "  - Verify requires both PPTX files to be valid zip packages with slide XML.",
    "  - Verify requires PowerPoint-rich to contain `<p:transition>`, `<p:timing>`, and `<p:animEffect>`.",
    "  - Verify requires every timing `<p:spTgt>` shape id to exist in the same slide XML.",
    "  - Verify requires WPS-compatible to contain `<p:transition>` and keep state-page slide count.",
    "  - Verify requires this QA file to contain playback fields for PowerPoint, WPS, and Keynote.",
    "- Automation boundary:",
    "  - Codex can launch local Office apps for open-smoke checks when available, but cannot reliably observe slideshow repair prompts, click-by-click visual changes, object drift, or presenter playback completion without a dedicated visual harness.",
    "  - Therefore v0.6 records the user-confirmed compatibility matrix and keeps manual recording QA fields for future regressions.",
    "",
    "## v0.7 regression addressed in v0.8",
    "",
    "- v0.7 issue: a scene beat could look like two required clicks because callout used `clickEffect` and orange bar used `afterEffect` as a separate timing branch.",
    "- v0.8 fix: callout and orange bar are generated under the same click-triggered parent; orange bar is an automatic `withEffect` child with a short delay.",
    "- v0.8 acceptance: if a second click is needed for the orange bar, the Rich file fails.",
    "",
    "## Per-page playback expectations",
    "",
    "| slide | scene_beat | expected_clicks | click_trigger_count | rich_visible_change_after_click | rich_auto_complete | second_click_required | wps_state_page | needs_rapid_clicking | needs_long_press | empty_wait_allowed |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of playbackRows(spec)) {
    lines.push(
      `| ${row.slideId} | ${row.beatId} | 1 | 1 | ${row.revealElements.join(" + ")} appears | yes, about 1100ms | no | ${row.wpsStatePage} | no | no | no |`,
    );
  }

  lines.push(
    "",
    "## v0.5 confirmed compatibility matrix",
    "",
    "| file | app | result | conclusion |",
    "| --- | --- | --- | --- |",
    "| PowerPoint-rich.pptx | Microsoft PowerPoint | pass | Native Rich object animation plays correctly. |",
    "| PowerPoint-rich.pptx | Apple Keynote | pass | Effect is the same as PowerPoint. |",
    "| PowerPoint-rich.pptx | WPS | fail-rich-standard | WPS only preserves a simplified fade/ending behavior and does not correctly play the English description plus orange bar object animation. |",
    "| WPS-compatible.pptx | WPS | pass | State-page expansion plus fade transition plays correctly. |",
    "| WPS-compatible.pptx | Microsoft PowerPoint | pass | Playback matches WPS-compatible behavior. |",
    "",
    "## Real playback acceptance table",
    "",
    "| app | file | validation_status | opens_without_repair | can_play | click_count | visible_change_after_click | auto_complete | needs_rapid_clicking | needs_long_press | empty_wait_detected | object_drift_detected | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| Microsoft PowerPoint | PowerPoint-rich.pptx | manual_pending | unverified | unverified | ${beatCount} expected across ${spec.slides.length} slides | each page callout and orange bar must be clearly visible in recording after one click | should auto-complete in about 1100ms per slide | no | no | unverified | unverified | Open slideshow; click once per page; if orange bar needs a second click, fail v0.8. |`,
    `| WPS | WPS-compatible.pptx | manual_pending | unverified | unverified | ${beatCount} slide advances expected for beat states | each state page should reveal the page callout and orange bar | n/a | no | no | unverified | unverified | Start slideshow; advance from each State 0 page to its State 1 page with fade transition; no object timing required. |`,
    `| Apple Keynote | PowerPoint-rich.pptx | manual_pending | unverified | unverified | ${beatCount} expected across ${spec.slides.length} slides | same visible reveal expected as PowerPoint | should auto-complete in about 1100ms per slide | no | no | unverified | unverified | Import/open and test each page click; Keynote previously matched PowerPoint for v0.5. |`,
    "",
    "## Manual playback script",
    "",
    "1. Microsoft PowerPoint:",
    "   - Open `outputs/PowerPoint-rich.pptx`.",
    "   - Confirm no repair prompt appears.",
    "   - Start slideshow from slide 1 and proceed through all five slides.",
    "   - On each slide, click once only.",
    "   - Record whether the page-specific callout and orange highlight bar are unrevealed before the click and both appear after that one click.",
    "   - Acceptance standard: the before/after change must be obvious in screen recording; needing a second click for the orange bar is a failure.",
    "2. WPS:",
    "   - Open `outputs/WPS-compatible.pptx`.",
    "   - Confirm no repair prompt appears.",
    "   - Start slideshow from slide 1 and proceed through all ten state-expanded slides.",
    "   - For each original page, advance once from State 0 to State 1.",
    "   - Record whether the fade transition is visible and whether each State 1 page shows the page-specific callout and orange highlight bar.",
    "3. Apple Keynote:",
    "   - Open or import `outputs/PowerPoint-rich.pptx`.",
    "   - Confirm whether import succeeds without warning.",
    "   - Start playback and click once per slide.",
    "   - Record whether object timing is preserved, simplified, or ignored.",
    "",
    "## Acceptance record template",
    "",
    "- tester:",
    "- date:",
    "- environment:",
    "- PowerPoint result:",
    "- WPS result:",
    "- Keynote result:",
    "- blockers:",
  );
  return `${lines.join("\n")}\n`;
}

function buildDeliveryNote(spec: DeckSpec): string {
  const beatCount = totalBeatCount(spec);
  return [
    "# PPTX Workbench Delivery Note",
    "",
    "Version: v0.8 multi-page click-cluster sample",
    "",
    "## Scope",
    "",
    `- This delivery contains a ${spec.slides.length}-page sample deck.`,
    `- Each page has 1 scene beat; total scene beats: ${beatCount}.`,
    `- PowerPoint-rich expected pages: ${spec.slides.length}.`,
    `- WPS-compatible expected pages: ${spec.slides.length + beatCount}.`,
    "- This is a mechanism validation sample, not final cinematic visual polish.",
    "",
    "## Recommended files",
    "",
    "| Playback environment | Recommended file | Reason |",
    "| --- | --- | --- |",
    "| Microsoft PowerPoint | `PowerPoint-rich.pptx` | Native object animation is supported and validated. |",
    "| Apple Keynote | `PowerPoint-rich.pptx` | User validation confirmed the effect matches PowerPoint. |",
    "| WPS | `WPS-compatible.pptx` | WPS does not reliably preserve the Rich object animation; use state-page fallback. |",
    "| Unknown / external stable delivery | `WPS-compatible.pptx` | Safest single-file option across uncertain playback environments. |",
    "",
    "## Compatibility summary",
    "",
    "- `PowerPoint-rich.pptx` is for Microsoft PowerPoint and Apple Keynote.",
    "- `PowerPoint-rich.pptx` is not recommended for WPS.",
    "- In WPS, the Rich file only keeps a simplified fade/ending behavior and does not correctly play the English callout plus orange highlight bar object animation.",
    "- `WPS-compatible.pptx` is for WPS, uncertain playback environments, and external stable delivery.",
    "- If the customer only allows one file, deliver `WPS-compatible.pptx` by default.",
    "- v0.8 preserves the same dual-file strategy while fixing PowerPoint-rich click-cluster grouping.",
    "",
    "## Files in this delivery",
    "",
    "- `PowerPoint-rich.pptx`",
    "- `WPS-compatible.pptx`",
    "- `motion-plan.yaml`",
    "- `playback-qa.md`",
    "- `visual-qa.md`",
  ].join("\n") + "\n";
}

function buildPreviewParity(spec: DeckSpec): string {
  const lines = [
    "# Preview Parity Checklist",
    "",
    `Version: v1.6.11.2`,
    `Deck: ${spec.title}`,
    "",
    "v1.6.11.2 的 Web preview 不解析导出的 PPTX，而是与 `renderDeck.ts` 使用同一个 deck-spec 语义：按 layer order 遍历 `slide.layers[].elements[]`，将 13.333 x 7.5 坐标映射到 16:9 Web 容器。",
    "",
    "## Renderer contract",
    "",
    "- Layer order: background -> decor -> hero -> text -> info_layer.",
    "- Supported element kinds in Web preview: text, shape, image.",
    "- Supported element kinds in PPTX export: text, shape, image.",
    "- Geometry mapping: x/y/w/h are mapped from 13.333 x 7.5 slide units to percentages in Web preview; PPTX export uses the original slide units.",
    "- Style mapping: fill/color/transparency/fontSize/fontFace/bold/italic/align/valign/fit/shape/line/radius are mapped when present.",
    "- Hidden reveal mapping: hiddenUntilBeat is hidden in Rich-before and WPS State 0, visible in Rich-after and WPS final state, and present in PowerPoint-rich package as native timed objects.",
    "",
    "## Summary",
    "",
    "| slide | title | element_count | web_preview_supported | pptx_export_supported | known_differences |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  ];

  for (const slide of spec.slides) {
    const elements = orderedElements(slide);
    const supported = elements.filter((element) => ["text", "shape", "image"].includes(element.kind)).length;
    lines.push(
      `| ${slide.id} | ${slide.title ?? slide.id} | ${elements.length} | ${supported} | ${supported} | ${previewKnownDifferences(slide).join("; ")} |`,
    );
  }

  lines.push("", "## Per-slide element checklist", "");
  for (const slide of spec.slides) {
    lines.push(`### ${slide.id} · ${slide.title ?? slide.id}`, "");
    lines.push("| layerRole | elementId | kind | web_preview | pptx_export | geometry | style | hiddenUntilBeat | notes |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const element of orderedElements(slide)) {
      const role = element.role ?? "unknown";
      const geometry = `x=${element.x} y=${element.y} w=${element.w} h=${element.h}`;
      const style = elementStyleSummary(element);
      lines.push(
        `| ${role} | ${element.id} | ${element.kind} | yes | yes | ${geometry} | ${style} | ${element.hiddenUntilBeat ?? "none"} | ${elementNotes(element)} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Known non-pixel differences",
    "",
    "- PowerPoint / Keynote text shaping can differ slightly from browser text rendering because PowerPoint uses Office text layout and browser uses CSS layout.",
    "- Web preview approximates PPTX `fit: shrink`; it preserves structure and hierarchy but does not implement PowerPoint's exact text fitting algorithm.",
    "- PowerPoint-rich keeps hiddenUntilBeat objects in the slide package and controls them with timing XML; Web preview hides or shows them by preview state.",
    "- WPS-compatible adds state badges in exported state pages for auditability; central Web preview defaults to a clean page and only shows state labels when overlay is enabled.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function previewKnownDifferences(slide: SlideSpec): string[] {
  const hasHidden = orderedElements(slide).some((element) => element.hiddenUntilBeat);
  const differences = ["text shaping not pixel-identical"];
  if (hasHidden) {
    differences.push("hiddenUntilBeat controlled by preview state on Web and timing/state pages in PPTX");
  }
  return differences;
}

function elementStyleSummary(element: ElementSpec): string {
  const parts: string[] = [];
  if ("fill" in element && element.fill) {
    parts.push(`fill=${element.fill}`);
  }
  if ("color" in element && element.color) {
    parts.push(`color=${element.color}`);
  }
  if ("fontSize" in element && element.fontSize) {
    parts.push(`fontSize=${element.fontSize}`);
  }
  if ("fontFace" in element && element.fontFace) {
    parts.push(`fontFace=${element.fontFace}`);
  }
  if ("bold" in element && element.bold) {
    parts.push("bold=true");
  }
  if ("align" in element && element.align) {
    parts.push(`align=${element.align}`);
  }
  if ("valign" in element && element.valign) {
    parts.push(`valign=${element.valign}`);
  }
  if ("shape" in element && element.shape) {
    parts.push(`shape=${element.shape}`);
  }
  if ("line" in element && element.line) {
    parts.push(`line=${element.line.color ?? "default"}/${element.line.width ?? 1}`);
  }
  if ("transparency" in element && element.transparency !== undefined) {
    parts.push(`transparency=${element.transparency}`);
  }
  if ("radius" in element && element.radius !== undefined) {
    parts.push(`radius=${element.radius}`);
  }
  return parts.length > 0 ? parts.join(", ") : "default";
}

function elementNotes(element: ElementSpec): string {
  if (element.kind === "image") {
    return `src=${element.src}`;
  }
  if (element.hiddenUntilBeat) {
    return "reveal element; Web thumbnails show final state";
  }
  return "base element";
}

function buildNativeTimingPlan(nativeTimings: NativeObjectTimingInfo[]): string[] {
  const lines: string[] = [];
  for (const timing of nativeTimings) {
    for (const target of timing.targets) {
      lines.push("  - export: powerpoint-rich");
      lines.push(`    slideId: ${timing.slideId}`);
      lines.push(`    slideNumber: ${timing.slideNumber}`);
      lines.push(`    sceneBeat: ${timing.sceneBeat}`);
      lines.push(`    targetElementId: ${target.elementId}`);
      lines.push(`    targetShapeId: ${target.shapeId}`);
      lines.push(`    targetShapeName: ${yamlString(target.shapeName)}`);
      lines.push(`    fallback: ${target.fallback}`);
      lines.push(`    effect: ${target.effect}`);
      lines.push(`    trigger: ${timing.trigger}`);
      lines.push(`    duration: ${target.durationMs}ms`);
      lines.push(`    startOffsetMs: ${target.startOffsetMs}`);
      lines.push(`    startMode: ${target.startMode}`);
    }
  }
  return lines;
}

function buildClickClusterPlan(spec: DeckSpec, nativeTimings: NativeObjectTimingInfo[]): string[] {
  const lines: string[] = [];
  const nativeTimingBySlideBeat = new Map(nativeTimings.map((timing) => [`${timing.slideId}:${timing.sceneBeat}`, timing]));

  for (const row of playbackRows(spec)) {
    const timing = nativeTimingBySlideBeat.get(`${row.slideId}:${row.beatId}`);
    lines.push(`  - id: ${clickClusterId(row.slideId, row.beatId, "rich")}`);
    lines.push("    export: powerpoint-rich");
    lines.push(`    slideId: ${row.slideId}`);
    lines.push(`    sceneBeat: ${row.beatId}`);
    lines.push("    click: 1");
    lines.push("    clickTriggerCount: 1");
    lines.push("    clusterBinding: shared-click-trigger-parent");
    lines.push("    visibleChangeRequired: true");
    lines.push("    autoRunsToCompletion: true");
    lines.push("    secondClickRequired: false");
    lines.push("    emptyWaitAllowed: false");
    lines.push("    orchestration: parallel-with-light-stagger");
    lines.push("    units:");
    if (!timing) {
      lines.push("      - unresolved: true");
    } else {
      for (const target of timing.targets) {
        lines.push(`      - elementId: ${target.elementId}`);
        lines.push(`        shapeId: ${target.shapeId}`);
        lines.push(`        role: ${target.role ?? "unknown"}`);
        lines.push(`        effect: ${target.effect}`);
        lines.push(`        startOffsetMs: ${target.startOffsetMs}`);
        lines.push(`        durationMs: ${target.durationMs}`);
        lines.push(`        startMode: ${target.startMode}`);
        lines.push("        triggerBinding: shared-click-trigger-parent");
        if (target.startOffsetMs > 0) {
          lines.push("        syncRole: accent-highlight-bar");
          lines.push("        automaticFollow: true");
          lines.push("        requiresSecondClick: false");
        }
      }
    }

    lines.push(`  - id: ${clickClusterId(row.slideId, row.beatId, "wps")}`);
    lines.push("    export: wps-compatible");
    lines.push(`    slideId: ${row.slideId}`);
    lines.push(`    sceneBeat: ${row.beatId}`);
    lines.push("    click: 1");
    lines.push("    clickTriggerCount: 1");
    lines.push("    visibleChangeRequired: true");
    lines.push("    autoRunsToCompletion: true");
    lines.push("    secondClickRequired: false");
    lines.push("    emptyWaitAllowed: false");
    lines.push("    orchestration: state-page-transition");
    lines.push("    units:");
    lines.push(`      - statePage: ${row.wpsStatePage}`);
    lines.push("        effect: fade-transition");
    lines.push("        representsElements:");
    for (const elementId of row.revealElements) {
      lines.push(`          - ${elementId}`);
    }
  }

  return lines;
}

function playbackRows(spec: DeckSpec): Array<{
  slideId: string;
  beatId: string;
  revealElements: string[];
  wpsStatePage: number;
}> {
  const rows: Array<{
    slideId: string;
    beatId: string;
    revealElements: string[];
    wpsStatePage: number;
  }> = [];
  let wpsPageNumber = 1;

  for (const slide of spec.slides) {
    wpsPageNumber += 1;
    for (const beat of slide.sceneBeats ?? []) {
      rows.push({
        slideId: slide.id,
        beatId: beat.id,
        revealElements: beat.revealElements ?? [],
        wpsStatePage: wpsPageNumber,
      });
      wpsPageNumber += 1;
    }
  }

  return rows;
}

function clickClusterId(slideId: string, beatId: string, suffix: "rich" | "wps"): string {
  return `click-${slideId}-${beatId}-${suffix}`;
}

function totalBeatCount(spec: DeckSpec): number {
  return spec.slides.reduce((sum, slide) => sum + (slide.sceneBeats?.length ?? 0), 0);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
