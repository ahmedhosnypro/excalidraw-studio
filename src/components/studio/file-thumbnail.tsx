"use client";

import { useQuery } from "@apollo/client/react";
import { exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { PenTool } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import type { SceneQueryData, SceneQueryVariables } from "@/lib/graphql/operations";
import { SCENE_QUERY } from "@/lib/graphql/operations";

/**
 * Small live SVG preview of a drawing, rendered from its stored scene via
 * Excalidraw's own `exportToSvg`. Falls back to a dashed placeholder for
 * empty scenes or while loading.
 */
export function FileThumbnail({ fileId, name }: { fileId: string; name: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  // network-only: the preview must reflect the latest autosaved scene (the
  // Apollo cache can hold a stale pre-edit/pre-theme-toggle snapshot).
  const { data, loading } = useQuery<SceneQueryData, SceneQueryVariables>(SCENE_QUERY, {
    variables: { fileId },
    fetchPolicy: "network-only",
  });

  const scene = data?.scene;
  const elements = (scene?.elements ?? []) as readonly ExcalidrawElement[];

  useEffect(() => {
    const host = hostRef.current;
    if (!host || loading || elements.length === 0) {
      return;
    }
    let cancelled = false;
    void exportToSvg({
      elements: elements as never,
      appState: {
        // Transparent background — the chip's muted bg provides the surface,
        // so stroke colors stay visible in both light and dark themes.
        exportBackground: false,
        exportWithDarkMode: resolvedTheme === "dark",
      },
      files: (scene?.files ?? {}) as unknown as BinaryFiles,
      exportPadding: 12,
    })
      .then((svg) => {
        if (cancelled) {
          return;
        }
        // Fit the generated bounding-box-sized SVG into the thumbnail box.
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.setAttribute("style", "display:block");
        host.replaceChildren(svg);
      })
      .catch(() => {
        // Keep the placeholder on render failures (e.g. corrupt scene).
      });
    return () => {
      cancelled = true;
    };
  }, [elements, scene?.files, resolvedTheme, loading]);

  const isEmpty = !loading && elements.length === 0;

  return (
    <div
      className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30 sm:h-12 sm:w-12"
      aria-hidden
    >
      {loading ? (
        <div className="h-full w-full animate-pulse bg-muted/60" />
      ) : isEmpty ? (
        <PenTool className="h-4 w-4 text-muted-foreground/60" aria-hidden />
      ) : (
        <div ref={hostRef} className="h-full w-full" />
      )}
      <span className="sr-only">Preview of {name}</span>
    </div>
  );
}
