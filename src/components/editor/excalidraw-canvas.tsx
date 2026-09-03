"use client";

import { DefaultSidebar, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useTheme } from "next-themes";
import { useCallback } from "react";

import "@excalidraw/excalidraw/index.css";

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
