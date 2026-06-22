import fs from "node:fs/promises";
import path from "node:path";
import type { GenerationResult } from "./deckTypes.js";
import { resolveFromProject } from "./paths.js";

export const exportRootDir = "/Users/bruce/Desktop/PPT";
export const defaultProjectName = "测试-v1.6.11.1";
export const exportHistoryPath = resolveFromProject("outputs", "export-history.jsonl");

export interface ExportRequest {
  projectName?: unknown;
  folderName?: unknown;
}

export interface LockedExportResult {
  rootDir: string;
  exportDir: string;
  folderName: string;
  projectName: string;
  files: {
    powerpoint: string;
    compatible: string;
  };
}

export interface ExportHistoryEntry extends LockedExportResult {
  time: string;
}

export function sanitizeFileName(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const base = raw.length > 0 ? raw : fallback;
  const sanitized = base
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/\.\.+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.length > 0 ? sanitized : fallback;
}

export function dateStamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function defaultFolderName(projectName: string, date = new Date()): string {
  return `${projectName}-${dateStamp(date)}`;
}

export function pptxFileNames(projectName: string): { powerpoint: string; compatible: string } {
  return {
    powerpoint: `${projectName}-PowerPoint.pptx`,
    compatible: `${projectName}-兼容.pptx`,
  };
}

export async function createLockedExport(
  request: ExportRequest,
  generation: GenerationResult,
  date = new Date(),
): Promise<LockedExportResult> {
  const projectName = sanitizeFileName(request.projectName, defaultProjectName);
  const folderName = sanitizeFileName(request.folderName, defaultFolderName(projectName, date));
  const rootDir = path.resolve(exportRootDir);
  await fs.mkdir(rootDir, { recursive: true });

  const uniqueFolderName = await nextAvailableFolderName(rootDir, folderName);
  const exportDir = path.resolve(rootDir, uniqueFolderName);
  if (!isInsideRoot(rootDir, exportDir)) {
    throw new Error("Resolved export path escaped locked root directory");
  }
  await fs.mkdir(exportDir);

  const names = pptxFileNames(projectName);
  const powerpoint = path.join(exportDir, names.powerpoint);
  const compatible = path.join(exportDir, names.compatible);
  await fs.copyFile(generation.files.powerpointRich, powerpoint);
  await fs.copyFile(generation.files.wpsCompatible, compatible);

  const exported = {
    rootDir,
    exportDir,
    folderName: uniqueFolderName,
    projectName,
    files: {
      powerpoint,
      compatible,
    },
  };
  await appendExportHistory(exported);
  return exported;
}

export async function appendExportHistory(exported: LockedExportResult, date = new Date()): Promise<void> {
  const entry: ExportHistoryEntry = {
    time: date.toISOString(),
    ...exported,
  };
  await fs.mkdir(path.dirname(exportHistoryPath), { recursive: true });
  await fs.appendFile(exportHistoryPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readLastExportHistory(): Promise<ExportHistoryEntry | null> {
  try {
    const source = await fs.readFile(exportHistoryPath, "utf8");
    const lastLine = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);
    if (!lastLine) {
      return null;
    }
    const parsed = JSON.parse(lastLine) as Partial<ExportHistoryEntry>;
    if (!parsed.exportDir || !parsed.projectName || !parsed.folderName || !parsed.files) {
      return null;
    }
    return parsed as ExportHistoryEntry;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function nextAvailableFolderName(rootDir: string, folderName: string): Promise<string> {
  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? folderName : `${folderName}(${index})`;
    const candidatePath = path.resolve(rootDir, candidate);
    if (!isInsideRoot(rootDir, candidatePath)) {
      throw new Error("Candidate export folder escaped locked root directory");
    }
    try {
      await fs.access(candidatePath);
    } catch {
      return candidate;
    }
  }
  throw new Error(`Unable to allocate export folder for ${folderName}`);
}

function isInsideRoot(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
