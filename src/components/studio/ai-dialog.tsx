"use client";

import { useMutation } from "@apollo/client/react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { generateNKeysBetween } from "fractional-indexing";
import { Loader2, Send, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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
} from "@/lib/graphql/operations";
import { GENERATE_DIAGRAM_MUTATION } from "@/lib/graphql/operations";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

const EXAMPLE_PROMPTS = [
  "A user login flow: enter credentials, validate, show dashboard or retry",
  "CI/CD pipeline: commit, build, test, deploy to staging, then production",
  "Kanban workflow: backlog, todo, in progress, review, done",
  "Client-server architecture: browser, CDN, API, database, cache",
] as const;

const MAX_PROMPT_CHARS = 2000;

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
  // Elements arrive in index order; the last one holds the maximum key.
  const lastIndex = existing.length > 0 ? existing[existing.length - 1]?.index : null;
  const keys = generateNKeysBetween(
    typeof lastIndex === "string" && lastIndex.length > 0 ? lastIndex : null,
    null,
    generated.length,
  );

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

  const finalElements = generated.map((element, i) => ({
    ...element,
    x: Number(element.x ?? 0) + dx,
    y: Number(element.y ?? 0) + dy,
    index: keys[i],
  })) as ExcalidrawElement[];

  api.updateScene({ elements: [...existing, ...finalElements] });
  // Bring the new block into view without zoom changes.
  requestAnimationFrame(() => {
    api.scrollToContent(finalElements, { fitToViewport: false });
  });
  return finalElements.length;
}

/**
 * AI text-to-diagram dialog: describe a diagram, let the server-side LLM
 * generate Excalidraw elements, and insert them into the open canvas.
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset local state at the moment the dialog opens (render-time adjustment —
  // setState directly in an effect body would cascade renders).
  if (open && !wasOpen) {
    setWasOpen(true);
    setPrompt("");
    setError(null);
    setSucceeded(false);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const [generateDiagram, mutation] = useMutation<
    GenerateDiagramMutationData,
    GenerateDiagramMutationVariables
  >(GENERATE_DIAGRAM_MUTATION);

  // Focus the textarea once the dialog animation settles.
  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = setTimeout(() => textareaRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [open]);

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 8) {
      setError("Describe the diagram you want in a few more words.");
      return;
    }
    setError(null);
    try {
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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Generation failed — please try again shortly.",
      );
    }
  }, [closeDialog, generateDiagram, prompt, toast]);

  const busy = mutation.loading;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 text-white shadow-md shadow-violet-500/20"
              aria-hidden
            >
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>Generate a diagram with AI</DialogTitle>
              <DialogDescription>
                Describe what you need — the drawing appears on your canvas, ready to edit.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
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
              placeholder="e.g. A checkout flow: browse products, add to cart, pay, get confirmation…"
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
            {EXAMPLE_PROMPTS.map((example) => (
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
                ? "Inserted — ask again for another diagram."
                : "Shapes, arrows and labels — editable like any drawing."}
            </p>
            <Button
              onClick={() => void handleGenerate()}
              disabled={busy || prompt.trim().length < 8}
              className="gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm transition-all hover:from-violet-700 hover:to-fuchsia-700 hover:shadow-md disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Generating…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden />
                  Generate diagram
                </>
              )}
            </Button>
          </div>

          {busy ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              <div className="h-2 w-full animate-pulse rounded-full bg-gradient-to-r from-violet-200 via-fuchsia-200 to-violet-200 dark:from-violet-950 dark:via-fuchsia-900 dark:to-violet-950" />
              <p className={cn("text-center text-[11px] text-muted-foreground")}>
                Sketching shapes and arrows — this usually takes 5–15 seconds.
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
