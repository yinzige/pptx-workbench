import fs from "node:fs/promises";
import path from "node:path";
import { resolveFromProject } from "./paths.js";

export type CodexInboxScope = "object" | "region" | "slide";
export type CodexInboxStatus = "todo" | "applied" | "skipped" | "needs-design" | "needs-codex" | "failed";

export interface SelectionBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CodexInboxEvent {
  id: string;
  selectedSlideId: string;
  selectedObjectId: string | null;
  selectedObjectType: string;
  objectRole?: string;
  selectionBounds: SelectionBounds;
  candidateObjectIds?: string[];
  userInstruction: string;
  scope: CodexInboxScope;
  status: CodexInboxStatus;
  createdAt: string;
}

export interface CodexInboxSummary {
  path: string;
  eventCount: number;
  latestEvent: CodexInboxEvent | null;
  events: CodexInboxEvent[];
}

export const codexInboxPath = resolveFromProject("events", "codex-inbox.jsonl");

export async function ensureCodexInboxFile(): Promise<void> {
  await fs.mkdir(path.dirname(codexInboxPath), { recursive: true });
  await fs.appendFile(codexInboxPath, "", "utf8");
}

export async function readCodexInbox(): Promise<CodexInboxSummary> {
  await ensureCodexInboxFile();
  const source = await fs.readFile(codexInboxPath, "utf8");
  const events = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => normalizeStoredEvent(JSON.parse(line)));
  return {
    path: codexInboxPath,
    eventCount: events.length,
    latestEvent: events.at(-1) ?? null,
    events,
  };
}

export async function appendCodexInboxEvent(input: unknown): Promise<CodexInboxSummary> {
  const event = normalizeNewEvent(input);
  await ensureCodexInboxFile();
  const current = await readCodexInbox();
  const duplicate = current.events.some((item) => {
    return item.status === "todo"
      && item.selectedSlideId === event.selectedSlideId
      && item.selectedObjectId === event.selectedObjectId
      && item.scope === event.scope
      && item.userInstruction === event.userInstruction
      && JSON.stringify(item.selectionBounds) === JSON.stringify(event.selectionBounds);
  });
  if (!duplicate) {
    await fs.appendFile(codexInboxPath, `${JSON.stringify(event)}\n`, "utf8");
  }
  return readCodexInbox();
}

export async function deleteCodexInboxEvent(id: string): Promise<CodexInboxSummary> {
  const current = await readCodexInbox();
  const nextEvents = current.events.filter((event) => !(event.id === id && event.status === "todo"));
  await fs.writeFile(codexInboxPath, nextEvents.map((event) => JSON.stringify(event)).join("\n") + (nextEvents.length > 0 ? "\n" : ""), "utf8");
  return readCodexInbox();
}

export async function updateCodexInboxEventStatus(id: string, status: CodexInboxStatus): Promise<CodexInboxSummary> {
  const current = await readCodexInbox();
  const nextEvents = current.events.map((event) => event.id === id ? { ...event, status } : event);
  await fs.writeFile(codexInboxPath, nextEvents.map((event) => JSON.stringify(event)).join("\n") + (nextEvents.length > 0 ? "\n" : ""), "utf8");
  return readCodexInbox();
}

function normalizeNewEvent(value: unknown): CodexInboxEvent {
  const record = isRecord(value) ? value : {};
  const createdAt = new Date().toISOString();
  const scope = normalizeScope(record.scope);
  const selectedObjectId = scope === "object" ? normalizeRequiredString(record.selectedObjectId, "selectedObjectId") : null;
  return {
    id: normalizeOptionalString(record.id) ?? createEventId(createdAt),
    selectedSlideId: normalizeRequiredString(record.selectedSlideId, "selectedSlideId"),
    selectedObjectId,
    selectedObjectType: scope === "object"
      ? normalizeRequiredString(record.selectedObjectType, "selectedObjectType")
      : scope,
    ...normalizeObjectRole(record.objectRole),
    selectionBounds: normalizeBounds(record.selectionBounds),
    ...normalizeCandidateObjectIds(record.candidateObjectIds),
    userInstruction: normalizeRequiredString(record.userInstruction, "userInstruction"),
    scope,
    status: normalizeStatus(record.status),
    createdAt,
  };
}

function normalizeStoredEvent(value: unknown): CodexInboxEvent {
  const record = isRecord(value) ? value : {};
  const scope = normalizeScope(record.scope);
  return {
    id: normalizeRequiredString(record.id, "id"),
    selectedSlideId: normalizeRequiredString(record.selectedSlideId, "selectedSlideId"),
    selectedObjectId: scope === "object" ? normalizeRequiredString(record.selectedObjectId, "selectedObjectId") : null,
    selectedObjectType: normalizeRequiredString(record.selectedObjectType, "selectedObjectType"),
    ...normalizeObjectRole(record.objectRole),
    selectionBounds: normalizeBounds(record.selectionBounds),
    ...normalizeCandidateObjectIds(record.candidateObjectIds),
    userInstruction: normalizeRequiredString(record.userInstruction, "userInstruction"),
    scope,
    status: normalizeStatus(record.status),
    createdAt: normalizeRequiredString(record.createdAt, "createdAt"),
  };
}

function normalizeBounds(value: unknown): SelectionBounds {
  const record = isRecord(value) ? value : {};
  return {
    x: normalizeFiniteNumber(record.x, "selectionBounds.x"),
    y: normalizeFiniteNumber(record.y, "selectionBounds.y"),
    w: normalizeFiniteNumber(record.w, "selectionBounds.w"),
    h: normalizeFiniteNumber(record.h, "selectionBounds.h"),
  };
}

function normalizeStatus(value: unknown): CodexInboxStatus {
  if (value === "applied" || value === "skipped" || value === "needs-design" || value === "needs-codex" || value === "failed") {
    return value;
  }
  return "todo";
}

function normalizeScope(value: unknown): CodexInboxScope {
  if (value === "region" || value === "slide") {
    return value;
  }
  return "object";
}

function normalizeObjectRole(value: unknown): Pick<CodexInboxEvent, "objectRole"> {
  const text = normalizeOptionalString(value);
  return text ? { objectRole: text } : {};
}

function normalizeCandidateObjectIds(value: unknown): Pick<CodexInboxEvent, "candidateObjectIds"> {
  if (!Array.isArray(value)) {
    return {};
  }
  const candidateObjectIds = value
    .map((item) => normalizeOptionalString(item))
    .filter((item): item is string => Boolean(item));
  return candidateObjectIds.length > 0 ? { candidateObjectIds } : {};
}

function normalizeRequiredString(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`Missing required Codex inbox field: ${field}`);
  }
  return text;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function normalizeFiniteNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Codex inbox number: ${field}`);
  }
  return parsed;
}

function createEventId(createdAt: string): string {
  return `inbox-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
