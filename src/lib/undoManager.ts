import fs from "node:fs/promises";
import path from "node:path";
import { codexInboxPath } from "./codexInbox.js";
import { resolveFromProject } from "./paths.js";
import { revisionPlanPath } from "./revisionPlan.js";
import { defaultSpecPath } from "./specLoader.js";

export interface UndoSnapshotMeta {
  id: string;
  createdAt: string;
  summary: string;
  affectedSlides: string[];
  affectedObjects: string[];
  source: "codex-queue" | "user-action" | "undo" | "redo";
  files: string[];
}

export interface UndoStateSummary {
  undoCount: number;
  redoCount: number;
  maxUndo: number;
  undoDir: string;
  redoDir: string;
  latestUndo: UndoSnapshotMeta | null;
}

const maxUndo = 100;
export const undoStackDir = resolveFromProject("outputs", "undo-stack");
export const redoStackDir = resolveFromProject("outputs", "redo-stack");

const trackedFiles = [
  defaultSpecPath,
  revisionPlanPath,
  codexInboxPath,
];

export async function createUndoSnapshot(input: {
  summary: string;
  affectedSlides?: string[];
  affectedObjects?: string[];
  source?: UndoSnapshotMeta["source"];
}): Promise<UndoSnapshotMeta> {
  const meta = await createUndoSnapshotInternal(input);
  await clearRedoStack();
  await trimUndoStack();
  return meta;
}

async function createUndoSnapshotInternal(input: {
  summary: string;
  affectedSlides?: string[];
  affectedObjects?: string[];
  source?: UndoSnapshotMeta["source"];
}): Promise<UndoSnapshotMeta> {
  await ensureStackDirs();
  const createdAt = new Date().toISOString();
  const id = `undo-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
  const snapshotDir = path.join(undoStackDir, id);
  await fs.mkdir(path.join(snapshotDir, "before"), { recursive: true });
  const copied: string[] = [];
  for (const file of trackedFiles) {
    try {
      const target = snapshotFilePath(snapshotDir, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(file, target);
      copied.push(file);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
  if (!copied.includes(defaultSpecPath)) {
    throw new Error("Cannot create undo snapshot: deck-spec copy failed");
  }
  const meta: UndoSnapshotMeta = {
    id,
    createdAt,
    summary: input.summary,
    affectedSlides: input.affectedSlides ?? [],
    affectedObjects: input.affectedObjects ?? [],
    source: input.source ?? "user-action",
    files: copied,
  };
  await fs.writeFile(path.join(snapshotDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return meta;
}

export async function undoLastChange(): Promise<UndoStateSummary> {
  await ensureStackDirs();
  const latest = await latestSnapshot(undoStackDir);
  if (!latest) {
    throw new Error("没有可撤销步骤");
  }
  const redoSnapshot = await createRedoSnapshot(`返回点：${latest.meta.summary}`);
  await restoreSnapshot(latest.dir);
  await fs.rm(latest.dir, { recursive: true, force: true });
  await fs.writeFile(path.join(redoSnapshot.dir, "meta.json"), `${JSON.stringify({
    ...redoSnapshot.meta,
    summary: `撤销后可返回：${latest.meta.summary}`,
    affectedSlides: latest.meta.affectedSlides,
    affectedObjects: latest.meta.affectedObjects,
  }, null, 2)}\n`, "utf8");
  return readUndoState();
}

export async function redoLastChange(): Promise<UndoStateSummary> {
  await ensureStackDirs();
  const latest = await latestSnapshot(redoStackDir);
  if (!latest) {
    throw new Error("没有可返回步骤");
  }
  await createUndoSnapshotInternal({
    summary: `返回前快照：${latest.meta.summary}`,
    affectedSlides: latest.meta.affectedSlides,
    affectedObjects: latest.meta.affectedObjects,
    source: "redo",
  });
  await restoreSnapshot(latest.dir);
  await fs.rm(latest.dir, { recursive: true, force: true });
  await trimUndoStack();
  return readUndoState();
}

export async function readUndoState(): Promise<UndoStateSummary> {
  await ensureStackDirs();
  const undo = await listSnapshots(undoStackDir);
  const redo = await listSnapshots(redoStackDir);
  return {
    undoCount: undo.length,
    redoCount: redo.length,
    maxUndo,
    undoDir: undoStackDir,
    redoDir: redoStackDir,
    latestUndo: undo.at(-1)?.meta ?? null,
  };
}

async function createRedoSnapshot(summary: string): Promise<{ dir: string; meta: UndoSnapshotMeta }> {
  await ensureStackDirs();
  const createdAt = new Date().toISOString();
  const id = `redo-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(redoStackDir, id);
  await fs.mkdir(path.join(dir, "before"), { recursive: true });
  const copied: string[] = [];
  for (const file of trackedFiles) {
    try {
      const target = snapshotFilePath(dir, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(file, target);
      copied.push(file);
    } catch {
      // Missing optional workflow files are ignored; deck-spec is enforced below.
    }
  }
  if (!copied.includes(defaultSpecPath)) {
    throw new Error("Cannot create redo snapshot: deck-spec copy failed");
  }
  const meta: UndoSnapshotMeta = {
    id,
    createdAt,
    summary,
    affectedSlides: [],
    affectedObjects: [],
    source: "undo",
    files: copied,
  };
  await fs.writeFile(path.join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return { dir, meta };
}

async function restoreSnapshot(snapshotDir: string): Promise<void> {
  const meta = await readSnapshotMeta(snapshotDir);
  for (const file of meta.files) {
    const source = snapshotFilePath(snapshotDir, file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.copyFile(source, file);
  }
}

async function trimUndoStack(): Promise<void> {
  const snapshots = await listSnapshots(undoStackDir);
  const overflow = snapshots.length - maxUndo;
  if (overflow <= 0) {
    return;
  }
  for (const snapshot of snapshots.slice(0, overflow)) {
    await fs.rm(snapshot.dir, { recursive: true, force: true });
  }
}

async function clearRedoStack(): Promise<void> {
  await fs.rm(redoStackDir, { recursive: true, force: true });
  await fs.mkdir(redoStackDir, { recursive: true });
}

async function latestSnapshot(baseDir: string): Promise<{ dir: string; meta: UndoSnapshotMeta } | null> {
  return (await listSnapshots(baseDir)).at(-1) ?? null;
}

async function listSnapshots(baseDir: string): Promise<Array<{ dir: string; meta: UndoSnapshotMeta }>> {
  await fs.mkdir(baseDir, { recursive: true });
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const snapshots: Array<{ dir: string; meta: UndoSnapshotMeta }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = path.join(baseDir, entry.name);
    try {
      snapshots.push({ dir, meta: await readSnapshotMeta(dir) });
    } catch {
      // Ignore incomplete snapshots instead of breaking the whole stack.
    }
  }
  return snapshots.sort((a, b) => a.meta.createdAt.localeCompare(b.meta.createdAt));
}

async function readSnapshotMeta(snapshotDir: string): Promise<UndoSnapshotMeta> {
  return JSON.parse(await fs.readFile(path.join(snapshotDir, "meta.json"), "utf8")) as UndoSnapshotMeta;
}

function snapshotFilePath(snapshotDir: string, absoluteFile: string): string {
  const relative = path.relative(resolveFromProject(), absoluteFile);
  return path.join(snapshotDir, "before", relative);
}

async function ensureStackDirs(): Promise<void> {
  await fs.mkdir(undoStackDir, { recursive: true });
  await fs.mkdir(redoStackDir, { recursive: true });
}
