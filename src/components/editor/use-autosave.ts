"use client";

import { useApolloClient } from "@apollo/client/react";
import { serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef } from "react";
import type { FileGql, SceneDataInput } from "@/lib/graphql/operations";
import { SAVE_SCENE_MUTATION } from "@/lib/graphql/operations";
import { saveGuestScene } from "@/lib/scene-persistence";
import { useEditorStore } from "@/store/editor-store";

const SAVE_DEBOUNCE_MS = 1000;

/** How recently a real pointer/keyboard interaction must have occurred for an
 * empty-scene overwrite of stored content to count as a user edit (delete-all)
 * rather than a system race (HMR crash / remount glitch). */
const INTERACTION_GRACE_MS = 30_000;

interface PendingSnapshot {
  json: string;
  data: SceneDataInput;
}

/** Whether the serialized baseline scene (the loaded file) has elements. */
function baselineHasElements(baselineJson: string | null): boolean {
  if (!baselineJson) {
    return false;
  }
  try {
    const parsed = JSON.parse(baselineJson) as { elements?: unknown[] };
    return (parsed.elements?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Debounced autosave. Persists to the server (`saveScene` mutation) when a
 * cloud file is open and the user is signed in; otherwise falls back to
 * localStorage for guests.
 *
 * Excalidraw fires `onChange` from `App.componentDidUpdate` — i.e. on every
 * React re-render, not only on real edits — which previously caused a
 * dirty → save → re-render → onChange feedback loop. We therefore dedupe:
 * events whose serialized scene matches the last captured snapshot are
 * ignored (this also skips selection-only changes, which are not serialized).
 */
export function useAutosave(isAuthenticated: boolean): {
  onSceneChange: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void;
} {
  const client = useApolloClient();
  const pendingRef = useRef<PendingSnapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  /** Serialized scene of the last captured (or loaded) snapshot. */
  const baselineJsonRef = useRef<string | null>(null);
  /** The file the current baseline belongs to (null = guest). */
  const baselineFileIdRef = useRef<string | null>(null);

  const store = useEditorStore;
  const getActiveFileId = useCallback(() => store.getState().activeFileId, []);
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  /** Last real user interaction (pointerdown / keydown) seen on the page. */
  const lastInteractionRef = useRef<number>(0);
  useEffect(() => {
    const note = (): void => {
      lastInteractionRef.current = Date.now();
    };
    window.addEventListener("pointerdown", note, true);
    window.addEventListener("keydown", note, true);
    return () => {
      window.removeEventListener("pointerdown", note, true);
      window.removeEventListener("keydown", note, true);
    };
  }, []);

  /**
   * Discards any pending (debounced) snapshot — e.g. the mount-time empty
   * scene captured before a file opens. Called right after `flushSave` when
   * switching files so a stale snapshot can never overwrite the freshly
   * opened file's stored scene (data-loss guard).
   */
  const cancelPending = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    useEditorStore.getState().setSaveStatus("idle");
  }, []);

  /** Clears the change-detection baseline (used when the canvas remounts). */
  const resetBaseline = useCallback((): void => {
    baselineFileIdRef.current = null;
    baselineJsonRef.current = null;
  }, []);

  const performSave = useCallback(async (): Promise<void> => {
    const snapshot = pendingRef.current;
    const fileId = getActiveFileId();
    if (!snapshot) {
      return;
    }
    // A scene is being loaded — any pending snapshot predates it and must
    // not be written over the file we are about to open into.
    if (store.getState().loadingScene) {
      setTimeout(() => {
        void performSave();
      }, 400);
      return;
    }
    // Empty-over-content guard: an empty snapshot without a recent user
    // interaction is a system race (HMR crash mid-reload, remount glitch),
    // never a deliberate delete-all — drop it and keep the stored scene.
    if (
      snapshot.data.elements.length === 0 &&
      baselineHasElements(baselineJsonRef.current) &&
      Date.now() - lastInteractionRef.current > INTERACTION_GRACE_MS
    ) {
      pendingRef.current = null;
      store.getState().setSaveStatus("idle");
      return;
    }
    // Unsynced-canvas guard: the open file's stored scene was never loaded
    // (failed or raced loadScene) — writing now would replace stored content
    // with whatever the unsynced canvas holds. Surface the failure instead.
    if (fileId && !store.getState().sceneLoaded) {
      store.getState().setSaveStatus("error");
      return;
    }
    if (fileId && isAuthenticatedRef.current) {
      if (inFlightRef.current) {
        // A save is in flight; retry shortly so the latest edits land.
        setTimeout(() => {
          void performSave();
        }, 400);
        return;
      }
      inFlightRef.current = true;
      store.getState().setSaveStatus("saving");
      try {
        await client.mutate<{ saveScene?: FileGql }, { fileId: string; data: SceneDataInput }>({
          mutation: SAVE_SCENE_MUTATION,
          variables: { fileId, data: snapshot.data },
        });
        // Only mark saved if no newer edits arrived meanwhile.
        if (pendingRef.current === snapshot) {
          pendingRef.current = null;
          store.getState().setSaveStatus("saved");
        }
      } catch {
        store.getState().setSaveStatus("error");
      } finally {
        inFlightRef.current = false;
      }
      return;
    }
    // Guest mode — persist locally.
    saveGuestScene(snapshot.data);
    if (pendingRef.current === snapshot) {
      pendingRef.current = null;
      useEditorStore.getState().setSaveStatus("saved");
    }
  }, [client, getActiveFileId]);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await performSave();
  }, [performSave]);

  useEffect(() => {
    store.getState().registerFlushSave(flush);
    store.getState().registerCancelSave(cancelPending);
    store.getState().registerResetSaveBaseline(resetBaseline);
    return () => {
      store.getState().registerFlushSave(null);
      store.getState().registerCancelSave(null);
      store.getState().registerResetSaveBaseline(null);
    };
  }, [flush, cancelPending, resetBaseline]);

  const onSceneChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles): void => {
      if (useEditorStore.getState().loadingScene) {
        return;
      }
      const fileId = useEditorStore.getState().activeFileId;
      const json = serializeAsJSON(elements, appState, files, "database");

      // First event after switching files (or entering guest mode): the load
      // commit itself. Treat it as the baseline instead of an edit.
      if (fileId !== baselineFileIdRef.current) {
        baselineFileIdRef.current = fileId;
        baselineJsonRef.current = json;
        return;
      }

      // Re-render noise / selection-only change — identical serialized scene.
      if (json === baselineJsonRef.current) {
        return;
      }

      baselineJsonRef.current = json;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // serializeAsJSON returns the .excalidraw envelope; the mutation wants
      // the inner {elements, appState, files} payload. The live viewport
      // (scroll/zoom) is injected explicitly — Excalidraw's storage config
      // does not guarantee those keys survive serialization, but we restore
      // the exact view on open, so they must ride along.
      const parsed = JSON.parse(json) as {
        elements: unknown[];
        appState: Record<string, unknown>;
        files: Record<string, unknown>;
      };
      pendingRef.current = {
        json,
        data: {
          elements: parsed.elements,
          appState: {
            ...parsed.appState,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            zoom: appState.zoom,
          },
          files: parsed.files,
        },
      };
      store.getState().setSaveStatus("dirty");
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void performSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [performSave],
  );

  return { onSceneChange };
}
