import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function resolveFromProject(...segments: string[]): string {
  return path.resolve(projectRoot, ...segments);
}
