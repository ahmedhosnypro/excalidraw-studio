"use client";

import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  LayoutGrid,
  Printer,
  StickyNote,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlideThumbnail } from "@/components/studio/slide-thumbnail";
import { Button } from "@/components/ui/button";

import { printSlides } from "@/lib/print-slides";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

/**
 * Presentation laser pointer: a glowing red dot that follows the cursor while
 * presenting. Renders via direct style mutation (no re-renders per move).
 */
function LaserDot({ active }: { active: boolean }) {
  const dotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    const dot = dotRef.current;
    if (!dot) {
      return;
    }
    // Start off-screen so the dot does not flash at (0, 0).
    dot.style.transform = "translate3d(-100px, -100px, 0)";
    const move = (event: PointerEvent): void => {
      dot.style.transform = `translate3d(${event.clientX - 9}px, ${event.clientY - 9}px, 0)`;
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [active]);

  if (!active) {
    return null;
  }

  return (
    <div
      ref={dotRef}
      className="pointer-events-none fixed left-0 top-0 z-[70] will-change-transform"
      aria-hidden
    >
      <span className="relative flex h-[18px] w-[18px]">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/50" />
        <span className="relative inline-flex h-[18px] w-[18px] rounded-full bg-red-600 shadow-[0_0_12px_4px_rgba(220,38,38,0.55)] ring-2 ring-white/70" />
      </span>
    </div>
  );
}

/**
 * Full-canvas presentation mode: hides the editing UI (zen + view mode) and
 * steps through slides. Arrow keys / space navigate, Escape exits, N toggles
 * the speaker notes bar, G toggles the slide picker strip, L toggles the
 * laser pointer.
 */
export function PresentationMode() {
  const presenting = useEditorStore((state) => state.presenting);
  const slides = useEditorStore((state) => state.presentationSlides);
  const stopPresentation = useEditorStore((state) => state.stopPresentation);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);
  const { resolvedTheme } = useTheme();
  const [slideIndex, setSlideIndex] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [notesVisible, setNotesVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(true);
  const [laserActive, setLaserActive] = useState(false);
  const [wasPresenting, setWasPresenting] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSlideRef = useRef<HTMLButtonElement | null>(null);

  const files = useMemo<BinaryFiles>(() => excalidrawApi?.getFiles() ?? {}, [excalidrawApi]);

  const handlePrint = useCallback(() => {
    void printSlides(slides, files, resolvedTheme === "dark");
  }, [files, resolvedTheme, slides]);

  // Reset the slide counter at the moment presentation turns on (render-time
  // state adjustment, per React's "you might not need an effect" guidance).
  if (presenting !== wasPresenting) {
    setWasPresenting(presenting);
    if (presenting) {
      setSlideIndex(0);
      setPickerVisible(true);
      setLaserActive(false);
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
    setLaserActive(false);
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
      // Keep the newly-active slide visible in the picker strip.
      requestAnimationFrame(() => {
        activeSlideRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      });
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
      if (event.key.toLowerCase() === "g" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setPickerVisible((visible) => !visible);
        return;
      }
      if (event.key.toLowerCase() === "l" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setLaserActive((active) => !active);
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
      <LaserDot active={laserActive} />
      {pickerVisible ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-[min(92vw,56rem)] justify-center px-4 transition-all duration-300",
            chromeVisible
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-3 opacity-0",
          )}
        >
          <div className="flex w-full flex-col gap-1.5 rounded-xl border border-border/60 bg-background/90 p-2 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 px-1">
              <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span className="text-[11px] font-medium text-muted-foreground">
                Slides — click to jump (G)
              </span>
            </div>
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              role="tablist"
              aria-label="Presentation slides"
            >
              {slides.map((slide, index) => {
                const active = index === slideIndex;
                return (
                  <button
                    key={slide.id}
                    ref={active ? activeSlideRef : undefined}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      "group flex w-28 shrink-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition-all hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary/60 bg-primary/10 ring-1 ring-primary/30"
                        : "border-border/60 bg-card/60",
                    )}
                    onClick={() => goToSlide(index)}
                    aria-label={`Slide ${index + 1}: ${slide.name}`}
                  >
                    <SlideThumbnail
                      slide={slide}
                      files={files}
                      darkMode={resolvedTheme === "dark"}
                    />
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-semibold tabular-nums",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      <span className="truncate">{slide.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

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
            className={cn("h-8 w-8 rounded-full p-0", pickerVisible && "bg-muted text-foreground")}
            onClick={() => setPickerVisible((visible) => !visible)}
            aria-pressed={pickerVisible}
            aria-label="Toggle slide picker (G)"
            title="Slide picker (G)"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </Button>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 rounded-full p-0",
              laserActive &&
                "bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900",
            )}
            onClick={() => setLaserActive((active) => !active)}
            aria-pressed={laserActive}
            aria-label="Toggle laser pointer (L)"
            title="Laser pointer (L) — a glowing dot follows your cursor"
          >
            <Crosshair className="h-4 w-4" aria-hidden />
          </Button>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3"
            onClick={handlePrint}
            aria-label="Print slides or save as PDF"
            title="Print / Save as PDF — one slide per page"
          >
            <Printer className="mr-1 h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">PDF</span>
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
