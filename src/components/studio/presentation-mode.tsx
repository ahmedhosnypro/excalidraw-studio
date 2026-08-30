"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { useEditorStore } from "@/store/editor-store";

/**
 * Full-canvas presentation mode: hides the editing UI (zen + view mode) and
 * steps through slides. Arrow keys / space navigate, Escape exits.
 */
export function PresentationMode() {
  const presenting = useEditorStore((state) => state.presenting);
  const slides = useEditorStore((state) => state.presentationSlides);
  const stopPresentation = useEditorStore((state) => state.stopPresentation);
  const [slideIndex, setSlideIndex] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exit = useCallback(() => {
    const api = useEditorStore.getState().excalidrawApi;
    api?.updateScene({
      appState: { zenModeEnabled: false, viewModeEnabled: false },
    });
    stopPresentation();
    setSlideIndex(0);
  }, [stopPresentation]);

  const goToSlide = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, index));
      setSlideIndex(clamped);
      const api = useEditorStore.getState().excalidrawApi;
      const slide = slides[clamped];
      if (api && slide) {
        api.scrollToContent(slide.elements, {
          fitToViewport: true,
          viewportZoomFactor: 0.92,
        });
      }
    },
    [slides],
  );

  // Enter: hide UI and show the first slide.
  useEffect(() => {
    if (!presenting) {
      return;
    }
    const api = useEditorStore.getState().excalidrawApi;
    api?.updateScene({
      appState: { zenModeEnabled: true, viewModeEnabled: true },
    });
    setSlideIndex(0);
    const first = slides[0];
    if (api && first) {
      api.scrollToContent(first.elements, {
        fitToViewport: true,
        viewportZoomFactor: 0.92,
      });
    }
  }, [presenting, slides]);

  // Keyboard navigation while presenting.
  useEffect(() => {
    if (!presenting) {
      return;
    }
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        exit();
        return;
      }
      if (
        event.key === "ArrowRight" ||
        event.key === "ArrowDown" ||
        event.key === " " ||
        event.key === "PageDown"
      ) {
        event.preventDefault();
        goToSlide(slideIndex + 1);
        return;
      }
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowUp" ||
        event.key === "PageUp"
      ) {
        event.preventDefault();
        goToSlide(slideIndex - 1);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [exit, goToSlide, presenting, slideIndex]);

  // Auto-hide the presentation chrome.
  useEffect(() => {
    if (!presenting) {
      return;
    }
    const poke = (): void => {
      setChromeVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => setChromeVisible(false), 2500);
    };
    poke();
    window.addEventListener("pointermove", poke);
    return () => {
      window.removeEventListener("pointermove", poke);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [presenting]);

  if (!presenting || slides.length === 0) {
    return null;
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-6 z-50 flex items-center justify-center gap-3 transition-opacity duration-300 ${
        chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 shadow-lg backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 rounded-full p-0"
          onClick={() => goToSlide(slideIndex - 1)}
          disabled={slideIndex === 0}
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span className="min-w-16 text-center text-sm tabular-nums text-muted-foreground">
          {slideIndex + 1} / {slides.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 rounded-full p-0"
          onClick={() => goToSlide(slideIndex + 1)}
          disabled={slideIndex === slides.length - 1}
          aria-label="Next slide"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3"
          onClick={exit}
          aria-label="Exit presentation (Esc)"
        >
          <X className="mr-1 h-4 w-4" aria-hidden />
          Exit
        </Button>
      </div>
    </div>
  );
}
