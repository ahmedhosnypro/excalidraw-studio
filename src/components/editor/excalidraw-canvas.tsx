"use client";

import { useTheme } from "next-themes";
import { useCallback } from "react";

import { DefaultSidebar, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import "@excalidraw/excalidraw/index.css";

import type { FileGql, UserGql } from "@/lib/graphql/operations";
import { useEditorStore } from "@/store/editor-store";

import { useAutosave } from "./use-autosave";
import { StudioMainMenu, StudioWelcomeScreen } from "./studio-main-menu";
import { StudioSidebar } from "@/components/studio/studio-sidebar";
import { StudioTopRight } from "./studio-top-right";

export interface ExcalidrawCanvasProps {
  user: UserGql | null;
  files: FileGql[];
  onOpenFile: (file: FileGql) => void;
}

export function ExcalidrawCanvas({
  user,
  files,
  onOpenFile,
}: ExcalidrawCanvasProps) {
  const { resolvedTheme } = useTheme();
  const { onSceneChange } = useAutosave(Boolean(user));
  const setExcalidrawApi = useEditorStore((state) => state.setExcalidrawApi);

  const handleApiReady = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      setExcalidrawApi(api);
    },
    [setExcalidrawApi],
  );

  return (
    <div className="h-dvh w-screen">
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
    </div>
  );
}
