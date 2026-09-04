"use client";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { SceneSvgPreview } from "@/components/studio/scene-svg-preview";
import { Input } from "@/components/ui/input";
import { SCENE_TEMPLATES, type SceneTemplate, templateElements } from "@/lib/templates";
import { cn } from "@/lib/utils";

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
  const elements = useMemo(() => templateElements(template) as ExcalidrawElement[], [template]);

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
        <SceneSvgPreview elements={elements} padding={18} />
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
 * creates a new cloud file pre-filled with the chosen template. Searchable
 * by name, description, and keywords; filterable by category chips.
 */
export function TemplateGallery({
  busyTemplateId,
  onCreate,
}: {
  busyTemplateId: string | null;
  onCreate: (template: SceneTemplate) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(SCENE_TEMPLATES.map((template) => template.category))],
    [],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SCENE_TEMPLATES.filter((template) => {
      if (category && template.category !== category) {
        return false;
      }
      if (needle.length === 0) {
        return true;
      }
      const haystack = [template.name, template.description, ...template.keywords]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, category]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates…"
            className="h-9 pl-8 text-sm"
            aria-label="Search templates"
          />
        </div>
        <fieldset
          className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0"
          aria-label="Filter templates by category"
        >
          <button
            type="button"
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              category === null
                ? "border-violet-400/60 bg-violet-500/10 text-violet-700 dark:border-violet-500/50 dark:text-violet-300"
                : "border-border/70 bg-background text-muted-foreground hover:border-violet-300 hover:text-foreground dark:hover:border-violet-700",
            )}
          >
            All
          </button>
          {categories.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setCategory(category === entry ? null : entry)}
              aria-pressed={category === entry}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                category === entry
                  ? "border-violet-400/60 bg-violet-500/10 text-violet-700 dark:border-violet-500/50 dark:text-violet-300"
                  : "border-border/70 bg-background text-muted-foreground hover:border-violet-300 hover:text-foreground dark:hover:border-violet-700",
              )}
            >
              {entry}
            </button>
          ))}
        </fieldset>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden />
          </span>
          <p className="text-sm font-medium">No templates match your search</p>
          <p className="text-xs text-muted-foreground">
            Try a different term or clear the category filter.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 pr-2 sm:grid-cols-3">
          {filtered.map((template, i) => (
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
      )}
    </div>
  );
}
