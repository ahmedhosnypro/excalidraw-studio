"use client";

import { ChevronLeft, ChevronRight, StickyNote, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

/**
 * Full-canvas presentation mode: hides the editing UI (zen + view mode) and
 * steps through slides. Arrow keys / space navigate, Escape exits, N toggles
 * the speaker notes bar.
 */
export function PresentationMode() {
  const presenting = useEditorStore((state) => state.presenting);
  const slides = useEditorStore((state) => state.presentationSlides);
  const stopPresentation = useEditorStore((state) => state.stopPresentation);
  const [slideIndex, setSlideIndex] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [notesVisible, setNotesVisible] = useState(false);
  const [wasPresenting, setWasPresenting] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the slide counter at the moment presentation turns on (render-time
  // state adjustment, per React's "you might not need an effect" guidance).
  if (presenting !== wasPresenting) {
    setWasPresenting(presenting);
    if (presenting) {
      setSlideIndex(0);
    }
  }

  const exit = useCallback(() => {
    const api = useEditorStore.getState().excalidrawApi;
    api?.updateScene({
      appState: { zenModeEnabled: false, viewModeEnabled: false },
    });
    stopPresentation();
    setSlideIndex(0);
    setNotesVisible(false);
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
      appState: { zenModeEnabled: true, viewModeEnabled: true, openSidebar: null },
    });
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
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setNotesVisible((visible) => !visible);
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
      if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") {
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

  const currentSlide = slides[slideIndex];
  const currentNotes = currentSlide?.notes?.trim() ?? "";
  const notesButtonActive = notesVisible && currentNotes.length > 0;

  return (
    <>
      {notesVisible && currentNotes.length > 0 ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-2xl justify-center px-4 transition-opacity duration-300",
            chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <div className="flex max-h-24 w-full items-start gap-3 overflow-y-auto rounded-xl border border-amber-300/60 bg-amber-50/95 px-4 py-3 text-sm leading-relaxed text-amber-950 shadow-lg backdrop-blur dark:border-amber-700/60 dark:bg-amber-950/90 dark:text-amber-100">
            <StickyNote
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div className="flex-1">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Notes — {currentSlide.name}
              </p>
              <p className="whitespace-pre-wrap break-words">{currentNotes}</p>
            </div>
          </div>
        </div>
      ) : null}

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
            className={cn(
              "h-8 w-8 rounded-full p-0",
              notesButtonActive &&
                "bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800 dark:bg-amber-950 dark:text-amber-300",
            )}
            onClick={() => setNotesVisible((visible) => !visible)}
            disabled={currentNotes.length === 0}
            aria-pressed={notesButtonActive}
            aria-label="Toggle speaker notes (N)"
            title={currentNotes.length === 0 ? "No notes on this slide" : "Speaker notes (N)"}
          >
            <StickyNote className="h-4 w-4" aria-hidden />
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
    </>
  );
}
