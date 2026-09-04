"use client";

import { exportToSvg } from "@excalidraw/excalidraw";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { Frame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mountSvgPreview } from "@/lib/svg-preview";
import type { PresentationSlide } from "@/store/editor-store";

/**
 * SVG preview of one slide, clipped to its frame. Shared by the Present tab
 * slide list and the in-presentation slide picker strip.
 */
export function SlideThumbnail({
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
