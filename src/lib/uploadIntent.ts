import fs from "node:fs/promises";
import path from "node:path";
import { resolveFromProject } from "./paths.js";

export const uploadIntentPath = resolveFromProject("events", "upload-intent.jsonl");

export interface UploadIntentRecord {
  id: string;
  uploadId?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
  status: "waiting-purpose";
  suggestedQuestion: string;
  question: string;
  options: string[];
  note: string;
}

export async function appendUploadIntent(input: {
  uploadId?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  note: string;
}): Promise<UploadIntentRecord> {
  await fs.mkdir(path.dirname(uploadIntentPath), { recursive: true });
  const createdAt = new Date().toISOString();
  const record: UploadIntentRecord = {
    id: `upload-intent-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    ...(input.uploadId ? { uploadId: input.uploadId } : {}),
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileType: input.fileType,
    createdAt,
    status: "waiting-purpose",
    suggestedQuestion: "你上传这个 PPT 主要想做什么？",
    question: "你上传这个 PPT 主要想做什么？",
    options: [
      "修改这个 PPT",
      "整合进当前作品",
      "作为视觉 / 版式参考",
      "蒸馏成可复用方法",
      "提取内容重新生成",
      "检查兼容性 / 动画 / 结构问题",
    ],
    note: input.note,
  };
  await fs.appendFile(uploadIntentPath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}
