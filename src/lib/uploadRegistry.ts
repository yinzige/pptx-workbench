import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { resolveFromProject } from "./paths.js";

export interface UploadedReference {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  status: "waiting-purpose";
  mode: "quick-audit" | "large-file-audit";
  prompt: string;
  relationshipPrompt?: string;
  audit?: LargeFileAuditSummary;
}

export interface LargeFileAuditSummary {
  slideCount: number;
  slideXmlCount: number;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  mediaTotalSize: number;
  transitionCount: number;
  hasAnimationXml: boolean;
  risks: string[];
  revisionPlanSuggestions: string[];
}

export interface UploadRegistrySummary {
  path: string;
  uploads: UploadedReference[];
  latestUpload: UploadedReference | null;
}

export const uploadRegistryPath = resolveFromProject("outputs", "upload-registry.jsonl");
const largeFileThreshold = 50 * 1024 * 1024;

export function uploadModeForSize(fileSize: number): "quick-audit" | "large-file-audit" {
  return fileSize > largeFileThreshold ? "large-file-audit" : "quick-audit";
}

export async function appendUploadReference(input: {
  fileName: string;
  fileSize: number;
  fileType: string;
  audit?: LargeFileAuditSummary;
}): Promise<UploadRegistrySummary> {
  await fs.mkdir(path.dirname(uploadRegistryPath), { recursive: true });
  const uploadedAt = new Date().toISOString();
  const upload: UploadedReference = {
    id: `upload-${uploadedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileType: input.fileType,
    uploadedAt,
    status: "waiting-purpose",
    mode: uploadModeForSize(input.fileSize),
    prompt: "你上传这个 PPT 主要想做什么？",
    relationshipPrompt: "如果一次上传多个 PPT：这些 PPT 之间是什么关系？",
    ...(input.audit ? { audit: input.audit } : {}),
  };
  await fs.appendFile(uploadRegistryPath, `${JSON.stringify(upload)}\n`, "utf8");
  return readUploadRegistry();
}

export async function readUploadRegistry(): Promise<UploadRegistrySummary> {
  await fs.mkdir(path.dirname(uploadRegistryPath), { recursive: true });
  await fs.appendFile(uploadRegistryPath, "", "utf8");
  const source = await fs.readFile(uploadRegistryPath, "utf8");
  const uploads = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as UploadedReference);
  return {
    path: uploadRegistryPath,
    uploads,
    latestUpload: uploads.at(-1) ?? null,
  };
}

export async function auditLargePptxBuffer(fileName: string, buffer: Buffer): Promise<LargeFileAuditSummary> {
  const zip = await JSZip.loadAsync(buffer);
  let transitionCount = 0;
  let hasAnimationXml = false;
  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;
  let mediaTotalSize = 0;
  const slideEntries = Object.keys(zip.files).filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry));

  for (const [entry, file] of Object.entries(zip.files)) {
    if (file.dir) {
      continue;
    }
    if (entry.startsWith("ppt/media/")) {
      const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
      mediaTotalSize += size;
      if (/\.(png|jpe?g|gif|svg|webp|emf)$/i.test(entry)) imageCount += 1;
      if (/\.(mp4|mov|avi|wmv|m4v)$/i.test(entry)) videoCount += 1;
      if (/\.(mp3|wav|m4a|aac|wma)$/i.test(entry)) audioCount += 1;
      continue;
    }
    if (!shouldReadLargeAuditEntry(entry)) {
      continue;
    }
    const xml = await file.async("string");
    transitionCount += count(xml, /<p:transition\b/g);
    hasAnimationXml ||= /<p:timing\b|<p:animEffect\b|nodeType="clickEffect"/.test(xml);
  }

  const risks = [
    ...(buffer.byteLength > largeFileThreshold ? ["文件超过 50MB，跳过媒体内容，仅审计关键 XML。"] : []),
    ...(mediaTotalSize > 100 * 1024 * 1024 ? ["媒体资源体积较大，可能导致 PowerPoint / WPS 打开或播放卡顿。"] : []),
    ...(videoCount > 0 || audioCount > 0 ? ["包含音视频资源，WPS/Keynote 兼容性和导出体积需单独验收。"] : []),
  ];
  return {
    slideCount: slideEntries.length,
    slideXmlCount: slideEntries.length,
    imageCount,
    videoCount,
    audioCount,
    mediaTotalSize,
    transitionCount,
    hasAnimationXml,
    risks,
    revisionPlanSuggestions: risks.length > 0
      ? risks.map((risk) => `检查上传文件 ${fileName}：${risk}`)
      : [`上传文件 ${fileName} 结构可读，可作为参考或兼容性检查输入。`],
  };
}

function shouldReadLargeAuditEntry(entry: string): boolean {
  return entry === "[Content_Types].xml"
    || entry === "ppt/presentation.xml"
    || /^ppt\/slides\/slide\d+\.xml$/.test(entry)
    || /^ppt\/slides\/_rels\/.+\.rels$/.test(entry)
    || entry.startsWith("ppt/slideMasters/")
    || entry.startsWith("ppt/theme/")
    || entry.startsWith("ppt/_rels/")
    || entry.startsWith("docProps/");
}

function count(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}
