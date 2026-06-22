import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { DeckSpec, ElementSpec, LayerRole, SceneBeatSpec, SlideSpec } from "./deckTypes.js";

const richAnimationDurationMs = 1100;
const richHighlightOffsetMs = 120;

export interface PptxPackageInspection {
  path: string;
  slideCount: number;
  transitionCount: number;
  timingCount: number;
  animEffectCount: number;
  clickTriggerCount: number;
  withEffectCount: number;
  afterEffectCount: number;
  hasTransition: boolean;
  hasTiming: boolean;
  hasAnimEffect: boolean;
  timingTargets: TimingTargetInspection[];
  slides: SlideXmlInspection[];
  slideEntries: string[];
}

export interface SlideXmlInspection {
  entry: string;
  slideNumber: number;
  transitionCount: number;
  timingCount: number;
  animEffectCount: number;
  clickTriggerCount: number;
  withEffectCount: number;
  afterEffectCount: number;
  timingTargets: TimingTargetInspection[];
}

export interface TimingTargetInspection {
  slideEntry: string;
  shapeId: number;
  exists: boolean;
}

export interface NativeObjectTimingInfo {
  slideId: string;
  slideNumber: number;
  sceneBeat: string;
  targetElementId: string;
  targetShapeId: number;
  targetShapeName: string;
  effect: "fade";
  trigger: "on-click";
  durationMs: number;
  startMode: "clickEffect";
  fallback: "none" | "expected-order";
  targets: NativeObjectTimingTarget[];
}

export interface NativeObjectTimingTarget {
  elementId: string;
  shapeId: number;
  shapeName: string;
  effect: "fade";
  durationMs: number;
  startOffsetMs: number;
  startMode: "withEffect";
  role: LayerRole | undefined;
  fallback: "none" | "expected-order";
}

export async function addFadeTransitions(pptxPath: string): Promise<PptxPackageInspection> {
  const zip = await loadPackage(pptxPath);
  const slideEntries = getSlideEntries(zip);

  for (const entry of slideEntries) {
    const file = zip.file(entry);
    if (!file) {
      throw new Error(`Slide entry disappeared while patching: ${entry}`);
    }
    const xml = await file.async("string");
    zip.file(entry, withFadeTransition(xml));
  }

  const updated = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  await fs.writeFile(pptxPath, updated);

  return inspectPptxPackage(pptxPath);
}

export async function addPowerPointRichMotion(pptxPath: string, spec: DeckSpec): Promise<NativeObjectTimingInfo[]> {
  const zip = await loadPackage(pptxPath);
  const slideEntries = getSlideEntries(zip);
  const targetsBySlideIndex = new Map(selectNativeTimingTargets(spec).map((target) => [target.slideIndex, target]));
  const timings: NativeObjectTimingInfo[] = [];

  for (let slideIndex = 0; slideIndex < slideEntries.length; slideIndex += 1) {
    const slideEntry = slideEntries[slideIndex];
    const file = zip.file(slideEntry);
    if (!file) {
      throw new Error(`Cannot inject motion: missing slide entry ${slideEntry}`);
    }

    const target = targetsBySlideIndex.get(slideIndex);
    const withTransition = withFadeTransition(await file.async("string"));
    if (!target) {
      zip.file(slideEntry, withTransition);
      continue;
    }

    const shapeTargets = target.elements.map((elementTarget, index) => {
      const shapeTarget = locateTargetShape(
        withTransition,
        elementTarget.element,
        elementTarget.expectedElementIndex,
      );
      return {
        elementId: elementTarget.element.id,
        shapeId: shapeTarget.shapeId,
        shapeName: shapeTarget.shapeName,
        effect: "fade" as const,
        durationMs: richAnimationDurationMs,
        startOffsetMs: index === 0 ? 0 : richHighlightOffsetMs,
        startMode: "withEffect" as const,
        role: elementTarget.element.role,
        fallback: shapeTarget.fallback,
      };
    });
    const primaryTarget = shapeTargets[0];
    if (!primaryTarget) {
      throw new Error(`Cannot inject timing: no PowerPoint-rich timing targets were resolved for ${target.slide.id}`);
    }

    zip.file(slideEntry, withNativeFadeTiming(withTransition, shapeTargets));
    timings.push({
      slideId: target.slide.id,
      slideNumber: slideIndex + 1,
      sceneBeat: target.sceneBeat?.id ?? "slide-entry",
      targetElementId: primaryTarget.elementId,
      targetShapeId: primaryTarget.shapeId,
      targetShapeName: primaryTarget.shapeName,
      effect: "fade",
      trigger: "on-click",
      durationMs: richAnimationDurationMs,
      startMode: "clickEffect",
      fallback: primaryTarget.fallback,
      targets: shapeTargets,
    });
  }

  const updated = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  await fs.writeFile(pptxPath, updated);

  if (timings.length === 0) {
    throw new Error("Cannot inject timing: no PowerPoint-rich timing targets were resolved");
  }
  return timings;
}

export async function inspectPptxPackage(pptxPath: string): Promise<PptxPackageInspection> {
  const zip = await loadPackage(pptxPath);
  return inspectPptxZip(zip, path.resolve(pptxPath));
}

export async function inspectPptxBuffer(buffer: Buffer, label = "uploaded.pptx"): Promise<PptxPackageInspection> {
  const zip = await JSZip.loadAsync(buffer);
  return inspectPptxZip(zip, label);
}

async function inspectPptxZip(zip: JSZip, sourceLabel: string): Promise<PptxPackageInspection> {
  const slideEntries = getSlideEntries(zip);
  let transitionCount = 0;
  let timingCount = 0;
  let animEffectCount = 0;
  let clickTriggerCount = 0;
  let withEffectCount = 0;
  let afterEffectCount = 0;
  const timingTargets: TimingTargetInspection[] = [];
  const slides: SlideXmlInspection[] = [];

  for (const entry of slideEntries) {
    const file = zip.file(entry);
    if (!file) {
      throw new Error(`Missing slide XML: ${entry}`);
    }
    const xml = await file.async("string");
    const slideTransitionCount = countOccurrences(xml, /<p:transition\b/g);
    const slideTimingCount = countOccurrences(xml, /<p:timing\b/g);
    const slideAnimEffectCount = countOccurrences(xml, /<p:animEffect\b/g);
    const slideClickTriggerCount = countOccurrences(xml, /nodeType="clickEffect"/g);
    const slideWithEffectCount = countOccurrences(xml, /nodeType="withEffect"/g);
    const slideAfterEffectCount = countOccurrences(xml, /nodeType="afterEffect"/g);
    transitionCount += slideTransitionCount;
    timingCount += slideTimingCount;
    animEffectCount += slideAnimEffectCount;
    clickTriggerCount += slideClickTriggerCount;
    withEffectCount += slideWithEffectCount;
    afterEffectCount += slideAfterEffectCount;

    const shapeIds = new Set(extractShapeIds(xml));
    const slideTimingTargets: TimingTargetInspection[] = [];
    for (const shapeId of extractTimingTargetShapeIds(xml)) {
      const inspection = {
        slideEntry: entry,
        shapeId,
        exists: shapeIds.has(shapeId),
      };
      timingTargets.push(inspection);
      slideTimingTargets.push(inspection);
    }
    slides.push({
      entry,
      slideNumber: slideNumber(entry),
      transitionCount: slideTransitionCount,
      timingCount: slideTimingCount,
      animEffectCount: slideAnimEffectCount,
      clickTriggerCount: slideClickTriggerCount,
      withEffectCount: slideWithEffectCount,
      afterEffectCount: slideAfterEffectCount,
      timingTargets: slideTimingTargets,
    });
  }

  return {
    path: sourceLabel,
    slideCount: slideEntries.length,
    transitionCount,
    timingCount,
    animEffectCount,
    clickTriggerCount,
    withEffectCount,
    afterEffectCount,
    hasTransition: transitionCount > 0,
    hasTiming: timingCount > 0,
    hasAnimEffect: animEffectCount > 0,
    timingTargets,
    slides,
    slideEntries,
  };
}

async function loadPackage(pptxPath: string): Promise<JSZip> {
  const buffer = await fs.readFile(pptxPath);
  return JSZip.loadAsync(buffer);
}

function getSlideEntries(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
}

function slideNumber(entry: string): number {
  const match = /slide(\d+)\.xml$/.exec(entry);
  if (!match) {
    throw new Error(`Invalid slide entry: ${entry}`);
  }
  return Number(match[1]);
}

function withFadeTransition(xml: string): string {
  const withoutExistingTransition = xml.replace(
    /<p:transition\b[\s\S]*?<\/p:transition>|<p:transition\b[^>]*\/>/g,
    "",
  );
  const transitionXml = '<p:transition spd="med" advClick="1"><p:fade/></p:transition>';

  if (withoutExistingTransition.includes("</p:clrMapOvr>")) {
    return withoutExistingTransition.replace("</p:clrMapOvr>", `</p:clrMapOvr>${transitionXml}`);
  }
  if (withoutExistingTransition.includes("</p:cSld>")) {
    return withoutExistingTransition.replace("</p:cSld>", `</p:cSld>${transitionXml}`);
  }
  throw new Error("Cannot insert transition: slide XML has no cSld/clrMapOvr anchor");
}

function withNativeFadeTiming(xml: string, targets: NativeObjectTimingTarget[]): string {
  const withoutExistingTiming = xml.replace(/<p:timing\b[\s\S]*?<\/p:timing>/g, "");
  const timingXml = buildNativeFadeTimingXml(targets);

  if (withoutExistingTiming.includes("</p:transition>")) {
    return withoutExistingTiming.replace("</p:transition>", `</p:transition>${timingXml}`);
  }
  if (withoutExistingTiming.match(/<p:transition\b[^>]*\/>/)) {
    return withoutExistingTiming.replace(/(<p:transition\b[^>]*\/>)/, `$1${timingXml}`);
  }
  if (withoutExistingTiming.includes("</p:clrMapOvr>")) {
    return withoutExistingTiming.replace("</p:clrMapOvr>", `</p:clrMapOvr>${timingXml}`);
  }
  if (withoutExistingTiming.includes("</p:cSld>")) {
    return withoutExistingTiming.replace("</p:cSld>", `</p:cSld>${timingXml}`);
  }
  throw new Error("Cannot insert timing: slide XML has no transition/cSld/clrMapOvr anchor");
}

function buildNativeFadeTimingXml(targets: NativeObjectTimingTarget[]): string {
  if (targets.length === 0) {
    throw new Error("Cannot build timing XML without targets");
  }
  let nextId = 4;
  const targetBlocks: string[] = [];
  for (const target of targets) {
    const leafId = nextId;
    const setId = nextId + 1;
    const effectId = nextId + 2;
    nextId += 3;
    targetBlocks.push(
      [
        "<p:par>",
        `<p:cTn id="${leafId}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="withEffect">`,
        `<p:stCondLst><p:cond delay="${target.startOffsetMs}"/></p:stCondLst>`,
        "<p:childTnLst>",
        "<p:set>",
        "<p:cBhvr>",
        `<p:cTn id="${setId}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>`,
        `<p:tgtEl><p:spTgt spid="${target.shapeId}"/></p:tgtEl>`,
        "<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>",
        "</p:cBhvr>",
        '<p:to><p:strVal val="visible"/></p:to>',
        "</p:set>",
        '<p:animEffect transition="in" filter="fade">',
        "<p:cBhvr>",
        `<p:cTn id="${effectId}" dur="${target.durationMs}"/>`,
        `<p:tgtEl><p:spTgt spid="${target.shapeId}"/></p:tgtEl>`,
        "</p:cBhvr>",
        "</p:animEffect>",
        "</p:childTnLst>",
        "</p:cTn>",
        "</p:par>",
      ].join(""),
    );
  }
  const buildList = targets.map((target) => `<p:bldP spid="${target.shapeId}" grpId="0"/>`).join("");
  return [
    "<p:timing>",
    "<p:tnLst>",
    "<p:par>",
    '<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">',
    "<p:childTnLst>",
    '<p:seq concurrent="1" nextAc="seek">',
    '<p:cTn id="2" dur="indefinite" nodeType="mainSeq">',
    "<p:childTnLst>",
    "<p:par>",
    '<p:cTn id="3" fill="hold" nodeType="clickEffect">',
    '<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>',
    "<p:childTnLst>",
    ...targetBlocks,
    "</p:childTnLst>",
    "</p:cTn>",
    "</p:par>",
    "</p:childTnLst>",
    "</p:cTn>",
    '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>',
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>',
    "</p:seq>",
    "</p:childTnLst>",
    "</p:cTn>",
    "</p:par>",
    "</p:tnLst>",
    `<p:bldLst>${buildList}</p:bldLst>`,
    "</p:timing>",
  ].join("");
}

function selectNativeTimingTargets(spec: DeckSpec): Array<{
  slide: SlideSpec;
  slideIndex: number;
  sceneBeat: SceneBeatSpec | undefined;
  elements: Array<{ element: ElementSpec; expectedElementIndex: number }>;
}> {
  const targets: Array<{
    slide: SlideSpec;
    slideIndex: number;
    sceneBeat: SceneBeatSpec | undefined;
    elements: Array<{ element: ElementSpec; expectedElementIndex: number }>;
  }> = [];

  for (let slideIndex = 0; slideIndex < spec.slides.length; slideIndex += 1) {
    const slide = spec.slides[slideIndex];
    const sceneBeat = slide.sceneBeats?.[0];
    const elements = orderedElements(slide);

    const revealedElements = (sceneBeat?.revealElements ?? [])
      .map((elementId) => findElementInSlide(slide, elementId))
      .filter((element): element is { element: ElementSpec; expectedElementIndex: number } => Boolean(element))
      .slice(0, 2);

    if (revealedElements.length > 0) {
      targets.push({
        slide,
        slideIndex,
        sceneBeat,
        elements: revealedElements,
      });
      continue;
    }

    const elementIndex = elements.findIndex((element) => element.kind === "text");
    if (elementIndex >= 0) {
      targets.push({
        slide,
        slideIndex,
        sceneBeat,
        elements: [{ element: elements[elementIndex], expectedElementIndex: elementIndex }],
      });
    }
  }

  if (targets.length === 0) {
    throw new Error("Cannot inject timing: no semantic element found in deck spec");
  }
  return targets;
}

function findElementInSlide(
  slide: SlideSpec,
  elementId: string,
): { element: ElementSpec; expectedElementIndex: number } | undefined {
  const elements = orderedElements(slide);
  const elementIndex = elements.findIndex((element) => element.id === elementId);
  if (elementIndex < 0) {
    return undefined;
  }
  return { element: elements[elementIndex], expectedElementIndex: elementIndex };
}

function orderedElements(slide: SlideSpec): ElementSpec[] {
  const layerOrder: LayerRole[] = ["background", "decor", "hero", "text", "info_layer"];
  return [...slide.layers]
    .sort((a, b) => layerOrder.indexOf(a.role) - layerOrder.indexOf(b.role))
    .flatMap((layer) => layer.elements.map((element) => ({ ...element, role: element.role ?? layer.role })));
}

function findSceneBeatForElement(slide: SlideSpec, element: ElementSpec): SceneBeatSpec | undefined {
  return slide.sceneBeats?.find(
    (beat) => beat.id === element.hiddenUntilBeat || beat.revealElements?.includes(element.id),
  );
}

function locateTargetShape(
  slideXml: string,
  element: ElementSpec,
  expectedElementIndex: number,
): { shapeId: number; shapeName: string; fallback: "none" | "expected-order" } {
  if (element.kind === "text") {
    const textMatch = locateTextShape(slideXml, element.text);
    if (textMatch) {
      return { ...textMatch, fallback: "none" };
    }
  }

  const shapes = extractDirectShapeRefs(slideXml);
  const shape = shapes[expectedElementIndex];
  if (!shape) {
    throw new Error(
      `Cannot inject timing: target element ${element.id} was not found by text and expected order ${expectedElementIndex} is missing`,
    );
  }
  return {
    shapeId: shape.shapeId,
    shapeName: shape.shapeName,
    fallback: "expected-order",
  };
}

function locateTextShape(slideXml: string, text: string): { shapeId: number; shapeName: string } | undefined {
  const escapedText = xmlEscape(text);
  const shapeBlocks = slideXml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? [];
  for (const block of shapeBlocks) {
    if (!block.includes(`<a:t>${escapedText}</a:t>`)) {
      continue;
    }
    const ref = extractShapeRef(block);
    if (ref) {
      return ref;
    }
  }
  return undefined;
}

function extractDirectShapeRefs(slideXml: string): Array<{ shapeId: number; shapeName: string }> {
  const blocks = slideXml.match(/<p:(?:sp|pic|graphicFrame|grpSp)\b[\s\S]*?<\/p:(?:sp|pic|graphicFrame|grpSp)>/g) ?? [];
  return blocks.flatMap((block) => {
    const ref = extractShapeRef(block);
    return ref ? [ref] : [];
  });
}

function extractShapeRef(xml: string): { shapeId: number; shapeName: string } | undefined {
  const match = /<p:cNvPr\b[^>]*\bid="(\d+)"[^>]*\bname="([^"]*)"/.exec(xml);
  if (!match) {
    return undefined;
  }
  return {
    shapeId: Number(match[1]),
    shapeName: xmlUnescape(match[2]),
  };
}

function extractShapeIds(xml: string): number[] {
  return [...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map((match) => Number(match[1]));
}

function extractTimingTargetShapeIds(xml: string): number[] {
  return [...xml.matchAll(/<p:spTgt\b[^>]*\bspid="(\d+)"/g)].map((match) => Number(match[1]));
}

function countOccurrences(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlUnescape(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}
