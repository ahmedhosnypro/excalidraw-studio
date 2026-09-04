"use client";

import { exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { PenTool } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { mountSvgPreview } from "@/lib/svg-preview";
import { cn } from "@/lib/utils";

/**
 * Live SVG preview of an Excalidraw scene, rendered with Excalidraw's own
 * `exportToSvg` (transparent background — the host surface provides the
 * backdrop so stroke colors stay visible in both themes). Shared by the
 * files dialog thumbnails, template gallery cards, and version-history
 * previews. Falls back to a small icon for empty scenes.
 */
export function SceneSvgPreview({
  elements,
  files,
  padding = 12,
  className,
  fallbackIcon,
}: {
  elements: readonly ExcalidrawElement[];
  files?: Record<string, unknown>;
  padding?: number;
  className?: string;
  /** Icon shown when there is nothing to render. */
  fallbackIcon?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || elements.length === 0) {
      return;
    }
    let cancelled = false;
    void exportToSvg({
      elements: elements as never,
      appState: {
        // Transparent background — the host's muted bg provides the surface.
        exportBackground: false,
        exportWithDarkMode: resolvedTheme === "dark",
      },
      files: (files ?? {}) as unknown as BinaryFiles,
      exportPadding: padding,
    })
      .then((svg) => {
        if (!cancelled) {
          mountSvgPreview(svg, host);
        }
      })
      .catch(() => {
        // Keep the placeholder on render failures (e.g. corrupt scene).
      });
    return () => {
      cancelled = true;
    };
  }, [elements, files, resolvedTheme, padding]);

  if (elements.length === 0) {
    return (
      <div className={cn("flex items-center justify-center", className)} aria-hidden>
        {fallbackIcon ?? <PenTool className="h-4 w-4 text-muted-foreground/60" />}
      </div>
    );
  }

  return <div ref={hostRef} className={cn("h-full w-full", className)} />;
}
