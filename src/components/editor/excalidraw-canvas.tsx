"use client";

import { DefaultSidebar, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useTheme } from "next-themes";
import { useCallback } from "react";

import "@excalidraw/excalidraw/index.css";

import { CommentPinsLayer } from "@/components/studio/comment-pins-layer";
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

  const handleApiReady = useCallback(
    (api: ExcalidrawImperativeAPI) => {
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
    },
    [setExcalidrawApi],
  );

  return (
    <div className="relative h-dvh w-screen">
      <Excalidraw
        excalidrawAPI={handleApiReady}
        onChange={onSceneChange}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        renderTopRightUI={() => <StudioTopRight user={user} />}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
      >
        <StudioMainMenu isAuthenticated={Boolean(user)} />
        <StudioWelcomeScreen isAuthenticated={Boolean(user)} />
        <StudioSidebar />
        <DefaultSidebar.Trigger />
      </Excalidraw>
      <CommentPinsLayer fileId={activeFileId} />
    </div>
  );
}
