import { z } from "zod";

import { gqlError } from "@/server/graphql/errors";
import { storage } from "@/server/storage";

export const SCENE_SOURCE = "excalidraw-studio";
export const SCENE_VERSION = 2;

/** Hard cap on serialized scene size (10 MB) — protects storage + parser. */
const MAX_SCENE_BYTES = 10 * 1024 * 1024;

export interface ScenePayload {
  type: "excalidraw";
  version: number;
  source: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/** Client-supplied scene input (before validation). */
export interface SceneDataInput {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

const sceneSchema = z.object({
  elements: z.array(z.unknown()).max(50_000),
  appState: z.record(z.string(), z.unknown()).default({}),
  files: z.record(z.string(), z.unknown()).default({}),
});

/** Validates an untrusted scene payload coming from a client. */
export function validateSceneData(
  data: unknown,
): { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> } {
  const parsed = sceneSchema.safeParse(data);
  if (!parsed.success) {
    throw gqlError(
      "BAD_USER_INPUT",
      `Invalid scene data: ${parsed.error.issues[0]?.message ?? "unexpected shape"}`,
    );
  }
  return parsed.data;
}

export function emptyScene(): ScenePayload {
  return {
    type: "excalidraw",
    version: SCENE_VERSION,
    source: SCENE_SOURCE,
    elements: [],
    appState: {},
    files: {},
  };
}

export function sceneStorageKey(userId: string, fileId: string): string {
  return `scenes/${userId}/${fileId}.excalidraw`;
}

export async function writeScene(
  storageKey: string,
  data: { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> },
): Promise<void> {
  const payload: ScenePayload = {
    type: "excalidraw",
    version: SCENE_VERSION,
    source: SCENE_SOURCE,
    elements: data.elements,
    appState: data.appState,
    files: data.files,
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_SCENE_BYTES) {
    throw gqlError(
      "BAD_USER_INPUT",
      "Scene is too large to save (10 MB limit).",
    );
  }
  await storage.put(storageKey, serialized);
}

export async function readScene(
  storageKey: string,
): Promise<ScenePayload | null> {
  const raw = await storage.get(storageKey);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as ScenePayload;
  } catch {
    return null;
  }
}

export async function copyScene(
  fromKey: string,
  toKey: string,
): Promise<boolean> {
  const raw = await storage.get(fromKey);
  if (!raw) {
    return false;
  }
  await storage.put(toKey, raw);
  return true;
}
