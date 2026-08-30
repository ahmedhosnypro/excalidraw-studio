"use client";

import { useApolloClient } from "@apollo/client/react";
import { useCallback, useEffect, useRef } from "react";

import { SAVE_SCENE_MUTATION } from "@/lib/graphql/operations";
import type { FileGql } from "@/lib/graphql/operations";
import type { SceneDataInput } from "@/lib/graphql/operations";
import {
  buildSceneInput,
  saveGuestScene,
} from "@/lib/scene-persistence";
import { useEditorStore } from "@/store/editor-store";

import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const SAVE_DEBOUNCE_MS = 1000;

/**
 * Debounced autosave. Persists to the server (`saveScene` mutation) when a
 * cloud file is open and the user is signed in; otherwise falls back to
 * localStorage for guests.
 */
export function useAutosave(
  isAuthenticated: boolean,
): {
  onSceneChange: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void;
} {
  const client = useApolloClient();
  const pendingRef = useRef<SceneDataInput | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const store = useEditorStore;
  const getActiveFileId = useCallback(
    () => store.getState().activeFileId,
    [store],
  );
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  const performSave = useCallback(async (): Promise<void> => {
    const data = pendingRef.current;
    const fileId = getActiveFileId();
    if (!data) {
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
          variables: { fileId, data },
        });
        // Only mark saved if no newer edits arrived meanwhile.
        if (pendingRef.current === data) {
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
    saveGuestScene(data);
    if (pendingRef.current === data) {
      pendingRef.current = null;
      store.getState().setSaveStatus("saved");
    }
  }, [client, getActiveFileId, store]);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await performSave();
  }, [performSave]);

  useEffect(() => {
    store.getState().registerFlushSave(flush);
    return () => {
      store.getState().registerFlushSave(null);
    };
  }, [flush, store]);

  const onSceneChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ): void => {
      if (store.getState().loadingScene) {
        return;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      pendingRef.current = buildSceneInput(elements, appState, files);
      store.getState().setSaveStatus("dirty");
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void performSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [performSave, store],
  );

  return { onSceneChange };
}
