import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { DeckSpec } from "./deckTypes.js";
import type {
  PptxAuditRecommendations,
  RevisionActionType,
  RevisionPriority,
} from "./pptxAudit.js";
import { defaultProjectName } from "./exportManager.js";
import { resolveFromProject } from "./paths.js";
import { defaultSpecPath } from "./specLoader.js";

export type RevisionActionSource = "user-comment" | "audit-recommendation" | "manual";
export type RevisionActionStatus = "todo" | "applied" | "skipped" | "needs-design" | "needs-codex" | "failed";

export interface RevisionPlan {
  schema: "pptx-workbench.revision-plan.v1";
  projectName: string;
  source: {
    specPath: string;
    auditFile: string | null;
    generatedAt: string;
  };
  status: "draft";
  goals: string[];
  actions: RevisionPlanAction[];
}

export interface RevisionPlanAction {
  id: string;
  slideId: string;
  slideNumber: number;
  objectId?: string;
  objectRole?: string;
  type: RevisionActionType;
  priority: RevisionPriority;
  source: RevisionActionSource;
  instruction: string;
  status: RevisionActionStatus;
  createdAt: string;
}

export interface RevisionPlanSummary {
  path: string;
  exists: boolean;
  plan: RevisionPlan;
  actionCount: number;
  highPriorityCount: number;
  latestAction: RevisionPlanAction | null;
}

export interface ManualRevisionActionInput {
  slideId?: unknown;
  slideNumber?: unknown;
  objectId?: unknown;
  objectRole?: unknown;
  type?: unknown;
  priority?: unknown;
  instruction?: unknown;
}

export const revisionPlanPath = resolveFromProject("outputs", "revision-plan.yaml");

export async function readRevisionPlan(): Promise<RevisionPlanSummary> {
  try {
    const source = await fs.readFile(revisionPlanPath, "utf8");
    const parsed = YAML.parse(source) as unknown;
    const plan = normalizeRevisionPlan(parsed);
    return summarizeRevisionPlan(plan, true);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") {
      throw error;
    }
    return summarizeRevisionPlan(emptyRevisionPlan(), false);
  }
}

export async function syncRevisionPlanProject(projectName = defaultProjectName): Promise<RevisionPlanSummary> {
  const current = await readRevisionPlan();
  if (!current.exists) {
    return ensureRevisionPlanFile(projectName);
  }
  const plan = current.plan;
  const changed = plan.projectName !== projectName || plan.source.specPath !== defaultSpecPath;
  if (changed) {
    plan.projectName = projectName;
    plan.source.specPath = defaultSpecPath;
    await writeRevisionPlan(plan);
  }
  return summarizeRevisionPlan(plan, true);
}

export async function ensureRevisionPlanFile(projectName = defaultProjectName): Promise<RevisionPlanSummary> {
  const current = await readRevisionPlan();
  if (current.exists) {
    return syncRevisionPlanProject(projectName);
  }
  const plan = emptyRevisionPlan();
  plan.projectName = projectName;
  await writeRevisionPlan(plan);
  return summarizeRevisionPlan(plan, true);
}

export async function createRevisionPlanFromAudit(
  spec: DeckSpec,
  recommendations: PptxAuditRecommendations,
  auditFile: string,
  projectName = defaultProjectName,
): Promise<RevisionPlanSummary> {
  const now = new Date().toISOString();
  const actions = recommendations.revisionPlanDraft.actions.map((action, index) => {
    const slideNumber = normalizeSlideNumber(action.slideNumber);
    return {
      id: createActionId("audit", index + 1, now),
      slideId: slideIdForNumber(spec, slideNumber),
      slideNumber,
      type: action.type,
      priority: action.priority,
      source: "audit-recommendation" as const,
      instruction: action.instruction,
      status: "todo" as const,
      createdAt: now,
    };
  });
  const plan: RevisionPlan = {
    schema: "pptx-workbench.revision-plan.v1",
    projectName,
    source: {
      specPath: defaultSpecPath,
      auditFile,
      generatedAt: now,
    },
    status: "draft",
    goals: recommendations.revisionPlanDraft.goals,
    actions,
  };
  await writeRevisionPlan(plan);
  return summarizeRevisionPlan(plan, true);
}

export async function appendUserRevisionAction(
  input: ManualRevisionActionInput,
  spec: DeckSpec,
  projectName = defaultProjectName,
): Promise<RevisionPlanSummary> {
  const current = await readRevisionPlan();
  const plan = current.plan;
  if (!current.exists) {
    plan.projectName = projectName;
    plan.source.specPath = defaultSpecPath;
    plan.source.generatedAt = new Date().toISOString();
    plan.goals = defaultGoals();
  }

  const now = new Date().toISOString();
  const slideNumber = normalizeSlideNumber(input.slideNumber);
  const action: RevisionPlanAction = {
    id: createActionId("comment", plan.actions.length + 1, now),
    slideId: normalizeSlideId(input.slideId, spec, slideNumber),
    slideNumber,
    ...normalizeObjectTarget(input.objectId, input.objectRole),
    type: normalizeActionType(input.type),
    priority: normalizePriority(input.priority),
    source: "user-comment",
    instruction: normalizeInstruction(input.instruction),
    status: "todo",
    createdAt: now,
  };
  plan.actions.push(action);
  await writeRevisionPlan(plan);
  return summarizeRevisionPlan(plan, true);
}

export async function deletePendingUserRevisionAction(input: {
  slideId: string;
  objectId?: string | null;
  instruction: string;
}): Promise<RevisionPlanSummary> {
  const current = await readRevisionPlan();
  const plan = current.plan;
  let index = -1;
  for (let actionIndex = plan.actions.length - 1; actionIndex >= 0; actionIndex -= 1) {
    const action = plan.actions[actionIndex];
    const actionObjectId = action.objectId ?? null;
    const matches = action.source === "user-comment"
      && action.status === "todo"
      && action.slideId === input.slideId
      && actionObjectId === (input.objectId ?? null)
      && action.instruction === input.instruction;
    if (matches) {
      index = actionIndex;
      break;
    }
  }
  if (index >= 0) {
    plan.actions.splice(index, 1);
    await writeRevisionPlan(plan);
  }
  return summarizeRevisionPlan(plan, current.exists);
}

export async function markMatchingRevisionActionApplied(input: {
  slideId: string;
  objectId?: string | null;
  instruction: string;
}): Promise<RevisionPlanSummary> {
  return markMatchingRevisionActionStatus({ ...input, status: "applied" });
}

export async function markMatchingRevisionActionStatus(input: {
  slideId: string;
  objectId?: string | null;
  instruction: string;
  status: RevisionActionStatus;
}): Promise<RevisionPlanSummary> {
  const current = await readRevisionPlan();
  const plan = current.plan;
  for (let actionIndex = plan.actions.length - 1; actionIndex >= 0; actionIndex -= 1) {
    const action = plan.actions[actionIndex];
    const actionObjectId = action.objectId ?? null;
    const matches = action.source === "user-comment"
      && action.status === "todo"
      && action.slideId === input.slideId
      && actionObjectId === (input.objectId ?? null)
      && action.instruction === input.instruction;
    if (matches) {
      action.status = input.status;
      await writeRevisionPlan(plan);
      break;
    }
  }
  return summarizeRevisionPlan(plan, current.exists);
}

async function writeRevisionPlan(plan: RevisionPlan): Promise<void> {
  await fs.mkdir(path.dirname(revisionPlanPath), { recursive: true });
  await fs.writeFile(revisionPlanPath, YAML.stringify(plan), "utf8");
}

function summarizeRevisionPlan(plan: RevisionPlan, exists: boolean): RevisionPlanSummary {
  return {
    path: revisionPlanPath,
    exists,
    plan,
    actionCount: plan.actions.length,
    highPriorityCount: plan.actions.filter((action) => action.priority === "high").length,
    latestAction: plan.actions.at(-1) ?? null,
  };
}

function emptyRevisionPlan(): RevisionPlan {
  return {
    schema: "pptx-workbench.revision-plan.v1",
    projectName: defaultProjectName,
    source: {
      specPath: defaultSpecPath,
      auditFile: null,
      generatedAt: new Date().toISOString(),
    },
    status: "draft",
    goals: defaultGoals(),
    actions: [],
  };
}

function defaultGoals(): string[] {
  return [
    "把用户批注和审计建议整理成 Codex 可执行的 deck-spec 改稿清单。",
    "保持双文件策略：PowerPoint-rich 面向 PowerPoint/Keynote，WPS-compatible 面向 WPS/不确定环境。",
  ];
}

function normalizeRevisionPlan(value: unknown): RevisionPlan {
  if (!isRecord(value) || value.schema !== "pptx-workbench.revision-plan.v1") {
    return emptyRevisionPlan();
  }
  const fallback = emptyRevisionPlan();
  const source = isRecord(value.source) ? value.source : {};
  const actions = Array.isArray(value.actions)
    ? value.actions.filter(isRecord).map((action, index) => ({
        id: typeof action.id === "string" ? action.id : `action-${index + 1}`,
        slideId: typeof action.slideId === "string" ? action.slideId : "unknown",
        slideNumber: normalizeSlideNumber(action.slideNumber),
        ...normalizeObjectTarget(action.objectId, action.objectRole),
        type: normalizeActionType(action.type),
        priority: normalizePriority(action.priority),
        source: normalizeActionSource(action.source),
        instruction: normalizeInstruction(action.instruction),
        status: normalizeActionStatus(action.status),
        createdAt: typeof action.createdAt === "string" ? action.createdAt : fallback.source.generatedAt,
      }))
    : [];
  return {
    schema: "pptx-workbench.revision-plan.v1",
    projectName: typeof value.projectName === "string" ? value.projectName : fallback.projectName,
    source: {
      specPath: typeof source.specPath === "string" ? source.specPath : fallback.source.specPath,
      auditFile: typeof source.auditFile === "string" ? source.auditFile : null,
      generatedAt: typeof source.generatedAt === "string" ? source.generatedAt : fallback.source.generatedAt,
    },
    status: "draft",
    goals: Array.isArray(value.goals) ? value.goals.filter((goal): goal is string => typeof goal === "string") : fallback.goals,
    actions,
  };
}

function normalizeSlideNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1;
}

function normalizeSlideId(value: unknown, spec: DeckSpec, slideNumber: number): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return slideIdForNumber(spec, slideNumber);
}

function normalizeObjectTarget(objectId: unknown, objectRole: unknown): Pick<RevisionPlanAction, "objectId" | "objectRole"> {
  const normalizedObjectId = typeof objectId === "string" ? objectId.trim() : "";
  const normalizedObjectRole = typeof objectRole === "string" ? objectRole.trim() : "";
  return {
    ...(normalizedObjectId.length > 0 ? { objectId: normalizedObjectId } : {}),
    ...(normalizedObjectRole.length > 0 ? { objectRole: normalizedObjectRole } : {}),
  };
}

function slideIdForNumber(spec: DeckSpec, slideNumber: number): string {
  return spec.slides[slideNumber - 1]?.id ?? spec.slides[0]?.id ?? "unknown";
}

function normalizeActionType(value: unknown): RevisionActionType {
  return isRevisionActionType(value) ? value : "content";
}

function normalizePriority(value: unknown): RevisionPriority {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function normalizeInstruction(value: unknown): string {
  const instruction = typeof value === "string" ? value.trim() : "";
  if (instruction.length === 0) {
    throw new Error("revision action instruction is required");
  }
  return instruction;
}

function normalizeActionSource(value: unknown): RevisionActionSource {
  if (value === "user-comment" || value === "audit-recommendation" || value === "manual") {
    return value;
  }
  return "manual";
}

function normalizeActionStatus(value: unknown): RevisionActionStatus {
  if (value === "todo" || value === "applied" || value === "skipped" || value === "needs-design" || value === "needs-codex" || value === "failed") {
    return value;
  }
  return "todo";
}

function createActionId(prefix: string, index: number, createdAt: string): string {
  return `${prefix}-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${String(index).padStart(3, "0")}`;
}

function isRevisionActionType(value: unknown): value is RevisionActionType {
  return value === "content" || value === "visual" || value === "structure" || value === "motion" || value === "compatibility" || value === "asset";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
