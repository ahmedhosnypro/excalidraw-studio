"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Frame, Play, Presentation as PresentationIcon, RefreshCw } from "lucide-react";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { useEditorStore, type PresentationSlide } from "@/store/editor-store";

interface FrameInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  elements: ExcalidrawElement[];
}

/**
 * Builds presentation slides from the scene: one slide per frame (ordered
 * top-to-bottom, left-to-right); frame-less content becomes a single slide.
 */
export function buildSlides(elements: readonly ExcalidrawElement[]): PresentationSlide[] {
  const frames = elements.filter(
    (element): element is Extract<ExcalidrawElement, { type: "frame" }> =>
      element.type === "frame" && !element.isDeleted,
  );

  if (frames.length === 0) {
    const visible = elements.filter((element) => !element.isDeleted);
    if (visible.length === 0) {
      return [];
    }
    return [{ id: "all", name: "All content", elements: visible }];
  }

  const sorted = [...frames].sort((a, b) => a.y - b.y || a.x - b.x);
  return sorted.map((frame, index) => {
    const children = elements.filter(
      (element) =>
        !element.isDeleted &&
        element.id !== frame.id &&
        element.frameId === frame.id,
    );
    return {
      id: frame.id,
      name: frame.name?.trim() || `Slide ${index + 1}`,
      elements: children.length > 0 ? children : [frame],
    };
  });
}

export function PresentTab({ fileId }: { fileId: string | null }) {
  void fileId;
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);
  const startPresentation = useEditorStore((state) => state.startPresentation);

  const refreshSlides = useCallback(() => {
    const api = useEditorStore.getState().excalidrawApi;
    if (!api) {
      return;
    }
    setSlides(buildSlides(api.getSceneElements()));
  }, []);

  useEffect(() => {
    refreshSlides();
  }, [refreshSlides, excalidrawApi]);

  const handlePlay = useCallback(() => {
    if (slides.length === 0) {
      return;
    }
    startPresentation(slides);
  }, [slides, startPresentation]);

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
        Present your drawing as slides — one slide per frame. Draw a frame
        around content to create a slide.
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
              <button
                key={slide.id}
                type="button"
                className="flex items-center gap-3 rounded-lg border border-border/80 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60"
                onClick={handlePlay}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="truncate text-sm">{slide.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {slide.elements.length} item{slide.elements.length === 1 ? "" : "s"}
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
