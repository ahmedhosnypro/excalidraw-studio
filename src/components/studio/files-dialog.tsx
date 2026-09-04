"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Check,
  CheckSquare,
  Clock,
  Copy,
  Database,
  FilePlus2,
  FolderOpen,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileThumbnail } from "@/components/studio/file-thumbnail";
import { SharedBadge } from "@/components/studio/share-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type {
  FileGql,
  FileMutationData,
  FileMutationVariables,
  FilesQueryData,
  MeQueryData,
  StorageUsageQueryData,
} from "@/lib/graphql/operations";
import {
  CREATE_FILE_MUTATION,
  DELETE_FILE_MUTATION,
  DUPLICATE_FILE_MUTATION,
  FILES_QUERY,
  ME_QUERY,
  RENAME_FILE_MUTATION,
  STORAGE_USAGE_QUERY,
} from "@/lib/graphql/operations";
import { formatRelativeDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

/** Human-readable byte size (files dialog storage footer). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SortKey = "updated" | "created" | "name";
type ViewMode = "grid" | "list";

const SORT_OPTIONS: { key: SortKey; label: string; icon: typeof Clock }[] = [
  { key: "updated", label: "Recently updated", icon: Clock },
  { key: "created", label: "Newest first", icon: ArrowDownWideNarrow },
  { key: "name", label: "Name A–Z", icon: ArrowDownAZ },
];

/** Shared mutations (rename / duplicate / delete) for one file. */
function useFileActions(file: FileGql, onRenamed: (file: FileGql) => void) {
  const { toast } = useToast();

  const [renameFile] = useMutation<FileMutationData, FileMutationVariables>(RENAME_FILE_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
  const [duplicateFile] = useMutation<FileMutationData, FileMutationVariables>(
    DUPLICATE_FILE_MUTATION,
    { refetchQueries: [{ query: ME_QUERY }, "Files"] },
  );
  const [deleteFile] = useMutation<{ deleteFile: boolean }, FileMutationVariables>(
    DELETE_FILE_MUTATION,
    { refetchQueries: [{ query: ME_QUERY }, "Files"] },
  );

  const commitRename = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === file.name) {
        return;
      }
      try {
        const result = await renameFile({ variables: { id: file.id, name: trimmed } });
        const updated = result.data?.renameFile;
        if (updated) {
          onRenamed(updated);
        }
      } catch (error) {
        toast({
          title: "Rename failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [file.id, file.name, onRenamed, renameFile, toast],
  );

  const handleDuplicate = useCallback(async () => {
    try {
      await duplicateFile({ variables: { id: file.id } });
    } catch (error) {
      toast({
        title: "Duplicate failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [duplicateFile, file.id, toast]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteFile({ variables: { id: file.id } });
      const store = useEditorStore.getState();
      if (store.activeFileId === file.id) {
        store.closeFile();
        store.excalidrawApi?.resetScene();
      }
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [deleteFile, file.id, toast]);

  return { commitRename, handleDuplicate, handleDelete };
}

/** Row-scoped UI state (renaming + delete confirm) shared by both layouts. */
function useFileRowState(file: FileGql) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(file.name);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  return { renaming, setRenaming, name, setName, deleteDialogOpen, setDeleteDialogOpen };
}

function RenameInput({
  value,
  onChange,
  onCommit,
  onCancel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Defer past the dropdown menu's exit animation and focus restoration
  // (Radix steals focus to the unmounting portal right after close) so the
  // rename input reliably ends up focused and selected.
  useEffect(() => {
    const element = inputRef.current;
    if (!element) {
      return;
    }
    const focusTimeout = setTimeout(() => {
      element.focus();
      element.select();
    }, 250);
    return () => clearTimeout(focusTimeout);
  }, []);

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onCommit();
        }
        if (event.key === "Escape") {
          onCancel();
        }
      }}
      className={className}
      maxLength={200}
      aria-label="File name"
    />
  );
}

/** Actions dropdown + delete confirmation dialog for one file. */
function FileActionsMenu({
  file,
  onRenamed,
  onDuplicated,
  onShared,
  onDelete,
}: {
  file: FileGql;
  onRenamed: () => void;
  onDuplicated: () => void;
  onShared: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  // When a selection opens inline UI (the rename input), Radix's default
  // focus restoration to the trigger would immediately blur that input,
  // committing/cancelling the rename before the user types anything.
  const skipFocusRestoreRef = useRef(false);

  const select = useCallback((action: () => void) => {
    skipFocusRestoreRef.current = true;
    setOpen(false);
    action();
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          aria-label={`Actions for ${file.name}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (skipFocusRestoreRef.current) {
            event.preventDefault();
            skipFocusRestoreRef.current = false;
          }
        }}
      >
        <DropdownMenuItem onSelect={() => select(onRenamed)}>
          <Pencil className="mr-2 h-4 w-4" aria-hidden />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => select(onDuplicated)}>
          <Copy className="mr-2 h-4 w-4" aria-hidden />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => select(onShared)}>
          <Link2 className="mr-2 h-4 w-4" aria-hidden />
          {file.shareToken ? "Share settings…" : "Share…"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => select(onDelete)}
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteConfirmDialog({
  file,
  open,
  onOpenChange,
  onConfirm,
}: {
  file: FileGql;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{file.name}”?</DialogTitle>
          <DialogDescription>
            This permanently deletes the drawing and its comments. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Selection checkbox shown in multi-select mode (list + grid variants). */
function SelectToggle({
  selected,
  onToggle,
  className,
}: {
  selected: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-transparent hover:border-primary/60",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={selected}
      aria-label={selected ? "Deselect file" : "Select file"}
    >
      <Check className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

type FileEntryVariant = "row" | "grid";

interface FileEntryProps {
  file: FileGql;
  active: boolean;
  variant: FileEntryVariant;
  selectMode: boolean;
  selected: boolean;
  onOpen: (file: FileGql) => void;
  onRenamed: (file: FileGql) => void;
  onToggleSelect: (id: string) => void;
}

function entryClassName(variant: FileEntryVariant, active: boolean): string {
  if (variant === "grid") {
    return cn(
      "group relative flex flex-col gap-2 rounded-xl border p-2.5 transition-all hover:shadow-md hover:shadow-black/5",
      active
        ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
        : "border-border/80 bg-card hover:border-border hover:bg-muted/40",
    );
  }
  return cn(
    "group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
    active
      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
      : "border-transparent hover:bg-muted/60",
  );
}

/** Name + shared badge + relative date — the text block of every entry. */
function FileNameBlock({ file }: { file: FileGql }) {
  return (
    <>
      <span className="flex w-full items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
        {file.shareToken ? <SharedBadge /> : null}
      </span>
      <span className="text-xs text-muted-foreground">{formatRelativeDate(file.updatedAt)}</span>
    </>
  );
}

/** One file entry — a compact row (list view) or a preview card (grid view). */
function FileEntry({
  file,
  active,
  variant,
  selectMode,
  selected,
  onOpen,
  onRenamed,
  onToggleSelect,
}: FileEntryProps) {
  const { renaming, setRenaming, name, setName, deleteDialogOpen, setDeleteDialogOpen } =
    useFileRowState(file);
  const { commitRename, handleDuplicate, handleDelete } = useFileActions(file, onRenamed);
  const openShareDialog = useEditorStore((state) => state.openShareDialog);

  const handleEntryClick = useCallback(() => {
    if (selectMode) {
      onToggleSelect(file.id);
      return;
    }
    onOpen(file);
  }, [file, onOpen, onToggleSelect, selectMode]);

  return (
    <div
      className={cn(
        entryClassName(variant, active),
        selectMode && "cursor-pointer",
        selectMode && selected && "border-primary/60 bg-primary/10 ring-1 ring-primary/25",
      )}
    >
      {renaming ? (
        <RenameInput
          value={name}
          onChange={setName}
          onCommit={() => {
            setRenaming(false);
            void commitRename(name);
          }}
          onCancel={() => {
            setName(file.name);
            setRenaming(false);
          }}
          className="h-7"
        />
      ) : variant === "grid" ? (
        <>
          {selectMode ? (
            <SelectToggle
              selected={selected}
              onToggle={() => onToggleSelect(file.id)}
              className="absolute left-1.5 top-1.5 z-10 shadow-sm"
            />
          ) : null}
          <button type="button" className="block w-full" onClick={handleEntryClick}>
            <FileThumbnail fileId={file.id} name={file.name} variant="grid" />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-col items-start gap-0.5 text-left"
            onClick={handleEntryClick}
          >
            <FileNameBlock file={file} />
          </button>
        </>
      ) : (
        <>
          {selectMode ? (
            <SelectToggle selected={selected} onToggle={() => onToggleSelect(file.id)} />
          ) : null}
          <FileThumbnail fileId={file.id} name={file.name} />
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
            onClick={handleEntryClick}
          >
            <FileNameBlock file={file} />
          </button>
        </>
      )}
      <div className={variant === "grid" ? "absolute right-1.5 top-1.5" : undefined}>
        <FileActionsMenu
          file={file}
          onRenamed={() => setRenaming(true)}
          onDuplicated={() => void handleDuplicate()}
          onShared={() => openShareDialog(file.id)}
          onDelete={() => setDeleteDialogOpen(true)}
        />
      </div>
      <DeleteConfirmDialog
        file={file}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

/** Confirmation dialog for the multi-select batch delete. */
function BatchDeleteDialog({
  count,
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Delete {count} {count === 1 ? "drawing" : "drawings"}?
          </DialogTitle>
          <DialogDescription>
            This permanently deletes the selected drawings and their comments. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FilesDialog({ onOpenFile }: { onOpenFile: (file: FileGql) => void }) {
  const dialog = useEditorStore((state) => state.dialog);
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const openAuthDialog = useEditorStore((state) => state.openAuthDialog);
  const activeFileId = useEditorStore((state) => state.activeFileId);
  const renameActiveFile = useEditorStore((state) => state.renameActiveFile);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const isSelecting = selectMode || selectedIds.size > 0;
  const dialogOpen = dialog === "files";

  // Reset the selection surface whenever the dialog closes (render-time
  // adjustment — setState-in-effect would cascade renders).
  const [wasDialogOpen, setWasDialogOpen] = useState(false);
  if (wasDialogOpen !== dialogOpen) {
    setWasDialogOpen(dialogOpen);
    if (!dialogOpen) {
      setSelectMode(false);
      setSelectedIds(new Set());
      setBatchDialogOpen(false);
    }
  }

  const { data: meData } = useQuery<MeQueryData>(ME_QUERY);
  const isAuthenticated = Boolean(meData?.me);
  const { data: filesData, loading } = useQuery<FilesQueryData>(FILES_QUERY, {
    skip: !isAuthenticated,
  });
  const { data: usageData } = useQuery<StorageUsageQueryData>(STORAGE_USAGE_QUERY, {
    skip: !isAuthenticated || !dialogOpen,
  });

  const [createFile] = useMutation<FileMutationData, FileMutationVariables>(CREATE_FILE_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files", "StorageUsage"],
  });
  const [deleteFile] = useMutation<{ deleteFile: boolean }, FileMutationVariables>(
    DELETE_FILE_MUTATION,
    { refetchQueries: [{ query: ME_QUERY }, "Files", "StorageUsage"] },
  );
  const { toast } = useToast();

  const files = useMemo(() => {
    const list = [...(filesData?.files ?? [])];
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? list.filter((file) => file.name.toLowerCase().includes(needle))
      : list;
    const time = (value?: string) => (value ? Date.parse(value) || 0 : 0);
    switch (sort) {
      case "name":
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
      case "created":
        return filtered.sort((a, b) => time(b.createdAt) - time(a.createdAt));
      default:
        return filtered.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    }
  }, [filesData?.files, search, sort]);

  const handleCreate = useCallback(async () => {
    try {
      const result = await createFile({ variables: { name: "Untitled" } });
      const file = result.data?.createFile;
      if (file) {
        onOpenFile(file);
        closeDialog();
      }
    } catch (error) {
      toast({
        title: "Could not create file",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [closeDialog, createFile, onOpenFile, toast]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBatchDelete = useCallback(async () => {
    setBatchBusy(true);
    const ids = [...selectedIds];
    let failures = 0;
    // Sequential deletes keep SQLite write contention (and storage races)
    // out of the picture; the list is small.
    for (const id of ids) {
      try {
        await deleteFile({ variables: { id } });
      } catch {
        failures += 1;
      }
    }
    const store = useEditorStore.getState();
    if (ids.includes(store.activeFileId ?? "")) {
      store.closeFile();
      store.excalidrawApi?.resetScene();
    }
    setBatchBusy(false);
    setBatchDialogOpen(false);
    setSelectedIds(new Set());
    setSelectMode(false);
    toast({
      title:
        failures === 0
          ? `Deleted ${ids.length} ${ids.length === 1 ? "drawing" : "drawings"}`
          : `Deleted ${ids.length - failures}, ${failures} failed`,
      description:
        failures === 0
          ? "Storage freed and lists refreshed."
          : "Some files could not be deleted — try again.",
      variant: failures === 0 ? "default" : "destructive",
    });
  }, [deleteFile, selectedIds, toast]);

  const activeSort = SORT_OPTIONS.find((option) => option.key === sort) ?? SORT_OPTIONS[0];

  const handleOpen = useCallback(
    (file: FileGql) => {
      onOpenFile(file);
      closeDialog();
    },
    [closeDialog, onOpenFile],
  );

  const handleRenamed = useCallback(
    (file: FileGql) => {
      if (file.id === activeFileId) {
        renameActiveFile(file.name);
      }
    },
    [activeFileId, renameActiveFile],
  );

  return (
    <>
      <Dialog open={dialog === "files"} onOpenChange={(open) => (open ? null : closeDialog())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>My files</DialogTitle>
            <DialogDescription>
              {isAuthenticated
                ? "Your cloud-saved drawings. Open one to continue where you left off."
                : "Sign in to access your cloud-saved drawings."}
            </DialogDescription>
          </DialogHeader>

          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search files…"
                    className="pl-8"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2.5">
                      <activeSort.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="hidden sm:inline">{activeSort.label}</span>
                      <span className="sm:hidden">Sort</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {SORT_OPTIONS.map((option) => (
                      <DropdownMenuItem key={option.key} onSelect={() => setSort(option.key)}>
                        <option.icon className="mr-2 h-4 w-4" aria-hidden />
                        {option.label}
                        {sort === option.key ? (
                          <Check className="ml-auto h-3.5 w-3.5 text-primary" aria-hidden />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <fieldset
                  className="flex items-center rounded-md border border-border p-0.5"
                  aria-label="View mode"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 w-7 p-0", view === "grid" && "bg-muted text-foreground")}
                    onClick={() => setView("grid")}
                    aria-pressed={view === "grid"}
                    aria-label="Grid view"
                    title="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 w-7 p-0", view === "list" && "bg-muted text-foreground")}
                    onClick={() => setView("list")}
                    aria-pressed={view === "list"}
                    aria-label="List view"
                    title="List view"
                  >
                    <List className="h-4 w-4" aria-hidden />
                  </Button>
                </fieldset>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 gap-1.5 px-2.5",
                    isSelecting && "border-primary/50 text-primary",
                  )}
                  onClick={() => {
                    setSelectMode((value) => !value);
                    if (selectMode) {
                      setSelectedIds(new Set());
                    }
                  }}
                  aria-pressed={selectMode}
                  aria-label="Select files for batch actions"
                  title="Select files for batch actions"
                >
                  {selectMode ? (
                    <CheckSquare className="h-4 w-4" aria-hidden />
                  ) : (
                    <Square className="h-4 w-4" aria-hidden />
                  )}
                  <span className="hidden sm:inline">{selectMode ? "Done" : "Select"}</span>
                </Button>
                <Button onClick={() => void handleCreate()}>
                  <FilePlus2 className="mr-2 h-4 w-4" aria-hidden />
                  New
                </Button>
              </div>

              {isSelecting ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5">
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size} of {files.length} selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2 text-[11px]"
                    onClick={() => setSelectedIds(new Set(files.map((file) => file.id)))}
                    disabled={files.length === 0}
                  >
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setSelectedIds(new Set())}
                    disabled={selectedIds.size === 0}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-[11px]"
                    onClick={() => setBatchDialogOpen(true)}
                    disabled={selectedIds.size === 0}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Delete {selectedIds.size > 0 ? selectedIds.size : ""}
                  </Button>
                </div>
              ) : null}

              <ScrollArea className="max-h-[22rem] -mx-1 px-1">
                {loading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Loading files…</p>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <FolderOpen className="h-6 w-6 text-muted-foreground" aria-hidden />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {search.trim() ? "No matches" : "No drawings yet"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {search.trim()
                          ? "Try a different search term."
                          : "Create your first file — everything you draw autosaves to your account."}
                      </p>
                    </div>
                    {search.trim() ? null : (
                      <Button size="sm" onClick={() => void handleCreate()} className="gap-1.5">
                        <FilePlus2 className="h-4 w-4" aria-hidden />
                        New drawing
                      </Button>
                    )}
                  </div>
                ) : view === "grid" ? (
                  <div className="grid grid-cols-2 gap-2 pr-2 sm:grid-cols-3">
                    {files.map((file) => (
                      <FileEntry
                        key={file.id}
                        file={file}
                        active={file.id === activeFileId}
                        variant="grid"
                        selectMode={isSelecting}
                        selected={selectedIds.has(file.id)}
                        onOpen={handleOpen}
                        onRenamed={handleRenamed}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 pr-2">
                    {files.map((file) => (
                      <FileEntry
                        key={file.id}
                        file={file}
                        active={file.id === activeFileId}
                        variant="row"
                        selectMode={isSelecting}
                        selected={selectedIds.has(file.id)}
                        onOpen={handleOpen}
                        onRenamed={handleRenamed}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>

              {usageData ? (
                <div className="flex items-center gap-2 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                  <Database className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    {usageData.storageUsage.fileCount}
                    {usageData.storageUsage.fileCount === 1 ? " drawing" : " drawings"} ·{" "}
                    {formatBytes(usageData.storageUsage.bytes)} stored in your workspace
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6">
              <p className="text-center text-sm text-muted-foreground">
                Files are saved to your account so you can access them from any device.
              </p>
              <Button
                onClick={() =>
                  openAuthDialog(
                    "Sign in to save your drawings to the cloud and switch between files.",
                  )
                }
              >
                Sign in to continue
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <BatchDeleteDialog
        count={selectedIds.size}
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        onConfirm={() => void handleBatchDelete()}
        busy={batchBusy}
      />
    </>
  );
}
