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
}

type DialogName = "files" | "auth" | "shortcuts" | null;

type SidebarTab = "libraries" | "comments" | "present";

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

  activeFileId: null,
  activeFileName: null,
  openFile: (id, name) => set({ activeFileId: id, activeFileName: name, saveStatus: "idle" }),
  closeFile: () => set({ activeFileId: null, activeFileName: null, saveStatus: "idle" }),
  renameActiveFile: (name) => set({ activeFileName: name }),

  saveStatus: "idle",
  setSaveStatus: (status) => set({ saveStatus: status }),

  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null, authIntent: null }),

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

  loadingScene: false,
  setLoadingScene: (loading) => set({ loadingScene: loading }),
}));
