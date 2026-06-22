import fs from "node:fs/promises";
import path from "node:path";
import { resolveFromProject } from "./paths.js";

export type PlaybackQaMode = "Rich" | "WPS";
export type PlaybackQaEventType = "scene-beat-click" | "slide-transition" | "exit";

export interface PlaybackQaRecord {
  event_type: PlaybackQaEventType;
  click_index: number;
  slideId: string;
  slideNumber: number;
  previewMode: PlaybackQaMode;
  scene_beat: string;
  visible_change: string;
  auto_completed: boolean;
  empty_wait_seconds: number;
  manual_extra_clicks_required: boolean;
  startedAt?: string;
  endedAt?: string;
  click_overrun?: boolean;
  invisible_change_risk?: boolean;
  animatedObjectIds?: string[];
  skippedStaticObjectIds?: string[];
  animationEffects?: Record<string, string>;
  fallbackUsed?: boolean;
  animationCompleted?: boolean;
  transitionEffect?: string;
  transitionDirection?: string;
  transitionDurationMs?: number;
  transitionFallbackUsed?: boolean;
  transitionCompleted?: boolean;
}

export interface PlaybackQaSession {
  sessionId: string;
  projectName: string;
  startedAt: string;
  endedAt: string;
  mode: PlaybackQaMode;
  slideCount: number;
  coveredSlides: number[];
  expectedSlides: number;
  totalClicks: number;
  sceneBeatClicks: number;
  clickOverrunCount: number;
  invisibleChangeRiskCount: number;
  emptyWaitTotalSeconds: number;
  slideTransitions: number;
  manualExtraClicks: number;
  records: PlaybackQaRecord[];
  conclusion: string;
}

export interface PlaybackQaSummary {
  logPath: string;
  playbackQaPath: string;
  sessionCount: number;
  latestSession: PlaybackQaSession | null;
  riskStats: {
    clickOverrunCount: number;
    invisibleChangeRiskCount: number;
    emptyWaitTotalSeconds: number;
  };
}

export const playbackQaLogPath = resolveFromProject("outputs", "playback-qa-log.jsonl");
export const playbackQaMarkdownPath = resolveFromProject("outputs", "playback-qa.md");

export async function ensurePlaybackQaLogFile(): Promise<void> {
  await fs.mkdir(path.dirname(playbackQaLogPath), { recursive: true });
  await fs.appendFile(playbackQaLogPath, "", "utf8");
}

export async function readPlaybackQaSummary(): Promise<PlaybackQaSummary> {
  await ensurePlaybackQaLogFile();
  const sessions = await readPlaybackQaSessions();
  const latestSession = sessions.at(-1) ?? null;
  return {
    logPath: playbackQaLogPath,
    playbackQaPath: playbackQaMarkdownPath,
    sessionCount: sessions.length,
    latestSession,
    riskStats: {
      clickOverrunCount: sessions.reduce((sum, session) => sum + session.clickOverrunCount, 0),
      invisibleChangeRiskCount: sessions.reduce((sum, session) => sum + session.invisibleChangeRiskCount, 0),
      emptyWaitTotalSeconds: sessions.reduce((sum, session) => sum + session.emptyWaitTotalSeconds, 0),
    },
  };
}

export async function appendPlaybackQaSession(input: unknown): Promise<PlaybackQaSummary> {
  const session = normalizePlaybackQaSession(input);
  await fs.mkdir(path.dirname(playbackQaLogPath), { recursive: true });
  await fs.appendFile(playbackQaLogPath, `${JSON.stringify(session)}\n`, "utf8");
  await updatePlaybackQaMarkdown(session);
  return readPlaybackQaSummary();
}

async function readPlaybackQaSessions(): Promise<PlaybackQaSession[]> {
  try {
    const source = await fs.readFile(playbackQaLogPath, "utf8");
    return source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => normalizePlaybackQaSession(JSON.parse(line)));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function updatePlaybackQaMarkdown(session: PlaybackQaSession): Promise<void> {
  let source = "";
  try {
    source = await fs.readFile(playbackQaMarkdownPath, "utf8");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const marker = "\n## Recent in-workbench playback QA session\n";
  const base = source.includes(marker) ? source.slice(0, source.indexOf(marker)) : source.trimEnd();
  const summary = [
    marker.trimEnd(),
    "",
    `- sessionId: ${session.sessionId}`,
    `- projectName: ${session.projectName}`,
    `- mode: ${session.mode}`,
    `- startedAt: ${session.startedAt}`,
    `- endedAt: ${session.endedAt}`,
    `- slideCount: ${session.slideCount}`,
    `- expectedSlides: ${session.expectedSlides}`,
    `- coveredSlides: ${session.coveredSlides.join(", ") || "none"}`,
    `- totalClicks: ${session.totalClicks}`,
    `- sceneBeatClicks: ${session.sceneBeatClicks}`,
    `- slideTransitions: ${session.slideTransitions}`,
    `- manualExtraClicks: ${session.manualExtraClicks}`,
    `- clickOverrunCount: ${session.clickOverrunCount}`,
    `- invisibleChangeRiskCount: ${session.invisibleChangeRiskCount}`,
    `- emptyWaitTotalSeconds: ${session.emptyWaitTotalSeconds}`,
    `- latestAnimatedObjectIds: ${session.records.at(-1)?.animatedObjectIds?.join(", ") || "none"}`,
    `- latestAnimationEffects: ${JSON.stringify(session.records.at(-1)?.animationEffects ?? {})}`,
    `- latestFallbackUsed: ${session.records.at(-1)?.fallbackUsed ?? false}`,
    `- latestTransitionEffect: ${session.records.at(-1)?.transitionEffect ?? "none"}`,
    `- latestTransitionCompleted: ${session.records.at(-1)?.transitionCompleted ?? false}`,
    `- conclusion: ${session.conclusion}`,
    "",
    "Records are appended to `outputs/playback-qa-log.jsonl`; this markdown keeps only the latest in-workbench playback QA summary.",
    "",
  ].join("\n");
  await fs.writeFile(playbackQaMarkdownPath, `${base}\n\n${summary}`, "utf8");
}

function normalizePlaybackQaSession(value: unknown): PlaybackQaSession {
  const record = isRecord(value) ? value : {};
  const records = Array.isArray(record.records) ? record.records.map(normalizePlaybackQaRecord) : [];
  const totalClicks = normalizeNonNegativeInteger(record.totalClicks, records.length);
  const clickOverrunCount = normalizeNonNegativeInteger(
    record.clickOverrunCount,
    records.filter((item) => item.click_overrun || item.manual_extra_clicks_required).length,
  );
  const invisibleChangeRiskCount = normalizeNonNegativeInteger(
    record.invisibleChangeRiskCount,
    records.filter((item) => item.invisible_change_risk || item.visible_change.trim().length === 0).length,
  );
  const emptyWaitTotalSeconds = normalizeNonNegativeNumber(
    record.emptyWaitTotalSeconds,
    records.reduce((sum, item) => sum + item.empty_wait_seconds, 0),
  );
  const coveredSlides = normalizeNumberArray(record.coveredSlides, records.map((item) => item.slideNumber));
  const sceneBeatClicks = normalizeNonNegativeInteger(
    record.sceneBeatClicks,
    records.filter((item) => item.event_type === "scene-beat-click").length,
  );
  const manualExtraClicks = normalizeNonNegativeInteger(
    record.manualExtraClicks,
    records.filter((item) => item.manual_extra_clicks_required).length,
  );
  return {
    sessionId: normalizeString(record.sessionId, `playback-${Date.now()}`),
    projectName: normalizeString(record.projectName, "unknown-project"),
    startedAt: normalizeIsoLike(record.startedAt),
    endedAt: normalizeIsoLike(record.endedAt),
    mode: record.mode === "WPS" ? "WPS" : "Rich",
    slideCount: normalizeNonNegativeInteger(record.slideCount, 0),
    coveredSlides,
    expectedSlides: normalizeNonNegativeInteger(record.expectedSlides, normalizeNonNegativeInteger(record.slideCount, 0)),
    totalClicks,
    sceneBeatClicks,
    clickOverrunCount,
    invisibleChangeRiskCount,
    emptyWaitTotalSeconds,
    slideTransitions: normalizeNonNegativeInteger(record.slideTransitions, 0),
    manualExtraClicks,
    records,
    conclusion: normalizeString(record.conclusion, "No conclusion provided."),
  };
}

function normalizePlaybackQaRecord(value: unknown): PlaybackQaRecord {
  const record = isRecord(value) ? value : {};
  const visibleChange = normalizeString(record.visible_change, "");
  const emptyWait = normalizeNonNegativeNumber(record.empty_wait_seconds, 0);
  const manualExtraClicks = Boolean(record.manual_extra_clicks_required);
  return {
    event_type: normalizePlaybackEventType(record.event_type),
    click_index: normalizeNonNegativeInteger(record.click_index, 0),
    slideId: normalizeString(record.slideId, "unknown"),
    slideNumber: normalizeNonNegativeInteger(record.slideNumber, 1),
    previewMode: record.previewMode === "WPS" ? "WPS" : "Rich",
    scene_beat: normalizeString(record.scene_beat, "unknown"),
    visible_change: visibleChange,
    auto_completed: record.auto_completed !== false,
    empty_wait_seconds: emptyWait,
    manual_extra_clicks_required: manualExtraClicks,
    startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
    endedAt: typeof record.endedAt === "string" ? record.endedAt : undefined,
    click_overrun: Boolean(record.click_overrun),
    invisible_change_risk: Boolean(record.invisible_change_risk) || visibleChange.trim().length === 0,
    animatedObjectIds: normalizeStringArray(record.animatedObjectIds),
    skippedStaticObjectIds: normalizeStringArray(record.skippedStaticObjectIds),
    animationEffects: normalizeStringRecord(record.animationEffects),
    fallbackUsed: Boolean(record.fallbackUsed),
    animationCompleted: record.animationCompleted !== false,
    transitionEffect: typeof record.transitionEffect === "string" ? record.transitionEffect : undefined,
    transitionDirection: typeof record.transitionDirection === "string" ? record.transitionDirection : undefined,
    transitionDurationMs: typeof record.transitionDurationMs === "number" ? record.transitionDurationMs : undefined,
    transitionFallbackUsed: Boolean(record.transitionFallbackUsed),
    transitionCompleted: record.transitionCompleted === undefined ? undefined : record.transitionCompleted !== false,
  };
}

function normalizePlaybackEventType(value: unknown): PlaybackQaEventType {
  if (value === "slide-transition" || value === "exit") {
    return value;
  }
  return "scene-beat-click";
}

function normalizeNumberArray(value: unknown, fallback: number[]): number[] {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = source
    .map((item) => normalizeNonNegativeInteger(item, -1))
    .filter((item) => item > 0);
  return [...new Set(normalized)].sort((a, b) => a - b);
}

function normalizeString(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const entries = Object.entries(value)
    .map(([key, item]) => [key.trim(), typeof item === "string" ? item.trim() : ""] as const)
    .filter(([key, item]) => key.length > 0 && item.length > 0);
  return Object.fromEntries(entries);
}

function normalizeIsoLike(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : new Date().toISOString();
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
