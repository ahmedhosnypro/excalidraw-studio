"use client";

import { serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { SceneDataInput } from "@/lib/graphql/operations";

const GUEST_SCENE_KEY = "studio:guest-scene";

export interface GuestScene {
  name: string;
  data: SceneDataInput;
  savedAt: number;
}

/**
 * Serializes the current scene the same way `.excalidraw` files are written,
 * guaranteeing consistent (filtered) appState between saves and exports.
 */
export function buildSceneInput(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): SceneDataInput {
  const json = serializeAsJSON(elements, appState, files, "database");
  const parsed = JSON.parse(json) as {
    elements: unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
  };
  return { elements: parsed.elements, appState: parsed.appState, files: parsed.files };
}

export function saveGuestScene(input: SceneDataInput): void {
  try {
    const payload: GuestScene = {
      name: "My drawing",
      data: input,
      savedAt: Date.now(),
    };
    localStorage.setItem(GUEST_SCENE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full/unavailable — guests lose autosave but keep editing.
  }
}

export function loadGuestScene(): GuestScene | null {
  try {
    const raw = localStorage.getItem(GUEST_SCENE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as GuestScene;
  } catch {
    return null;
  }
}

export function clearGuestScene(): void {
  try {
    localStorage.removeItem(GUEST_SCENE_KEY);
  } catch {
    // ignore
  }
}

/** Converts a scene `files` map into the array shape `initialData.files` wants. */
export function sceneFilesToArray(files: Record<string, unknown> | undefined): BinaryFileData[] {
  if (!files) {
    return [];
  }
  return Object.values(files).filter(
    (entry): entry is BinaryFileData =>
      typeof entry === "object" && entry !== null && "id" in entry,
  );
}
