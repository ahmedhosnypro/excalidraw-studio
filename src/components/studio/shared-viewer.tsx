"use client";

import { useQuery } from "@apollo/client/react";
import { DefaultSidebar, Excalidraw, Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Eye, LogIn, MessageCircle, Moon, PencilRuler, Play, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo } from "react";

import "@excalidraw/excalidraw/index.css";

import { SharedCommentPinsLayer } from "@/components/studio/comment-pins-layer";
import { GuestCommentsTab } from "@/components/studio/guest-comments-tab";
import { PresentationMode } from "@/components/studio/presentation-mode";
import { Button } from "@/components/ui/button";
import { registerViewportTracking } from "@/lib/canvas-geometry";
import type {
  MeQueryData,
  SharedCommentsQueryData,
  SharedCommentsQueryVariables,
  SharedFileQueryData,
  SharedFileQueryVariables,
  SharedSceneQueryData,
  SharedSceneQueryVariables,
} from "@/lib/graphql/operations";
import {
  ME_QUERY,
  SHARED_COMMENTS_QUERY,
  SHARED_FILE_QUERY,
  SHARED_SCENE_QUERY,
} from "@/lib/graphql/operations";
import { sceneFilesToArray } from "@/lib/scene-persistence";
import { buildSlides } from "@/lib/slides";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

/** Centered card for the loading / broken-link states. */
function ViewerStateCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          {icon}
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Button className="gap-1.5" onClick={navigateHome}>
          <LogIn className="h-4 w-4" aria-hidden />
          Go to Excalidraw Studio
        </Button>
      </div>
    </div>
  );
}

function navigateHome(): void {
  window.location.href = "/";
}

/**
 * Read-only share-link viewer: renders the shared scene in view mode with
 * guest commenting (sidebar + canvas pins) and presentation support.
 */
export function SharedViewer({ token }: { token: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const setExcalidrawApi = useEditorStore((state) => state.setExcalidrawApi);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);

  const { data: meData } = useQuery<MeQueryData>(ME_QUERY);
  const user = meData?.me ?? null;

  const {
    data: fileInfo,
    loading: infoLoading,
    error: infoError,
  } = useQuery<SharedFileQueryData, SharedFileQueryVariables>(SHARED_FILE_QUERY, {
    variables: { token },
  });

  const { data: sceneData, loading: sceneLoading } = useQuery<
    SharedSceneQueryData,
    SharedSceneQueryVariables
  >(SHARED_SCENE_QUERY, { variables: { token } });

  const { data: commentsData } = useQuery<SharedCommentsQueryData, SharedCommentsQueryVariables>(
    SHARED_COMMENTS_QUERY,
    { variables: { token } },
  );
  const commentCount = commentsData?.sharedComments?.length ?? 0;

  const handleApiReady = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      setExcalidrawApi(api);
      // Track pan/zoom so the guest pin overlay follows the viewport.
      registerViewportTracking(api);
    },
    [setExcalidrawApi],
  );

  // Apply scene files (images) once the API and scene are both available.
  const scene = sceneData?.sharedScene;
  useEffect(() => {
    if (!scene || !excalidrawApi) {
      return;
    }
    const filesList = sceneFilesToArray(scene.files);
    if (filesList.length > 0) {
      void excalidrawApi.addFiles(filesList);
    }
  }, [excalidrawApi, scene]);

  const initialData = useMemo(() => {
    if (!scene) {
      return undefined;
    }
    const appState = { ...(scene.appState as Partial<AppState>), viewModeEnabled: true };
    return {
      elements: scene.elements as ExcalidrawElement[],
      appState,
    };
  }, [scene]);

  const uiOptions = useMemo(
    () => ({
      canvasActions: {
        loadScene: false,
        saveToActiveFile: false,
        export: { saveFileToDisk: false },
      },
    }),
    [],
  );

  const toggleComments = useCallback(() => {
    const open = useEditorStore.getState().excalidrawApi?.getAppState().openSidebar;
    const isComments = open?.name === "default" && open.tab === "comments";
    useEditorStore
      .getState()
      .excalidrawApi?.toggleSidebar({ name: "default", tab: "comments", force: !isComments });
  }, []);

  const startGuestPresentation = useCallback(() => {
    const api = useEditorStore.getState().excalidrawApi;
    const elements = api?.getSceneElements();
    if (!elements) {
      return;
    }
    const slides = buildSlides(elements);
    if (slides.length > 0) {
      useEditorStore.getState().startPresentation(slides);
    }
  }, []);

  if (infoError) {
    return (
      <ViewerStateCard
        title="This share link isn't working"
        description="It was revoked by the owner or never existed. Ask for a fresh link — or start drawing your own."
        icon={<Eye className="h-7 w-7 text-muted-foreground" aria-hidden />}
      />
    );
  }

  if (infoLoading || sceneLoading || !fileInfo || !scene) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading shared drawing…</p>
        </div>
      </div>
    );
  }

  const info = fileInfo.sharedFile;

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <header className="z-20 flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 bg-background/95 px-3 shadow-[0_1px_0_0_rgb(0_0_0/0.02)] backdrop-blur sm:px-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm"
            aria-hidden
          >
            <PencilRuler className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{info.name}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              Shared by {info.ownerName}
            </span>
          </div>
          <span
            className="ml-1 hidden shrink-0 items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex"
            title="You can pan, zoom, comment and present — but not edit"
          >
            <Eye className="h-3 w-3" aria-hidden />
            View only
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-1.5 px-2",
              commentCount > 0 &&
                "text-violet-700 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200",
            )}
            onClick={toggleComments}
            aria-label={`Comments (${commentCount})`}
            title="Comments"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Comments</span>
            {commentCount > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white">
                {commentCount}
              </span>
            ) : null}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={startGuestPresentation}
            aria-label="Present this drawing"
            title="Present slides"
          >
            <Play className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" aria-hidden />
            ) : (
              <Moon className="h-4 w-4" aria-hidden />
            )}
          </Button>
          <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" aria-hidden />
          {user ? (
            <Button size="sm" className="h-8 gap-1.5" onClick={navigateHome}>
              <PencilRuler className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Open my studio</span>
              <span className="sm:hidden">Editor</span>
            </Button>
          ) : (
            <Button size="sm" className="h-8 gap-1.5" onClick={navigateHome}>
              <LogIn className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign in to draw</span>
              <span className="sm:hidden">Sign in</span>
            </Button>
          )}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <Excalidraw
          excalidrawAPI={handleApiReady}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          viewModeEnabled
          initialData={initialData}
          UIOptions={uiOptions}
        >
          <DefaultSidebar>
            <Sidebar.Tab tab="comments">
              <GuestCommentsTab token={token} />
            </Sidebar.Tab>
          </DefaultSidebar>
        </Excalidraw>
        <SharedCommentPinsLayer token={token} />
        <PresentationMode />
      </div>
    </div>
  );
}
