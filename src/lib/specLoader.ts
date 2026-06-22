import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { DeckSpec } from "./deckTypes.js";
import { resolveFromProject } from "./paths.js";

export const defaultSpecPath = resolveFromProject("specs", "example.deck-spec.yaml");

export async function loadDeckSpec(specPath = defaultSpecPath): Promise<DeckSpec> {
  const absolutePath = path.resolve(specPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const ext = path.extname(absolutePath).toLowerCase();
  const parsed: unknown = ext === ".json" ? JSON.parse(raw) : YAML.parse(raw);
  return assertDeckSpec(parsed, absolutePath);
}

function assertDeckSpec(value: unknown, source: string): DeckSpec {
  if (!isRecord(value)) {
    throw new Error(`Deck spec must be an object: ${source}`);
  }
  if (typeof value.version !== "string") {
    throw new Error("Deck spec missing string field: version");
  }
  if (typeof value.title !== "string") {
    throw new Error("Deck spec missing string field: title");
  }
  if (!isRecord(value.theme)) {
    throw new Error("Deck spec missing object field: theme");
  }
  if (!Array.isArray(value.slides) || value.slides.length === 0) {
    throw new Error("Deck spec must include at least one slide");
  }
  return value as unknown as DeckSpec;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
