"use client";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { sceneFilesToArray } from "@/lib/scene-persistence";
import { useEditorStore } from "@/store/editor-store";

/**
 * Applies the viewport semantics shared by openFile and version-restore:
 * restore the saved viewport exactly (clamped), else fit the drawing into
 * the view, else reset to the default view (empty scenes must never "fit" —
 * fitToViewport on empty content zooms to the maximum).
 *
 * Legacy scenes written while the empty-scene fit bug was live can carry max
 * zoom (30) — clamping keeps restores within a sane drawing range.
 */
export function applySavedViewport(
  api: ExcalidrawImperativeAPI,
  elementsCount: number,
  appState: Record<string, unknown> | undefined,
): void {
  const saved = (appState ?? {}) as Record<string, unknown>;
  const zoomValue = (saved.zoom as { value?: number } | undefined)?.value;
  if (elementsCount === 0) {
    api.updateScene({
      appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 as AppState["zoom"]["value"] } },
    });
    return;
  }
  if (
    typeof saved.scrollX === "number" &&
    typeof saved.scrollY === "number" &&
    typeof zoomValue === "number"
  ) {
    const clamped = Math.min(5, Math.max(0.1, zoomValue));
    api.updateScene({
      appState: {
        scrollX: saved.scrollX,
        scrollY: saved.scrollY,
        zoom: { value: clamped } as AppState["zoom"],
      },
    });
    return;
  }
  api.scrollToContent(undefined, { fitToViewport: true });
}

/**
 * Applies a loaded scene's contents to the live canvas (shared by openFile
 * and version-restore). GraphQL results arrive deep-frozen (Apollo dev
 * cache) while Excalidraw may mutate elements (e.g. syncInvalidIndices
 * back-fills a missing `index`) — cloning up-front avoids "object is not
 * extensible" crashes.
 */
export async function applySceneToCanvas(
  elements: unknown[],
  appState: Record<string, unknown> | undefined,
  files: Record<string, unknown> | undefined,
): Promise<void> {
  const api = useEditorStore.getState().excalidrawApi;
  if (!api) {
    return;
  }
  const thawed = JSON.parse(JSON.stringify(elements)) as ExcalidrawElement[];
  api.updateScene({
    elements: thawed,
    appState: JSON.parse(JSON.stringify(appState ?? {})) as Pick<AppState, keyof AppState>,
  });
  const filesList = sceneFilesToArray(files);
  if (filesList.length > 0) {
    await api.addFiles(filesList);
  }
}
