"use client";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { create } from "zustand";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** One presentation slide — typically the contents of a frame. */
export interface PresentationSlide {
  id: string;
  name: string;
  elements: ExcalidrawElement[];
  /** The backing frame element (null for the frameless "all content" slide). */
  frame: Extract<ExcalidrawElement, { type: "frame" }> | null;
  /** Speaker notes persisted on the frame element's customData. */
  notes: string;
}

type DialogName = "files" | "auth" | "share" | "shortcuts" | "ai" | null;

export type SidebarTab = "libraries" | "comments" | "present";

interface EditorState {
  /** Imperative Excalidraw API, set once the canvas mounts. */
  excalidrawApi: ExcalidrawImperativeAPI | null;
  setExcalidrawApi: (api: ExcalidrawImperativeAPI | null) => void;

  /** Canvas viewport (updated on every pan/zoom) — powers canvas overlays. */
  viewport: { scrollX: number; scrollY: number; zoom: number };
  setViewport: (viewport: { scrollX: number; scrollY: number; zoom: number }) => void;

  /** Comment highlighted from a canvas pin click (scrolls it into view). */
  highlightedCommentId: string | null;
  highlightComment: (id: string | null) => void;

  /**
   * Click-to-place pin mode: while active, the next canvas click picks the
   * pin location for the pending comment draft (stored in pendingPin).
   */
  pinPlacementActive: boolean;
  pendingPin: { x: number; y: number } | null;
  startPinPlacement: () => void;
  cancelPinPlacement: () => void;
  placePin: (x: number, y: number) => void;
  clearPendingPin: () => void;

  /** Currently open cloud file (null = guest/local scene). */
  activeFileId: string | null;
  activeFileName: string | null;
  openFile: (id: string, name: string) => void;
  closeFile: () => void;
  renameActiveFile: (name: string) => void;

  /** Autosave status indicator. */
  saveStatus: SaveStatus;
  setSaveStatus: (status: SaveStatus) => void;

  /** Modal dialogs. */
  dialog: DialogName;
  openDialog: (dialog: Exclude<DialogName, null>) => void;
  closeDialog: () => void;

  /**
   * Target file of the share dialog (null = the currently open file). Lets
   * the files dialog share a non-active file directly from its row.
   */
  shareFileId: string | null;
  openShareDialog: (fileId?: string | null) => void;

  /** Auth dialog intent (e.g. "your files are cloud-saved after sign-in"). */
  authIntent: string | null;
  openAuthDialog: (intent?: string) => void;

  /** Right sidebar tab (null = closed). */
  sidebarTab: SidebarTab | null;
  setSidebarTab: (tab: SidebarTab | null) => void;

  /** Presentation mode. */
  presenting: boolean;
  setPresenting: (presenting: boolean) => void;

  /** Slides (frames) for the active presentation. */
  presentationSlides: PresentationSlide[];
  startPresentation: (slides: PresentationSlide[]) => void;
  stopPresentation: () => void;

  /** Registered by the autosave hook; flushes a pending save immediately. */
  flushSave: (() => Promise<void>) | null;
  registerFlushSave: (fn: (() => Promise<void>) | null) => void;

  /** Registered by the autosave hook; discards a pending (stale) snapshot. */
  cancelSave: (() => void) | null;
  registerCancelSave: (fn: (() => void) | null) => void;

  /** Registered by the autosave hook; clears the change-detection baseline. */
  resetSaveBaseline: (() => void) | null;
  registerResetSaveBaseline: (fn: (() => void) | null) => void;

  /**
   * Set when the canvas (re)mounted while a file is open — editor-app reacts
   * by re-loading and re-applying that file's scene (remounts otherwise start
   * with an empty canvas, which must never be saved over the stored scene).
   */
  reopenFileId: string | null;
  requestReopen: (id: string) => void;
  clearReopen: () => void;

  /**
   * True once the open file's stored scene has been applied to the canvas.
   * Autosave refuses to write a file whose stored content was never loaded
   * (failed/raced load) — an unsynced canvas must not replace stored content.
   */
  sceneLoaded: boolean;
  setSceneLoaded: (loaded: boolean) => void;

  /** Internal flag suppressing autosave while a scene is being loaded. */
  loadingScene: boolean;
  setLoadingScene: (loading: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  excalidrawApi: null,
  setExcalidrawApi: (api) => set({ excalidrawApi: api }),

  viewport: { scrollX: 0, scrollY: 0, zoom: 1 },
  setViewport: (viewport) => set({ viewport }),

  highlightedCommentId: null,
  highlightComment: (id) => set({ highlightedCommentId: id }),

  pinPlacementActive: false,
  pendingPin: null,
  startPinPlacement: () => set({ pinPlacementActive: true }),
  cancelPinPlacement: () => set({ pinPlacementActive: false }),
  placePin: (x, y) => set({ pinPlacementActive: false, pendingPin: { x, y } }),
  clearPendingPin: () => set({ pendingPin: null }),

  activeFileId: null,
  activeFileName: null,
  openFile: (id, name) =>
    set({ activeFileId: id, activeFileName: name, saveStatus: "idle", sceneLoaded: false }),
  closeFile: () =>
    set({ activeFileId: null, activeFileName: null, saveStatus: "idle", sceneLoaded: false }),
  renameActiveFile: (name) => set({ activeFileName: name }),

  saveStatus: "idle",
  setSaveStatus: (status) => set({ saveStatus: status }),

  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null, authIntent: null, shareFileId: null }),

  shareFileId: null,
  openShareDialog: (fileId) => set({ dialog: "share", shareFileId: fileId ?? null }),

  authIntent: null,
  openAuthDialog: (intent) => set({ dialog: "auth", authIntent: intent ?? null }),

  sidebarTab: null,
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  presenting: false,
  setPresenting: (presenting) => set({ presenting }),

  presentationSlides: [],
  startPresentation: (slides) => set({ presenting: true, presentationSlides: slides }),
  stopPresentation: () => set({ presenting: false, presentationSlides: [] }),

  flushSave: null,
  registerFlushSave: (fn) => set({ flushSave: fn }),

  cancelSave: null,
  registerCancelSave: (fn) => set({ cancelSave: fn }),

  resetSaveBaseline: null,
  registerResetSaveBaseline: (fn) => set({ resetSaveBaseline: fn }),

  reopenFileId: null,
  requestReopen: (id) => set({ reopenFileId: id }),
  clearReopen: () => set({ reopenFileId: null }),

  sceneLoaded: false,
  setSceneLoaded: (loaded) => set({ sceneLoaded: loaded }),

  loadingScene: false,
  setLoadingScene: (loading) => set({ loadingScene: loading }),
}));
