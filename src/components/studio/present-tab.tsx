"use client";

import { exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import {
  ChevronDown,
  ChevronUp,
  Frame,
  Play,
  Presentation as PresentationIcon,
  RefreshCw,
  StickyNote,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildSlides, reorderFrame, setFrameNote } from "@/lib/slides";
import { mountSvgPreview } from "@/lib/svg-preview";
import { cn } from "@/lib/utils";
import { type PresentationSlide, useEditorStore } from "@/store/editor-store";

/** SVG preview of one slide, clipped to its frame. */
function SlideThumbnail({
  slide,
  files,
  darkMode,
}: {
  slide: PresentationSlide;
  files: BinaryFiles;
  darkMode: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || slide.elements.length === 0) {
      return;
    }
    let cancelled = false;
    void exportToSvg({
      elements: slide.elements as never,
      appState: {
        exportBackground: false,
        exportWithDarkMode: darkMode,
        exportingFrame: slide.frame ?? null,
      },
      files,
      exportPadding: 8,
    })
      .then((svg) => {
        if (cancelled) {
          return;
        }
        mountSvgPreview(svg, host);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [darkMode, files, slide.elements, slide.frame]);

  return (
    <div
      className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30"
      aria-hidden
    >
      {slide.elements.length === 0 || failed ? (
        <Frame className="h-5 w-5 text-muted-foreground/50" />
      ) : (
        <div ref={hostRef} className="h-full w-full" />
      )}
    </div>
  );
}

/** One slide row: thumbnail, name, reorder buttons, and a notes editor. */
function SlideRow({
  slide,
  index,
  total,
  files,
  darkMode,
  onPlay,
  onReorder,
  onNotesChange,
}: {
  slide: PresentationSlide;
  index: number;
  total: number;
  files: BinaryFiles;
  darkMode: boolean;
  onPlay: () => void;
  onReorder: (direction: "up" | "down") => void;
  onNotesChange: (note: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(slide.notes);
  const [lastSeenNotes, setLastSeenNotes] = useState(slide.notes);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow external note changes (e.g. another tab's edit lands on the scene)
  // via React's render-time adjustment pattern for prop-derived state.
  if (lastSeenNotes !== slide.notes) {
    setLastSeenNotes(slide.notes);
    setNoteDraft(slide.notes);
  }

  const handleNoteEdit = useCallback(
    (value: string) => {
      setNoteDraft(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => onNotesChange(value), 600);
    },
    [onNotesChange],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [],
  );

  const hasNotes = slide.notes.trim().length > 0;
  const canReorder = slide.frame !== null && total > 1;

  return (
    <div className="group rounded-lg border border-border/80 bg-card p-2 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-colors hover:border-border">
      <button type="button" className="block w-full text-left" onClick={onPlay}>
        <SlideThumbnail slide={slide} files={files} darkMode={darkMode} />
      </button>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums">
          {index + 1}
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
          onClick={onPlay}
          title={slide.name}
        >
          {slide.name}
        </button>
        {slide.frame ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {slide.elements.length} item{slide.elements.length === 1 ? "" : "s"}
          </span>
        ) : null}
        <span className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            disabled={!canReorder || index === 0}
            onClick={() => onReorder("up")}
            aria-label={`Move slide ${index + 1} up`}
            title="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            disabled={!canReorder || index === total - 1}
            onClick={() => onReorder("down")}
            aria-label={`Move slide ${index + 1} down`}
            title="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 w-6 p-0", hasNotes && "text-amber-600 dark:text-amber-400")}
            onClick={() => setNotesOpen((open) => !open)}
            aria-pressed={notesOpen}
            aria-label={`Speaker notes for slide ${index + 1}`}
            title="Speaker notes"
          >
            <StickyNote className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </span>
      </div>
      {notesOpen ? (
        <textarea
          className="mt-1.5 min-h-16 w-full resize-y rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={noteDraft}
          onChange={(event) => handleNoteEdit(event.target.value)}
          placeholder="Speaker notes — visible only to you while presenting…"
          maxLength={2000}
          aria-label={`Speaker notes for slide ${index + 1}`}
        />
      ) : null}
    </div>
  );
}

export function PresentTab({ fileId }: { fileId: string | null }) {
  void fileId;
  const [snapshot, setSnapshot] = useState<readonly ExcalidrawElement[] | null>(null);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);
  const startPresentation = useEditorStore((state) => state.startPresentation);
  const { resolvedTheme } = useTheme();

  // Slides derive from the live scene (or the latest manual snapshot).
  const slides = useMemo(() => {
    const source = snapshot ?? excalidrawApi?.getSceneElements();
    return source ? buildSlides(source) : [];
  }, [snapshot, excalidrawApi]);

  // Keep slides in sync with live scene edits (notes, reorders, new frames):
  // onChange fires on real element changes; pure re-renders keep the same
  // elements array reference so the setState bails out.
  useEffect(() => {
    if (!excalidrawApi) {
      return;
    }
    return excalidrawApi.onChange((elements) => {
      setSnapshot(elements);
    });
  }, [excalidrawApi]);

  const refreshSlides = useCallback(() => {
    const api = useEditorStore.getState().excalidrawApi;
    if (!api) {
      return;
    }
    setSnapshot(api.getSceneElements());
  }, []);

  const handlePlay = useCallback(() => {
    if (slides.length === 0) {
      return;
    }
    startPresentation(slides);
  }, [slides, startPresentation]);

  const handleReorder = useCallback((slideId: string, direction: "up" | "down") => {
    const api = useEditorStore.getState().excalidrawApi;
    if (!api) {
      return;
    }
    const current = api.getSceneElements();
    const reordered = reorderFrame(current, slideId, direction);
    api.updateScene({ elements: reordered });
    setSnapshot(api.getSceneElements());
  }, []);

  const handleNotesChange = useCallback((slideId: string, note: string) => {
    const api = useEditorStore.getState().excalidrawApi;
    if (!api) {
      return;
    }
    const current = api.getSceneElements();
    api.updateScene({ elements: setFrameNote(current, slideId, note) });
  }, []);

  const files = useMemo(() => excalidrawApi?.getFiles() ?? {}, [excalidrawApi]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <PresentationIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">Present</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={refreshSlides}
          aria-label="Refresh slides"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        One slide per frame — reorder slides, add speaker notes, then present full-screen.
      </p>

      <Button onClick={handlePlay} disabled={slides.length === 0} className="gap-1.5">
        <Play className="h-4 w-4" aria-hidden />
        {slides.length > 0 ? `Play (${slides.length})` : "Play"}
      </Button>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 pr-2">
          {slides.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Frame className="h-6 w-6 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">No slides yet</p>
              <p className="text-xs text-muted-foreground">
                Add frames to your canvas — each frame becomes a slide.
              </p>
            </div>
          ) : (
            slides.map((slide, index) => (
              <SlideRow
                key={slide.id}
                slide={slide}
                index={index}
                total={slides.length}
                files={files}
                darkMode={resolvedTheme === "dark"}
                onPlay={handlePlay}
                onReorder={(direction) => handleReorder(slide.id, direction)}
                onNotesChange={(note) => handleNotesChange(slide.id, note)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
