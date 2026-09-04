"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { History, Loader2, Save, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { SceneSvgPreview } from "@/components/studio/scene-svg-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDialogFileTarget } from "@/hooks/use-dialog-file";
import { useToast } from "@/hooks/use-toast";
import type {
  SceneSnapshotQueryData,
  SceneSnapshotQueryVariables,
  SceneSnapshotsQueryData,
  SceneSnapshotsQueryVariables,
  SnapshotMutationData,
  SnapshotMutationVariables,
} from "@/lib/graphql/operations";
import {
  CREATE_SCENE_SNAPSHOT_MUTATION,
  DELETE_SCENE_SNAPSHOT_MUTATION,
  RESTORE_SCENE_SNAPSHOT_MUTATION,
  SCENE_SNAPSHOT_QUERY,
  SCENE_SNAPSHOTS_QUERY,
} from "@/lib/graphql/operations";
import { applySavedViewport, applySceneToCanvas } from "@/lib/scene-canvas";
import { formatRelativeDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

/** Refetches everything a snapshot mutation can change. */
const REFETCH = ["Files", "StorageUsage", "SceneSnapshots"];

/** Applies a restored snapshot's contents to the live canvas. */
async function applySnapshotToCanvas(
  elements: unknown[],
  appState: Record<string, unknown> | undefined,
  files: Record<string, unknown> | undefined,
): Promise<void> {
  await applySceneToCanvas(elements, appState, files);
  const api = useEditorStore.getState().excalidrawApi;
  if (api) {
    applySavedViewport(api, elements.length, appState);
  }
  // The server already stores this exact content — make the next onChange
  // the new change-detection baseline so no redundant save fires.
  useEditorStore.getState().resetSaveBaseline?.();
}

/** One row in the version timeline. */
function SnapshotRow({
  label,
  createdAt,
  elementCount,
  selected,
  onSelect,
}: {
  label: string | null;
  createdAt: string;
  elementCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-violet-400/70 bg-violet-500/[0.07] shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] dark:border-violet-500/50 dark:bg-violet-500/10"
          : "border-transparent bg-muted/40 hover:border-border hover:bg-muted/70",
      )}
    >
      {/* Timeline dot — inline (never clipped by the list's scroll box). */}
      <span
        className={cn(
          "mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-background transition-colors",
          selected ? "bg-violet-500" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {label ? (
            <span className="truncate rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
              {label}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Autosaved
            </span>
          )}
        </span>
        <span className="mt-1 block text-xs font-medium">{formatRelativeDate(createdAt)}</span>
        <span className="block text-[11px] text-muted-foreground">
          {elementCount} element{elementCount === 1 ? "" : "s"}
        </span>
      </span>
    </button>
  );
}

/**
 * Version history (excalidraw.com paid parity): timeline of restorable
 * snapshots per drawing — automatic checkpoints on save plus labelled
 * manual saves. Restoring safety-snapshots the current state first, so a
 * restore can itself be undone.
 */
export function HistoryDialog() {
  const { isOpen, closeDialog, targetFileId, targetFileName } = useDialogFileTarget(
    "history",
    "this drawing",
  );
  const activeFileId = useEditorStore((state) => state.activeFileId);
  const { toast } = useToast();

  const { data: snapshotsData, loading: snapshotsLoading } = useQuery<
    SceneSnapshotsQueryData,
    SceneSnapshotsQueryVariables
  >(SCENE_SNAPSHOTS_QUERY, {
    variables: { fileId: targetFileId ?? "" },
    skip: !targetFileId,
  });
  const snapshots = useMemo(() => snapshotsData?.sceneSnapshots ?? [], [snapshotsData]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default-select the newest snapshot once the list arrives, keep the
  // selection when it still exists, and clear it when the list empties
  // (render-time adjustment — the derived-reset pattern).
  const selectionExists = snapshots.some((snapshot) => snapshot.id === selectedId);
  if (snapshots.length === 0 ? selectedId !== null : !selectionExists) {
    setSelectedId(snapshots.length === 0 ? null : (snapshots[0]?.id ?? null));
  }

  const { data: contentData, loading: contentLoading } = useQuery<
    SceneSnapshotQueryData,
    SceneSnapshotQueryVariables
  >(SCENE_SNAPSHOT_QUERY, {
    variables: { id: selectedId ?? "" },
    skip: !selectedId,
  });
  const content = contentData?.sceneSnapshot;
  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? null;
  const targetName = targetFileName;

  const [createSnapshot, createMutation] = useMutation<
    SnapshotMutationData,
    SnapshotMutationVariables
  >(CREATE_SCENE_SNAPSHOT_MUTATION, { refetchQueries: REFETCH });
  const [restoreSnapshot, restoreMutation] = useMutation<
    SnapshotMutationData,
    SnapshotMutationVariables
  >(RESTORE_SCENE_SNAPSHOT_MUTATION, { refetchQueries: REFETCH });
  const [deleteSnapshot, deleteMutation] = useMutation<
    SnapshotMutationData,
    SnapshotMutationVariables
  >(DELETE_SCENE_SNAPSHOT_MUTATION, { refetchQueries: REFETCH });

  const [labelDraft, setLabelDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reset transient UI when the dialog (re)opens (render-time adjustment —
  // setState during render is the sanctioned "derived reset" pattern).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setLabelDraft("");
      setConfirming(false);
      setConfirmingDelete(false);
    }
  }

  const handleSaveVersion = async (): Promise<void> => {
    if (!targetFileId) {
      return;
    }
    try {
      const result = await createSnapshot({
        variables: {
          fileId: targetFileId,
          label: labelDraft.trim().length > 0 ? labelDraft.trim() : null,
        },
      });
      const created = result.data?.createSceneSnapshot;
      setLabelDraft("");
      setSelectedId(created?.id ?? null);
      toast({
        title: "Version saved",
        description: created?.label
          ? `“${created.label}” was added to the history.`
          : "A new checkpoint was added to the history.",
      });
    } catch (error) {
      toast({
        title: "Could not save version",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (): Promise<void> => {
    if (!selectedId || !selected) {
      return;
    }
    // Flush any pending edits first so the "Before restore" safety snapshot
    // captures them (nothing the user drew is lost).
    await useEditorStore.getState().flushSave?.();
    try {
      await restoreSnapshot({ variables: { id: selectedId } });
      if (targetFileId === activeFileId && content) {
        await applySnapshotToCanvas(content.elements, content.appState, content.files);
      }
      toast({
        title: "Version restored",
        description: `“${targetName}” now shows the state from ${formatRelativeDate(
          selected.createdAt,
        )}.`,
      });
      closeDialog();
    } catch (error) {
      toast({
        title: "Could not restore version",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!selectedId) {
      return;
    }
    try {
      await deleteSnapshot({ variables: { id: selectedId } });
      toast({ title: "Version deleted", description: "The snapshot was removed." });
      // The selection auto-moves to another row — drop the confirm bar too.
      setConfirmingDelete(false);
    } catch (error) {
      toast({
        title: "Could not delete version",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const busy = createMutation.loading || restoreMutation.loading || deleteMutation.loading;
  const elements = (content?.elements ?? []) as readonly ExcalidrawElement[];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <History className="h-3.5 w-3.5" aria-hidden />
            </span>
            Version history
          </DialogTitle>
          <DialogDescription>
            Restorable snapshots of “{targetName}” — automatic checkpoints plus your saved versions.
          </DialogDescription>
        </DialogHeader>

        {snapshotsLoading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading history…
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <History className="h-6 w-6 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No versions yet</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Studio saves an automatic checkpoint every few minutes while you draw, and you can
              save a named version any time. Both appear here.
            </p>
            <Button
              size="sm"
              className="mt-1.5"
              disabled={!targetFileId || busy}
              onClick={() => void handleSaveVersion()}
            >
              <Save className="mr-2 h-3.5 w-3.5" aria-hidden />
              Save first version
            </Button>
          </div>
        ) : (
          <>
            <div className="flex max-h-[min(60vh,420px)] flex-col gap-4 overflow-hidden px-5 py-4 sm:flex-row">
              {/* Timeline */}
              <nav
                className="min-w-0 shrink-0 border-l-2 border-border/70 pl-3.5 sm:w-56"
                aria-label="Version list"
              >
                <ul className="max-h-48 space-y-1 overflow-y-auto pr-1 sm:max-h-[340px]">
                  {snapshots.map((snapshot) => (
                    <li key={snapshot.id}>
                      <SnapshotRow
                        label={snapshot.label}
                        createdAt={snapshot.createdAt}
                        elementCount={snapshot.elementCount}
                        selected={snapshot.id === selectedId}
                        onSelect={() => {
                          setSelectedId(snapshot.id);
                          setConfirming(false);
                          setConfirmingDelete(false);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Detail pane */}
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                  {contentLoading || !selected ? (
                    <div className="h-full w-full animate-pulse bg-muted/50" />
                  ) : (
                    <SceneSvgPreview elements={elements} files={content?.files} />
                  )}
                </div>

                {selected ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {selected.label ?? "Autosaved version"}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{new Date(selected.createdAt).toLocaleString()}</span>
                    <span aria-hidden>·</span>
                    <span>{selected.elementCount} elements</span>
                  </div>
                ) : null}

                {confirming ? (
                  <div className="flex flex-col gap-2.5 rounded-lg border border-amber-300/70 bg-amber-500/[0.06] p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      Restore this version? The current drawing is safety-snapshotted first, so you
                      can undo this from the history.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" disabled={busy} onClick={() => void handleRestore()}>
                        {restoreMutation.loading ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Undo2 className="mr-2 h-3.5 w-3.5" aria-hidden />
                        )}
                        Restore now
                      </Button>
                    </div>
                  </div>
                ) : confirmingDelete ? (
                  <div className="flex flex-col gap-2.5 rounded-lg border border-destructive/40 bg-destructive/[0.06] p-3">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-destructive">
                      <Trash2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      Delete this snapshot? The drawing itself is not affected, but this version can
                      no longer be restored.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmingDelete(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleDelete()}
                      >
                        {deleteMutation.loading ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden />
                        )}
                        Delete version
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={!selected || busy}
                      onClick={() => setConfirming(true)}
                    >
                      <Undo2 className="mr-2 h-3.5 w-3.5" aria-hidden />
                      Restore this version
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={!selected || busy}
                      aria-label="Delete this snapshot"
                      onClick={() => setConfirmingDelete(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Save-version footer */}
            <div className="border-t border-border/70 bg-muted/30 px-5 py-3">
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveVersion();
                }}
              >
                <Input
                  value={labelDraft}
                  onChange={(event) => setLabelDraft(event.target.value)}
                  placeholder="Label a new version (optional)"
                  className="h-9 flex-1 text-sm"
                  aria-label="Version label"
                  maxLength={80}
                />
                <Button type="submit" size="sm" variant="outline" disabled={!targetFileId || busy}>
                  {createMutation.loading ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Save className="mr-2 h-3.5 w-3.5" aria-hidden />
                  )}
                  Save version
                </Button>
              </form>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Automatic checkpoints appear here every few minutes while you draw.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
