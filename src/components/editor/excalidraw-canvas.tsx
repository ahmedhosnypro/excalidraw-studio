"use client";

import { DefaultSidebar, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useTheme } from "next-themes";
import { useCallback, useMemo } from "react";

import "@excalidraw/excalidraw/index.css";

import { CommentPinsLayer } from "@/components/studio/comment-pins-layer";
import { PinPlacementOverlay } from "@/components/studio/pin-placement-overlay";
import { StudioSidebar } from "@/components/studio/studio-sidebar";
import type { UserGql } from "@/lib/graphql/operations";
import { useEditorStore } from "@/store/editor-store";
import { StudioMainMenu, StudioWelcomeScreen } from "./studio-main-menu";
import { StudioTopRight } from "./studio-top-right";
import { useAutosave } from "./use-autosave";

export interface ExcalidrawCanvasProps {
  user: UserGql | null;
}

export function ExcalidrawCanvas({ user }: ExcalidrawCanvasProps) {
  const { resolvedTheme } = useTheme();
  const { onSceneChange } = useAutosave(Boolean(user));
  const setExcalidrawApi = useEditorStore((state) => state.setExcalidrawApi);
  const activeFileId = useEditorStore((state) => state.activeFileId);

  // Stable prop identities: Excalidraw re-renders (and re-fires onChange)
  // when render/UIOptions props change identity on every parent render —
  // which previously caused a dirty→save→re-render feedback loop.
  const renderTopRight = useCallback(() => <StudioTopRight user={user} />, [user]);
  const uiOptions = useMemo(
    () => ({
      canvasActions: {
        loadScene: false,
        saveToActiveFile: false,
      },
    }),
    [],
  );

  const handleApiReady = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      const store = useEditorStore.getState();
      // A fresh canvas instance reports its initial (empty) state through
      // onChange on every subsequent re-render — drop anything captured by
      // the mount commit and clear the change baseline so the re-applied
      // scene becomes the new baseline instead of an "edit".
      store.cancelSave?.();
      store.resetSaveBaseline?.();
      // Suppress autosave until either a scene is (re-)applied or we know
      // there is nothing to load.
      store.setLoadingScene(true);
      setExcalidrawApi(api);
      // Capture the initial viewport, then track pan/zoom so canvas overlays
      // (comment pins) follow it.
      const appState = api.getAppState();
      useEditorStore.getState().setViewport({
        scrollX: appState.scrollX ?? 0,
        scrollY: appState.scrollY ?? 0,
        zoom: appState.zoom.value,
      });
      api.onScrollChange((scrollX, scrollY, zoom) => {
        useEditorStore.getState().setViewport({ scrollX, scrollY, zoom: zoom.value });
      });
      if (store.activeFileId) {
        // Canvas remounted while a file is open (HMR, dynamic chunk reload):
        // re-apply that file's scene so the drawing reappears instead of the
        // empty canvas silently replacing it.
        store.requestReopen(store.activeFileId);
      } else {
        store.setLoadingScene(false);
      }
    },
    [setExcalidrawApi],
  );

  return (
    <div className="relative h-dvh w-screen">
      <Excalidraw
        excalidrawAPI={handleApiReady}
        onChange={onSceneChange}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        renderTopRightUI={renderTopRight}
        UIOptions={uiOptions}
      >
        <StudioMainMenu isAuthenticated={Boolean(user)} />
        <StudioWelcomeScreen isAuthenticated={Boolean(user)} />
        <StudioSidebar />
        <DefaultSidebar.Trigger />
      </Excalidraw>
      <PinPlacementOverlay />
      <CommentPinsLayer fileId={activeFileId} />
    </div>
  );
}
