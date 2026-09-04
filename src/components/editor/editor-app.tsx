"use client";

import { useLazyQuery, useQuery } from "@apollo/client/react";
import { useEffect, useRef, useState } from "react";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { AiDialog } from "@/components/studio/ai-dialog";
import { CommandPalette } from "@/components/studio/command-palette";
import { FilesDialog } from "@/components/studio/files-dialog";
import { HistoryDialog } from "@/components/studio/history-dialog";
import { PresentationMode } from "@/components/studio/presentation-mode";
import { ShareDialog } from "@/components/studio/share-dialog";
import { SharedViewer } from "@/components/studio/shared-viewer";
import type {
  FileGql,
  FilesQueryData,
  MeQueryData,
  SceneQueryData,
  SceneQueryVariables,
} from "@/lib/graphql/operations";
import { FILES_QUERY, ME_QUERY, SCENE_QUERY } from "@/lib/graphql/operations";
import { applySavedViewport, applySceneToCanvas } from "@/lib/scene-canvas";
import { loadGuestScene } from "@/lib/scene-persistence";
import { useEditorStore } from "@/store/editor-store";
import { ExcalidrawCanvas } from "./excalidraw-canvas";

export function EditorApp() {
  // Share-link viewer mode: `/?share=<token>` renders the read-only shared
  // scene instead of the editor workspace (client-only — this component tree
  // is dynamically imported with ssr disabled).
  const [shareToken] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("share"),
  );

  const { data: meData, loading: meLoading } = useQuery<MeQueryData>(ME_QUERY);
  const user = meData?.me ?? null;
  const { data: filesData, loading: filesLoading } = useQuery<FilesQueryData>(FILES_QUERY, {
    skip: !user,
  });
  const files = filesData?.files ?? [];
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);

  const [loadScene] = useLazyQuery<SceneQueryData, SceneQueryVariables>(SCENE_QUERY, {
    fetchPolicy: "network-only",
  });

  const bootstrappedRef = useRef(false);
  // Identity the current bootstrap belongs to. When the user signs in or out
  // (guest ↔ account), the bootstrap must re-run so the freshly signed-in
  // user's most recent file opens instead of staying on the guest scene.
  const bootstrappedIdentityRef = useRef<string | null | undefined>(undefined);
  const openFileRef = useRef<(file: FileGql) => Promise<void>>(async () => undefined);
  const reopenFileId = useEditorStore((state) => state.reopenFileId);

  const openFile = async (file: FileGql): Promise<void> => {
    const store = useEditorStore.getState();
    await store.flushSave?.();
    // Discard anything captured after the flush (e.g. the mount-time empty
    // snapshot) — it belongs to no longer-open state and must not be written
    // over the file we are about to load into.
    store.cancelSave?.();
    store.setLoadingScene(true);
    store.openFile(file.id, file.name);
    try {
      const result = await loadScene({ variables: { fileId: file.id } });
      const scene = result.data?.scene;
      if (scene) {
        await applySceneToCanvas(scene.elements, scene.appState, scene.files);
        // Mark the file as synced-in: autosave may now write it. A failed or
        // raced load leaves this false, which blocks saving an unsynced
        // (possibly empty) canvas over the stored scene.
        useEditorStore.getState().setSceneLoaded(true);
        // Restore the saved viewport exactly when present; otherwise fit the
        // drawing (empty scenes reset to the default view — see helper).
        const api = useEditorStore.getState().excalidrawApi;
        if (api) {
          applySavedViewport(api, scene.elements.length, scene.appState);
        }
      }
    } finally {
      useEditorStore.getState().setLoadingScene(false);
    }
  };

  openFileRef.current = openFile;

  // The canvas (re)mounted while a file was open (HMR / dynamic chunk
  // reload): re-load and re-apply that file's scene so the drawing reappears
  // instead of the fresh empty canvas silently replacing it.
  useEffect(() => {
    if (!reopenFileId) {
      return;
    }
    const store = useEditorStore.getState();
    const name = store.activeFileName ?? "Untitled";
    store.clearReopen();
    void openFileRef.current({ id: reopenFileId, name });
  }, [reopenFileId]);

  // Initial bootstrap: open the most recent file (authed) or the guest scene.
  // For signed-in users we wait for the files query to settle — otherwise the
  // canvas can mount before the list arrives and the race would skip opening.
  // Signing in/out re-runs the bootstrap for the new identity.
  useEffect(() => {
    const identity = user?.id ?? null;
    if (bootstrappedIdentityRef.current === undefined) {
      bootstrappedIdentityRef.current = identity;
    } else if (bootstrappedIdentityRef.current !== identity) {
      bootstrappedIdentityRef.current = identity;
      bootstrappedRef.current = false;
    }
    if (meLoading || bootstrappedRef.current || !excalidrawApi) {
      return;
    }
    if (user) {
      if (filesLoading) {
        return;
      }
      bootstrappedRef.current = true;
      if (files.length > 0) {
        void openFileRef.current(files[0]);
      }
      return;
    }
    bootstrappedRef.current = true;
    const guest = loadGuestScene();
    if (guest && guest.data.elements.length > 0) {
      void (async () => {
        const guestStore = useEditorStore.getState();
        // Drop the mount-time empty snapshot so its debounce can never
        // overwrite the guest draft we are about to re-apply.
        guestStore.cancelSave?.();
        guestStore.setLoadingScene(true);
        try {
          await applySceneToCanvas(guest.data.elements, guest.data.appState, guest.data.files);
        } finally {
          useEditorStore.getState().setLoadingScene(false);
        }
      })();
    }
  }, [meLoading, filesLoading, user, files, excalidrawApi]);

  // Global hotkeys owned by the studio shell.
  useEffect(() => {
    if (shareToken) {
      return;
    }
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

      if (mod && event.key.toLowerCase() === "e" && !event.shiftKey) {
        event.preventDefault();
        useEditorStore.getState().openDialog("share");
        return;
      }

      // AI text-to-diagram dialog (advertised as "Generate diagram with AI…").
      if (mod && event.key.toLowerCase() === "m") {
        event.preventDefault();
        const store = useEditorStore.getState();
        if (user) {
          store.openDialog("ai");
        } else {
          store.openAuthDialog("Sign in to generate diagrams with AI.");
        }
        return;
      }

      // Version history (Ctrl+Alt+H — plain Ctrl+H is the browser's history).
      if (mod && event.altKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        const store = useEditorStore.getState();
        if (user) {
          store.openHistoryDialog();
        } else {
          store.openAuthDialog("Sign in to browse your drawings' version history.");
        }
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
  }, [user, shareToken]);

  if (shareToken) {
    return <SharedViewer token={shareToken} />;
  }

  return (
    <main className="h-dvh w-full">
      <ExcalidrawCanvas user={user} />
      <AuthDialog />
      <FilesDialog onOpenFile={(file) => void openFile(file)} />
      <ShareDialog />
      <AiDialog />
      <HistoryDialog />
      <PresentationMode />
      <CommandPalette user={user} files={files} onOpenFile={(file) => void openFile(file)} />
    </main>
  );
}
