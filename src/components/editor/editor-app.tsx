"use client";

import { useLazyQuery, useQuery } from "@apollo/client/react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { AppState } from "@excalidraw/excalidraw/types";
import { useEffect, useRef } from "react";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { CommandPalette } from "@/components/studio/command-palette";
import { FilesDialog } from "@/components/studio/files-dialog";
import { PresentationMode } from "@/components/studio/presentation-mode";
import type {
  FileGql,
  FilesQueryData,
  MeQueryData,
  SceneQueryData,
  SceneQueryVariables,
} from "@/lib/graphql/operations";
import { FILES_QUERY, ME_QUERY, SCENE_QUERY } from "@/lib/graphql/operations";
import { loadGuestScene, sceneFilesToArray } from "@/lib/scene-persistence";
import { useEditorStore } from "@/store/editor-store";
import { ExcalidrawCanvas } from "./excalidraw-canvas";

/** Applies a loaded scene to the canvas. */
async function applyScene(
  elements: unknown[],
  appState: Record<string, unknown> | undefined,
  files: Record<string, unknown> | undefined,
): Promise<void> {
  const api = useEditorStore.getState().excalidrawApi;
  if (!api) {
    return;
  }
  api.updateScene({
    elements: elements as ExcalidrawElement[],
    appState: (appState ?? {}) as Pick<AppState, keyof AppState>,
  });
  const filesList = sceneFilesToArray(files);
  if (filesList.length > 0) {
    await api.addFiles(filesList);
  }
}

export function EditorApp() {
  const { data: meData, loading: meLoading } = useQuery<MeQueryData>(ME_QUERY);
  const user = meData?.me ?? null;
  const { data: filesData } = useQuery<FilesQueryData>(FILES_QUERY, {
    skip: !user,
  });
  const files = filesData?.files ?? [];
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);

  const [loadScene] = useLazyQuery<SceneQueryData, SceneQueryVariables>(SCENE_QUERY, {
    fetchPolicy: "network-only",
  });

  const bootstrappedRef = useRef(false);
  const openFileRef = useRef<(file: FileGql) => Promise<void>>(async () => undefined);

  const openFile = async (file: FileGql): Promise<void> => {
    const store = useEditorStore.getState();
    await store.flushSave?.();
    store.setLoadingScene(true);
    store.openFile(file.id, file.name);
    try {
      const result = await loadScene({ variables: { fileId: file.id } });
      const scene = result.data?.scene;
      if (scene) {
        await applyScene(scene.elements, scene.appState, scene.files);
        useEditorStore
          .getState()
          .excalidrawApi?.scrollToContent(undefined, { fitToViewport: true });
      }
    } finally {
      useEditorStore.getState().setLoadingScene(false);
    }
  };

  openFileRef.current = openFile;

  // Initial bootstrap: open the most recent file (authed) or the guest scene.
  useEffect(() => {
    if (meLoading || bootstrappedRef.current || !excalidrawApi) {
      return;
    }
    bootstrappedRef.current = true;
    if (user && files.length > 0) {
      void openFileRef.current(files[0]);
      return;
    }
    if (!user) {
      const guest = loadGuestScene();
      if (guest && guest.data.elements.length > 0) {
        void applyScene(guest.data.elements, guest.data.appState, guest.data.files);
      }
    }
  }, [meLoading, user, files, excalidrawApi]);

  // Global hotkeys owned by the studio shell.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const { flushSave, openAuthDialog } = useEditorStore.getState();
        if (user) {
          void flushSave?.();
        } else {
          openAuthDialog("Sign in to save your drawings to the cloud.");
        }
        return;
      }

      if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        useEditorStore.getState().openDialog("files");
        return;
      }

      // Open Excalidraw's built-in image export dialog (advertised as
      // "Export image…" in the command palette).
      if (mod && event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        useEditorStore
          .getState()
          .excalidrawApi?.updateScene({ appState: { openDialog: { name: "imageExport" } } });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [user]);

  return (
    <main className="h-dvh w-full">
      <ExcalidrawCanvas user={user} />
      <AuthDialog />
      <FilesDialog onOpenFile={(file) => void openFile(file)} />
      <PresentationMode />
      <CommandPalette user={user} files={files} onOpenFile={(file) => void openFile(file)} />
    </main>
  );
}
