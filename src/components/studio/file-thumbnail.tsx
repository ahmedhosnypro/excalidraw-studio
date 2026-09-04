"use client";

import { useQuery } from "@apollo/client/react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { PenTool } from "lucide-react";

import { SceneSvgPreview } from "@/components/studio/scene-svg-preview";
import type { SceneQueryData, SceneQueryVariables } from "@/lib/graphql/operations";
import { SCENE_QUERY } from "@/lib/graphql/operations";

/** Stable identity for "no elements yet" (keeps preview effects calm). */
const EMPTY_ELEMENTS: readonly ExcalidrawElement[] = [];

/**
 * Small live SVG preview of a drawing, rendered from its stored scene via
 * Excalidraw's own `exportToSvg`. Falls back to a dashed placeholder for
 * empty scenes or while loading. `variant="grid"` renders a wide preview for
 * grid cards; the default `row` variant is a compact square chip.
 */
export function FileThumbnail({
  fileId,
  name,
  variant = "row",
}: {
  fileId: string;
  name: string;
  variant?: "row" | "grid";
}) {
  // network-only: the preview must reflect the latest autosaved scene (the
  // Apollo cache can hold a stale pre-edit/pre-theme-toggle snapshot).
  const { data, loading } = useQuery<SceneQueryData, SceneQueryVariables>(SCENE_QUERY, {
    variables: { fileId },
    fetchPolicy: "network-only",
  });

  const scene = data?.scene;
  const elements = (scene?.elements as readonly ExcalidrawElement[] | undefined) ?? EMPTY_ELEMENTS;

  return (
    <div
      className={
        variant === "grid"
          ? "relative flex aspect-[16/10] w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30"
          : "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30 sm:h-12 sm:w-12"
      }
      aria-hidden
    >
      {loading ? (
        <div className="h-full w-full animate-pulse bg-muted/60" />
      ) : (
        <SceneSvgPreview
          elements={elements}
          files={scene?.files}
          fallbackIcon={<PenTool className="h-4 w-4 text-muted-foreground/60" />}
        />
      )}
      <span className="sr-only">Preview of {name}</span>
    </div>
  );
}
