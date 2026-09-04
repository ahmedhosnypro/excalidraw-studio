"use client";

import { useMutation } from "@apollo/client/react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { generateNKeysBetween } from "fractional-indexing";
import { Loader2, Send, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type {
  GenerateDiagramMutationData,
  GenerateDiagramMutationVariables,
  ImproveDiagramMutationData,
  ImproveDiagramMutationVariables,
} from "@/lib/graphql/operations";
import { GENERATE_DIAGRAM_MUTATION, IMPROVE_DIAGRAM_MUTATION } from "@/lib/graphql/operations";
import { useEditorStore } from "@/store/editor-store";

type AiMode = "create" | "improve";

const EXAMPLE_PROMPTS = [
  "A user login flow: enter credentials, validate, show dashboard or retry",
  "CI/CD pipeline: commit, build, test, deploy to staging, then production",
  "Kanban workflow: backlog, todo, in progress, review, done",
  "Client-server architecture: browser, CDN, API, database, cache",
] as const;

const IMPROVE_EXAMPLE_PROMPTS = [
  "Make the flow vertical, top to bottom",
  "Add a decision branch for each step that can fail",
  "Add short labels on the arrows",
  "Tighten the layout — less empty space",
] as const;

const MAX_PROMPT_CHARS = 2000;

/** Compact element sent to the server when improving a selection. */
interface CompactSelectionElement {
  type: string;
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: string | null;
  text?: string | null;
  start?: string | null;
  end?: string | null;
  [key: string]: unknown;
}

/** Excalidraw text elements carry an optional containerId (bound labels). */
interface TextWithContainer {
  containerId?: string | null;
}

/** The bound label text of a container/arrow, if any. */
function boundLabelOf(
  elements: readonly ExcalidrawElement[],
  containerId: string | null | undefined,
): string | null {
  if (!containerId) {
    return null;
  }
  for (const element of elements) {
    if (
      element.type === "text" &&
      (element as unknown as { containerId?: string | null }).containerId === containerId &&
      !element.isDeleted
    ) {
      return typeof element.text === "string" ? element.text : null;
    }
  }
  return null;
}

/** Reads the current canvas selection into the compact improve payload. */
function snapshotSelection(): { elements: CompactSelectionElement[]; ids: Set<string> } {
  const api = useEditorStore.getState().excalidrawApi;
  if (!api) {
    return { elements: [], ids: new Set() };
  }
  const scene = api.getSceneElements();
  const selectedIds = api.getAppState().selectedElementIds ?? {};
  const ids = new Set(
    Object.entries(selectedIds)
      .filter(([, selected]) => selected)
      .map(([id]) => id),
  );
  const compact: CompactSelectionElement[] = [];
  for (const element of scene) {
    if (element.isDeleted || !ids.has(element.id)) {
      continue;
    }
    if (element.type === "rectangle" || element.type === "ellipse" || element.type === "diamond") {
      compact.push({
        type: element.type,
        id: element.id,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        label: boundLabelOf(scene, element.id),
      });
    } else if (element.type === "arrow") {
      const binding = element as unknown as {
        startBinding?: { elementId?: string } | null;
        endBinding?: { elementId?: string } | null;
      };
      compact.push({
        type: "arrow",
        id: element.id,
        label: boundLabelOf(scene, element.id),
        start: binding.startBinding?.elementId ?? null,
        end: binding.endBinding?.elementId ?? null,
      });
    } else if (element.type === "text" && !(element as TextWithContainer).containerId) {
      compact.push({
        type: "text",
        id: element.id,
        x: element.x,
        y: element.y,
        text: typeof element.text === "string" ? element.text : null,
      });
    }
  }
  return { elements: compact, ids };
}

/** Builds final elements with a uniform offset + fresh fractional indices. */
function buildFinalElements(
  generated: Record<string, unknown>[],
  kept: readonly ExcalidrawElement[],
  dx: number,
  dy: number,
): ExcalidrawElement[] {
  const lastIndex = kept.length > 0 ? kept[kept.length - 1]?.index : null;
  const keys = generateNKeysBetween(
    typeof lastIndex === "string" && lastIndex.length > 0 ? lastIndex : null,
    null,
    generated.length,
  );
  return generated.map((element, i) => ({
    ...element,
    x: Number(element.x ?? 0) + dx,
    y: Number(element.y ?? 0) + dy,
    index: keys[i],
  })) as ExcalidrawElement[];
}

/** Scrolls the freshly inserted elements into view (next frame, no zoom). */
function scrollIntoView(
  api: NonNullable<ReturnType<typeof useEditorStore.getState>["excalidrawApi"]>,
  elements: ExcalidrawElement[],
): void {
  requestAnimationFrame(() => {
    api.scrollToContent(elements, { fitToViewport: false });
  });
}

/**
 * Appends generated elements to the live scene: assigns fresh fractional
 * indices after the current maximum, offsets the block to the right of any
 * existing content, then scrolls it into view.
 */
function applyGeneratedElements(generated: Record<string, unknown>[]): number {
  const api = useEditorStore.getState().excalidrawApi;
  if (!api) {
    return 0;
  }
  const existing = api.getSceneElements();

  // Offset right of existing content (no offset on an empty canvas).
  let dx = 0;
  let dy = 0;
  if (existing.length > 0) {
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let genMinX = Number.POSITIVE_INFINITY;
    let genMinY = Number.POSITIVE_INFINITY;
    for (const element of existing) {
      maxX = Math.max(maxX, element.x + element.width);
      minY = Math.min(minY, element.y);
    }
    for (const element of generated) {
      genMinX = Math.min(genMinX, Number(element.x ?? 0));
      genMinY = Math.min(genMinY, Number(element.y ?? 0));
    }
    if (Number.isFinite(maxX) && Number.isFinite(genMinX)) {
      dx = maxX + 120 - genMinX;
      dy = minY - genMinY + 40;
    }
  }

  const finalElements = buildFinalElements(generated, existing, dx, dy);

  api.updateScene({ elements: [...existing, ...finalElements] });
  // Bring the new block into view without zoom changes.
  scrollIntoView(api, finalElements);
  return finalElements.length;
}

/**
 * Replaces the selected elements (plus their bound labels) with the improved
 * set, aligned to the selection's top-left corner, and selects the result.
 */
function applyImprovedElements(
  generated: Record<string, unknown>[],
  selectedIds: Set<string>,
): number {
  const api = useEditorStore.getState().excalidrawApi;
  if (!api) {
    return 0;
  }
  const existing = api.getSceneElements();

  // Elements leaving the scene: the selection + bound labels of selected
  // containers (labels themselves may or may not be in the selection).
  const removeIds = new Set<string>();
  for (const element of existing) {
    if (selectedIds.has(element.id)) {
      removeIds.add(element.id);
    } else if (
      (element as TextWithContainer).containerId &&
      selectedIds.has((element as TextWithContainer).containerId ?? "")
    ) {
      removeIds.add(element.id);
    }
  }
  const kept = existing.filter((element) => !removeIds.has(element.id));
  const removed = existing.filter((element) => removeIds.has(element.id));

  // Align the improved block with the removed selection's top-left corner.
  let removedMinX = Number.POSITIVE_INFINITY;
  let removedMinY = Number.POSITIVE_INFINITY;
  for (const element of removed) {
    removedMinX = Math.min(removedMinX, element.x);
    removedMinY = Math.min(removedMinY, element.y);
  }
  let genMinX = Number.POSITIVE_INFINITY;
  let genMinY = Number.POSITIVE_INFINITY;
  for (const element of generated) {
    genMinX = Math.min(genMinX, Number(element.x ?? 0));
    genMinY = Math.min(genMinY, Number(element.y ?? 0));
  }
  const dx = Number.isFinite(removedMinX) && Number.isFinite(genMinX) ? removedMinX - genMinX : 0;
  const dy = Number.isFinite(removedMinY) && Number.isFinite(genMinY) ? removedMinY - genMinY : 0;

  const finalElements = buildFinalElements(generated, kept, dx, dy);

  api.updateScene({
    elements: [...kept, ...finalElements],
    appState: {
      selectedElementIds: Object.fromEntries(finalElements.map((element) => [element.id, true])),
    },
  });
  scrollIntoView(api, finalElements);
  return finalElements.length;
}

/**
 * AI text-to-diagram dialog: describe a diagram, let the server-side LLM
 * generate Excalidraw elements, and insert them into the open canvas. With a
 * live selection the dialog also offers an "improve selection" mode which
 * revises the selected elements in place.
 */
export function AiDialog() {
  const dialog = useEditorStore((state) => state.dialog);
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const open = dialog === "ai";
  const { toast } = useToast();

  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const [mode, setMode] = useState<AiMode>("create");
  /** Selection captured at dialog-open time (compact payload + ids). */
  const [selection, setSelection] = useState<{
    elements: CompactSelectionElement[];
    ids: Set<string>;
  }>({ elements: [], ids: new Set() });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset local state at the moment the dialog opens (render-time adjustment —
  // setState directly in an effect body would cascade renders).
  if (open && !wasOpen) {
    setWasOpen(true);
    setPrompt("");
    setError(null);
    setSucceeded(false);
    const snapshot = snapshotSelection();
    setSelection(snapshot);
    setMode(snapshot.elements.length > 0 ? "improve" : "create");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const [generateDiagram, generateMutation] = useMutation<
    GenerateDiagramMutationData,
    GenerateDiagramMutationVariables
  >(GENERATE_DIAGRAM_MUTATION);

  const [improveDiagram, improveMutation] = useMutation<
    ImproveDiagramMutationData,
    ImproveDiagramMutationVariables
  >(IMPROVE_DIAGRAM_MUTATION);

  // Focus the textarea once the dialog animation settles.
  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = setTimeout(() => textareaRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [open]);

  const busy = mode === "improve" ? improveMutation.loading : generateMutation.loading;

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 8) {
      setError(
        mode === "improve"
          ? "Describe the change you want in a few more words."
          : "Describe the diagram you want in a few more words.",
      );
      return;
    }
    setError(null);
    try {
      if (mode === "improve") {
        const result = await improveDiagram({
          variables: { prompt: trimmed, elements: selection.elements },
        });
        const improved = result.data?.improveDiagram?.elements ?? [];
        if (improved.length === 0) {
          setError("The AI returned no elements — try a more specific instruction.");
          return;
        }
        const applied = applyImprovedElements(improved, selection.ids);
        if (applied === 0) {
          setError("The canvas is not ready yet — try again.");
          return;
        }
        setSucceeded(true);
        toast({
          title: "Selection improved",
          description: `${applied} elements replaced on your canvas — autosaving.`,
        });
        closeDialog();
      } else {
        const result = await generateDiagram({ variables: { prompt: trimmed } });
        const generated = result.data?.generateDiagram?.elements ?? [];
        if (generated.length === 0) {
          setError("The AI returned no elements — try a more specific prompt.");
          return;
        }
        const applied = applyGeneratedElements(generated);
        if (applied === 0) {
          setError("The canvas is not ready yet — try again.");
          return;
        }
        setSucceeded(true);
        toast({
          title: "Diagram generated",
          description: `${applied} elements added to your canvas — autosaving.`,
        });
        closeDialog();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Generation failed — please try again shortly.",
      );
    }
  }, [closeDialog, generateDiagram, improveDiagram, mode, prompt, selection, toast]);

  const hasSelection = selection.elements.length > 0;
  const examples = mode === "improve" ? IMPROVE_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              className={
                mode === "improve"
                  ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-md shadow-emerald-500/20"
                  : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 text-white shadow-md shadow-violet-500/20"
              }
              aria-hidden
            >
              {mode === "improve" ? (
                <Wand2 className="h-5 w-5" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
            </span>
            <div>
              <DialogTitle>
                {mode === "improve" ? "Improve selection with AI" : "Generate a diagram with AI"}
              </DialogTitle>
              <DialogDescription>
                {mode === "improve"
                  ? `Tell the AI how to change the ${selection.elements.length} selected element${
                      selection.elements.length === 1 ? "" : "s"
                    } — they'll be replaced in place.`
                  : "Describe what you need — the drawing appears on your canvas, ready to edit."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {hasSelection ? (
            <div
              role="tablist"
              aria-label="AI mode"
              className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1"
            >
              {(
                [
                  {
                    key: "create",
                    label: "Create new",
                    icon: <Sparkles className="h-3.5 w-3.5" aria-hidden />,
                  },
                  {
                    key: "improve",
                    label: `Improve selection (${selection.elements.length})`,
                    icon: <Wand2 className="h-3.5 w-3.5" aria-hidden />,
                  },
                ] as { key: AiMode; label: string; icon: ReactNode }[]
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={mode === option.key}
                  disabled={busy}
                  onClick={() => setMode(option.key)}
                  className={
                    mode === option.key
                      ? "flex items-center justify-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
                      : "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  }
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, MAX_PROMPT_CHARS))}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !busy) {
                  event.preventDefault();
                  void handleGenerate();
                }
              }}
              placeholder={
                mode === "improve"
                  ? "e.g. Add a retry branch after the validation step…"
                  : "e.g. A checkout flow: browse products, add to cart, pay, get confirmation…"
              }
              aria-label="Diagram description"
              disabled={busy}
              className="min-h-28 resize-none pr-16 text-sm leading-relaxed"
            />
            <span
              className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] tabular-nums text-muted-foreground/70"
              aria-hidden
            >
              {prompt.length}/{MAX_PROMPT_CHARS}
            </span>
          </div>

          <section className="flex flex-wrap gap-1.5" aria-label="Example prompts">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                disabled={busy}
                onClick={() => setPrompt(example)}
                className="max-w-full truncate rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:hover:border-violet-800 dark:hover:bg-violet-950/60 dark:hover:text-violet-300"
              >
                {example.split(":")[0]?.trim()}
              </button>
            ))}
          </section>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="leading-relaxed">{error}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="hidden text-[11px] leading-relaxed text-muted-foreground sm:block">
              {succeeded
                ? mode === "improve"
                  ? "Replaced — undo (Ctrl+Z) restores the original."
                  : "Inserted — ask again for another diagram."
                : mode === "improve"
                  ? "The selected elements are replaced with the AI's revision."
                  : "Shapes, arrows and labels — editable like any drawing."}
            </p>
            <Button
              onClick={() => void handleGenerate()}
              disabled={busy || prompt.trim().length < 8}
              className={
                mode === "improve"
                  ? "gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm transition-all hover:from-emerald-700 hover:to-teal-700 hover:shadow-md disabled:opacity-60"
                  : "gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm transition-all hover:from-violet-700 hover:to-fuchsia-700 hover:shadow-md disabled:opacity-60"
              }
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {mode === "improve" ? "Improving…" : "Generating…"}
                </>
              ) : (
                <>
                  {mode === "improve" ? (
                    <Wand2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                  {mode === "improve" ? "Improve selection" : "Generate diagram"}
                </>
              )}
            </Button>
          </div>

          {busy ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              <div
                className={
                  mode === "improve"
                    ? "h-2 w-full animate-pulse rounded-full bg-gradient-to-r from-emerald-200 via-teal-200 to-emerald-200 dark:from-emerald-950 dark:via-teal-900 dark:to-emerald-950"
                    : "h-2 w-full animate-pulse rounded-full bg-gradient-to-r from-violet-200 via-fuchsia-200 to-violet-200 dark:from-violet-950 dark:via-fuchsia-900 dark:to-violet-950"
                }
              />
              <p className="text-center text-[11px] text-muted-foreground">
                {mode === "improve"
                  ? "Reworking the selected elements — this usually takes 5–15 seconds."
                  : "Sketching shapes and arrows — this usually takes 5–15 seconds."}
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
