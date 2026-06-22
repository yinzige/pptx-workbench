import fs from "node:fs/promises";
import YAML from "yaml";
import type { CodexInboxEvent, CodexInboxStatus } from "./codexInbox.js";
import { readCodexInbox, updateCodexInboxEventStatus } from "./codexInbox.js";
import type { DeckSpec, ElementSpec, LayerSpec, SlideSpec, TextElementSpec } from "./deckTypes.js";
import { appendCodexBridgeReceipt, updateCodexBridgeEventForInbox } from "./codexBridge.js";
import { createUndoSnapshot, readUndoState, type UndoStateSummary } from "./undoManager.js";
import { markMatchingRevisionActionStatus, readRevisionPlan, type RevisionPlanSummary } from "./revisionPlan.js";
import { defaultSpecPath, loadDeckSpec } from "./specLoader.js";

export interface CodexQueueProcessResult {
  status: "idle" | "processed" | "needs-design" | "needs-codex" | "failed";
  processedCount: number;
  skippedCount: number;
  latestProcessed: ProcessedEventSummary | null;
  results: ProcessedEventSummary[];
  inbox: Awaited<ReturnType<typeof readCodexInbox>>;
  revision: RevisionPlanSummary;
  undo: UndoStateSummary;
}

export interface ProcessedEventSummary {
  eventId: string;
  slideId: string;
  objectId: string | null;
  instruction: string;
  status: CodexInboxStatus;
  reason?: string;
  diff?: {
    file: string;
    slideId: string;
    objectId: string | null;
    before: string;
    after: string;
  };
}

type DeterministicEditResult =
  | { ok: true; summary: string; before: string; after: string; affectedObjectId: string | null }
  | { ok: false; status: "needs-codex" | "failed"; reason: string };

export async function processCodexQueue(limit = 1): Promise<CodexQueueProcessResult> {
  const inbox = await readCodexInbox();
  const todos = inbox.events.filter((event) => event.status === "todo").slice(0, Math.max(1, limit));
  if (todos.length === 0) {
    return {
      status: "idle",
      processedCount: 0,
      skippedCount: 0,
      latestProcessed: null,
      results: [],
      inbox,
      revision: await readRevisionPlan(),
      undo: await readUndoState(),
    };
  }

  let spec = await loadDeckSpec(defaultSpecPath);

  const results: ProcessedEventSummary[] = [];
  for (const event of todos) {
    const beforeSpec = YAML.stringify(spec);
    const edit = applyDeterministicEdit(spec, event);
    if (!edit.ok) {
      await updateCodexInboxEventStatus(event.id, edit.status);
      if (edit.status === "failed") {
        await updateCodexBridgeEventForInbox(event.id, "failed", {
          error: edit.reason,
          payload: {
            inboxEventId: event.id,
            finalStatus: "failed",
            reason: edit.reason,
          },
        });
      }
      await appendCodexBridgeReceipt({
        kind: "annotation",
        status: edit.status,
        eventId: event.id,
        message: edit.reason,
        payload: {
          slideId: event.selectedSlideId,
          objectId: event.selectedObjectId,
          instruction: event.userInstruction,
        },
      });
      await markMatchingRevisionActionStatus({
        slideId: event.selectedSlideId,
        objectId: event.selectedObjectId,
        instruction: event.userInstruction,
        status: edit.status,
      });
      results.push({
        eventId: event.id,
        slideId: event.selectedSlideId,
        objectId: event.selectedObjectId,
        instruction: event.userInstruction,
        status: edit.status,
        reason: edit.reason,
      });
      continue;
    }

    const afterSpec = YAML.stringify(spec);
    if (afterSpec === beforeSpec) {
      await updateCodexInboxEventStatus(event.id, "failed");
      await updateCodexBridgeEventForInbox(event.id, "failed", {
        error: "处理后 deck-spec 没有产生 diff，拒绝标记为已处理。",
      });
      await appendCodexBridgeReceipt({
        kind: "annotation",
        status: "failed",
        eventId: event.id,
        message: "处理后 deck-spec 没有产生 diff，拒绝标记为已处理。",
      });
      await markMatchingRevisionActionStatus({
        slideId: event.selectedSlideId,
        objectId: event.selectedObjectId,
        instruction: event.userInstruction,
        status: "failed",
      });
      results.push({
        eventId: event.id,
        slideId: event.selectedSlideId,
        objectId: event.selectedObjectId,
        instruction: event.userInstruction,
        status: "failed",
        reason: "处理后 deck-spec 没有产生 diff，拒绝标记为已处理。",
      });
      continue;
    }

    await createUndoSnapshot({
      summary: `Codex 队列处理批注：${event.userInstruction}`,
      affectedSlides: [event.selectedSlideId],
      affectedObjects: event.selectedObjectId ? [event.selectedObjectId] : [],
      source: "codex-queue",
    });
    await fs.writeFile(defaultSpecPath, afterSpec, "utf8");
    const verifiedSpec = await loadDeckSpec(defaultSpecPath);
    const verification = verifyAppliedEdit(verifiedSpec, event, edit, beforeSpec);
    if (!verification.ok) {
      await fs.writeFile(defaultSpecPath, beforeSpec, "utf8");
      spec = await loadDeckSpec(defaultSpecPath);
      await updateCodexInboxEventStatus(event.id, "failed");
      await updateCodexBridgeEventForInbox(event.id, "failed", {
        error: verification.reason,
      });
      await appendCodexBridgeReceipt({
        kind: "annotation",
        status: "failed",
        eventId: event.id,
        message: verification.reason,
      });
      await markMatchingRevisionActionStatus({
        slideId: event.selectedSlideId,
        objectId: event.selectedObjectId,
        instruction: event.userInstruction,
        status: "failed",
      });
      results.push({
        eventId: event.id,
        slideId: event.selectedSlideId,
        objectId: event.selectedObjectId,
        instruction: event.userInstruction,
        status: "failed",
        reason: verification.reason,
      });
      continue;
    }

    await updateCodexInboxEventStatus(event.id, "applied");
    await updateCodexBridgeEventForInbox(event.id, "applied", {
      payload: {
        inboxEventId: event.id,
        finalStatus: "applied",
        processedBy: "deterministic-patch",
        diff: {
          file: defaultSpecPath,
          slideId: event.selectedSlideId,
          objectId: edit.affectedObjectId,
          before: edit.before,
          after: edit.after,
        },
      },
    });
    await appendCodexBridgeReceipt({
      kind: "annotation",
      status: "applied",
      eventId: event.id,
      message: "确定性批注已真实修改 deck-spec。",
      payload: {
        slideId: event.selectedSlideId,
        objectId: edit.affectedObjectId,
        instruction: event.userInstruction,
        before: edit.before,
        after: edit.after,
      },
    });
    await markMatchingRevisionActionStatus({
      slideId: event.selectedSlideId,
      objectId: event.selectedObjectId,
      instruction: event.userInstruction,
      status: "applied",
    });
    results.push({
      eventId: event.id,
      slideId: event.selectedSlideId,
      objectId: edit.affectedObjectId,
      instruction: event.userInstruction,
      status: "applied",
      diff: {
        file: defaultSpecPath,
        slideId: event.selectedSlideId,
        objectId: edit.affectedObjectId,
        before: edit.before,
        after: edit.after,
      },
    });
    spec = verifiedSpec;
  }

  const processedCount = results.filter((result) => result.status === "applied").length;
  const skippedCount = results.length - processedCount;
  return {
    status: processedCount > 0 ? "processed" : results.some((result) => result.status === "needs-codex" || result.status === "needs-design") ? "needs-codex" : "failed",
    processedCount,
    skippedCount,
    latestProcessed: results.at(-1) ?? null,
    results,
    inbox: await readCodexInbox(),
    revision: await readRevisionPlan(),
    undo: await readUndoState(),
  };
}

function applyDeterministicEdit(spec: DeckSpec, event: CodexInboxEvent): DeterministicEditResult {
  const slide = spec.slides.find((item) => item.id === event.selectedSlideId);
  if (!slide) {
    return { ok: false, status: "failed", reason: `找不到 slideId: ${event.selectedSlideId}` };
  }

  const lower = event.userInstruction.toLowerCase();
  if (isDesignRequest(lower, event.userInstruction)) {
    return { ok: false, status: "needs-codex", reason: "需要当前 Codex 对话处理：该批注属于审美或开放式改稿，无法安全自动执行。" };
  }

  if (event.scope === "object" && event.selectedObjectId) {
    const found = findElementWithLayer(slide, event.selectedObjectId);
    if (!found) {
      return { ok: false, status: "failed", reason: `找不到 selectedObjectId: ${event.selectedObjectId}` };
    }
    return applyObjectEdit(slide, found.layer, found.element, event);
  }

  return { ok: false, status: "needs-codex", reason: "区域/页面级批注已记录，但需要当前 Codex 对话根据上下文处理。" };
}

function applyObjectEdit(slide: SlideSpec, layer: LayerSpec, element: ElementSpec, event: CodexInboxEvent): DeterministicEditResult {
  const instruction = event.userInstruction.trim();
  const before = summarizeElement(element);

  if (/隐藏|hide/i.test(instruction)) {
    const record = element as ElementSpec & { hiddenUntilBeat?: string };
    record.hiddenUntilBeat = record.hiddenUntilBeat ?? "__hidden_by_codex__";
    return changedResult(before, summarizeElement(element), slide.id, element.id);
  }

  if (/删除(这个)?(对象|元素|形状|图片|图形)|删掉(这个)?(对象|元素|形状|图片|图形)/.test(instruction)) {
    const beforeCount = layer.elements.length;
    layer.elements = layer.elements.filter((item) => item.id !== element.id);
    if (layer.elements.length === beforeCount) {
      return { ok: false, status: "failed", reason: `删除对象失败：${element.id}` };
    }
    return { ok: true, summary: `删除对象 ${element.id}`, before, after: "[deleted]", affectedObjectId: element.id };
  }

  if (/移动|挪到|往左|往右|往上|往下/.test(instruction)) {
    const moved = applyMoveInstruction(element, instruction);
    return moved ? changedResult(before, summarizeElement(element), slide.id, element.id) : { ok: false, status: "needs-codex", reason: "移动指令缺少明确方向或距离。" };
  }

  if (/放大|缩小|宽|高|调整大小|尺寸/.test(instruction)) {
    const resized = applyResizeInstruction(element, instruction);
    return resized ? changedResult(before, summarizeElement(element), slide.id, element.id) : { ok: false, status: "needs-codex", reason: "尺寸指令缺少明确方向。" };
  }

  if (element.kind !== "text") {
    return { ok: false, status: "needs-codex", reason: "该对象不是文本；当前只支持确定性的文本小改、隐藏、删除、简单移动和缩放。" };
  }

  const textElement = element as TextElementSpec;
  const originalText = textElement.text;
  const replacement = parseReplacement(instruction);
  if (replacement) {
    if (!originalText.includes(replacement.from)) {
      return { ok: false, status: "failed", reason: `文本中找不到要替换的内容：${replacement.from}` };
    }
    textElement.text = originalText.replaceAll(replacement.from, replacement.to);
    return changedResult(before, summarizeElement(textElement), slide.id, textElement.id);
  }

  const deleteText = parseDeleteText(instruction);
  if (deleteText) {
    if (!originalText.includes(deleteText)) {
      return { ok: false, status: "failed", reason: `文本中找不到要删除的内容：${deleteText}` };
    }
    textElement.text = originalText.replaceAll(deleteText, "");
    return changedResult(before, summarizeElement(textElement), slide.id, textElement.id);
  }

  if (isSentencePeriodDeleteInstruction(instruction)) {
    const next = /内容中|文中|全部|所有|所有的|全部的/.test(instruction)
      ? originalText.replace(/[。.]/gu, "")
      : originalText.replace(/[。.]$/u, "") !== originalText
        ? originalText.replace(/[。.]$/u, "")
        : originalText.replace(/[。.]/u, "");
    if (next === originalText) {
      return { ok: false, status: "failed", reason: "目标文本没有句号可删除，未产生有效 diff。" };
    }
    textElement.text = next;
    return changedResult(before, summarizeElement(textElement), slide.id, textElement.id);
  }

  const setText = parseSetText(instruction);
  if (setText) {
    textElement.text = setText;
    return changedResult(before, summarizeElement(textElement), slide.id, textElement.id);
  }

  return { ok: false, status: "needs-codex", reason: "未识别为确定性小改，需要当前 Codex 对话处理。" };
}

function changedResult(before: string, after: string, slideId: string, objectId: string): DeterministicEditResult {
  if (before === after) {
    return { ok: false, status: "failed", reason: "处理后对象摘要没有变化。" };
  }
  return { ok: true, summary: `${slideId}/${objectId}`, before, after, affectedObjectId: objectId };
}

function verifyAppliedEdit(
  spec: DeckSpec,
  event: CodexInboxEvent,
  edit: Extract<DeterministicEditResult, { ok: true }>,
  beforeSpec: string,
): { ok: true } | { ok: false; reason: string } {
  const afterSpec = YAML.stringify(spec);
  if (afterSpec === beforeSpec) {
    return { ok: false, reason: "写回后 deck-spec 没有真实 diff，拒绝标记 applied。" };
  }
  const slide = spec.slides.find((item) => item.id === event.selectedSlideId);
  if (!slide) {
    return { ok: false, reason: `写回后找不到 slideId: ${event.selectedSlideId}` };
  }
  if (!edit.affectedObjectId) {
    return { ok: true };
  }
  const found = findElementWithLayer(slide, edit.affectedObjectId);
  if (edit.after === "[deleted]") {
    return found ? { ok: false, reason: `写回后对象仍存在，删除未生效：${edit.affectedObjectId}` } : { ok: true };
  }
  if (!found) {
    return { ok: false, reason: `写回后找不到 objectId: ${edit.affectedObjectId}` };
  }
  const verifiedAfter = summarizeElement(found.element);
  if (verifiedAfter !== edit.after) {
    return { ok: false, reason: `写回后对象摘要不匹配：expected ${edit.after}; actual ${verifiedAfter}` };
  }
  return { ok: true };
}

function isSentencePeriodDeleteInstruction(instruction: string): boolean {
  return /删除内容中的句号|删除文中的句号|删(除|掉)?(末尾|结尾)?(的)?[。.]|删除句号|删掉句号|去掉句号|不要句号|移除句号/.test(instruction);
}

function parseReplacement(instruction: string): { from: string; to: string } | null {
  const patterns = [
    /(?:把|将)(.+?)(?:替换|改成|换成|改为)(.+)$/u,
    /(?:替换|改成|换成|改为)\s*["“]?(.+?)["”]?\s*(?:为|成)\s*["“]?(.+?)["”]?$/u,
  ];
  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    if (match?.[1] && match[2]) {
      return { from: cleanQuoted(match[1]), to: cleanQuoted(match[2]) };
    }
  }
  return null;
}

function parseDeleteText(instruction: string): string | null {
  const match = instruction.match(/(?:删除|删掉|去掉|移除)\s*["“](.+?)["”]/u)
    ?? instruction.match(/(?:删除|删掉|去掉|移除)(?:文字|文本)?[:：]\s*(.+)$/u);
  return match?.[1] ? cleanQuoted(match[1]) : null;
}

function parseSetText(instruction: string): string | null {
  const match = instruction.match(/(?:标题|文本|文字)(?:改成|改为|设为|修改为)\s*["“]?(.+?)["”]?$/u);
  return match?.[1] ? cleanQuoted(match[1]) : null;
}

function cleanQuoted(value: string): string {
  return value.trim().replace(/^["“'‘]+|["”'’。]+$/g, "").trim();
}

function applyMoveInstruction(element: ElementSpec, instruction: string): boolean {
  const delta = extractNumber(instruction) ?? 0.12;
  let changed = false;
  if ("x" in element && /往左|左移|向左/.test(instruction)) {
    element.x = Number((element.x - delta).toFixed(3));
    changed = true;
  }
  if ("x" in element && /往右|右移|向右/.test(instruction)) {
    element.x = Number((element.x + delta).toFixed(3));
    changed = true;
  }
  if ("y" in element && /往上|上移|向上/.test(instruction)) {
    element.y = Number((element.y - delta).toFixed(3));
    changed = true;
  }
  if ("y" in element && /往下|下移|向下/.test(instruction)) {
    element.y = Number((element.y + delta).toFixed(3));
    changed = true;
  }
  return changed;
}

function applyResizeInstruction(element: ElementSpec, instruction: string): boolean {
  const ratio = /缩小|变小/.test(instruction) ? 0.92 : /放大|变大/.test(instruction) ? 1.08 : 1;
  if (!("w" in element) || !("h" in element)) {
    return false;
  }
  if (ratio !== 1) {
    element.w = Number((element.w * ratio).toFixed(3));
    element.h = Number((element.h * ratio).toFixed(3));
    return true;
  }
  const value = extractNumber(instruction);
  if (value === null) {
    return false;
  }
  if (/宽/.test(instruction)) {
    element.w = Number(value.toFixed(3));
    return true;
  }
  if (/高/.test(instruction)) {
    element.h = Number(value.toFixed(3));
    return true;
  }
  return false;
}

function extractNumber(instruction: string): number | null {
  const match = instruction.match(/(\d+(?:\.\d+)?)/);
  return match?.[1] ? Number(match[1]) : null;
}

function isDesignRequest(lower: string, instruction: string): boolean {
  return /高级|震撼|发布会|更好看|更美|酷|科技感|高级感|大气|精致|优化一下|美化|设计感/.test(instruction)
    || /premium|cool|better|beautiful|design|keynote/.test(lower);
}

function summarizeElement(element: ElementSpec): string {
  if (element.kind === "text") {
    return `text:${element.text}`;
  }
  const xywh = "x" in element ? ` x:${element.x} y:${element.y} w:${element.w} h:${element.h}` : "";
  return `${element.kind}:${element.id}${xywh}${element.hiddenUntilBeat ? ` hiddenUntilBeat:${element.hiddenUntilBeat}` : ""}`;
}

function findElementWithLayer(slide: SlideSpec, objectId: string): { layer: LayerSpec; element: ElementSpec } | undefined {
  for (const layer of slide.layers) {
    const element = layer.elements.find((item) => item.id === objectId);
    if (element) {
      return { layer, element };
    }
  }
  return undefined;
}
