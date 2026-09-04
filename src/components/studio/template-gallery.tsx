"use client";

import { exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { mountSvgPreview } from "@/lib/svg-preview";
import { SCENE_TEMPLATES, type SceneTemplate, templateElements } from "@/lib/templates";

/** Renders one template card with a live SVG preview of its elements. */
function TemplateCard({
  template,
  busy,
  onCreate,
}: {
  template: SceneTemplate;
  busy: boolean;
  onCreate: (template: SceneTemplate) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let cancelled = false;
    const elements = templateElements(template) as ExcalidrawElement[];
    void exportToSvg({
      elements: elements as never,
      appState: { exportBackground: false, exportWithDarkMode: resolvedTheme === "dark" },
      files: {} as unknown as BinaryFiles,
      exportPadding: 18,
    })
      .then((svg) => {
        if (!cancelled) {
          mountSvgPreview(svg, host);
        }
      })
      .catch(() => {
        // Preview stays a muted placeholder on render failure.
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedTheme, template]);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onCreate(template)}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-left shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 dark:hover:border-violet-700"
      aria-label={`Create a new drawing from the ${template.name} template`}
    >
      <div
        className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden border-b border-border/60 bg-muted/30"
        aria-hidden
      >
        <div ref={hostRef} className="h-full w-full" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span aria-hidden>{template.emoji}</span>
          {template.name}
        </span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {template.description}
        </span>
        <span className="mt-auto pt-1.5 text-[10px] font-medium text-violet-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-violet-400">
          Use this template →
        </span>
      </div>
    </button>
  );
}

/**
 * Starter template gallery: live SVG previews of built-in scenes, one click
 * creates a new cloud file pre-filled with the chosen template.
 */
export function TemplateGallery({
  busyTemplateId,
  onCreate,
}: {
  busyTemplateId: string | null;
  onCreate: (template: SceneTemplate) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 pr-2 sm:grid-cols-3">
      {SCENE_TEMPLATES.map((template, i) => (
        <li
          key={template.id}
          className="flex flex-col"
          style={{ animation: `card-rise 0.32s ease-out ${i * 45}ms both` }}
        >
          <TemplateCard
            template={template}
            busy={busyTemplateId === template.id}
            onCreate={onCreate}
          />
        </li>
      ))}
    </ul>
  );
}
