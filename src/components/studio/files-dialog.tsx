"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Check,
  Clock,
  Copy,
  FilePlus2,
  FolderOpen,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileThumbnail } from "@/components/studio/file-thumbnail";
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
} from "@/lib/graphql/operations";
import {
  CREATE_FILE_MUTATION,
  DELETE_FILE_MUTATION,
  DUPLICATE_FILE_MUTATION,
  FILES_QUERY,
  ME_QUERY,
  RENAME_FILE_MUTATION,
} from "@/lib/graphql/operations";
import { formatRelativeDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

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
  onDuplicate,
  onDelete,
}: {
  file: FileGql;
  onRenamed: () => void;
  onDuplicate: () => void;
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
        <DropdownMenuItem onSelect={() => select(onDuplicate)}>
          <Copy className="mr-2 h-4 w-4" aria-hidden />
          Duplicate
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

type FileEntryVariant = "row" | "grid";

interface FileEntryProps {
  file: FileGql;
  active: boolean;
  variant: FileEntryVariant;
  onOpen: (file: FileGql) => void;
  onRenamed: (file: FileGql) => void;
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

/** One file entry — a compact row (list view) or a preview card (grid view). */
function FileEntry({ file, active, variant, onOpen, onRenamed }: FileEntryProps) {
  const { renaming, setRenaming, name, setName, deleteDialogOpen, setDeleteDialogOpen } =
    useFileRowState(file);
  const { commitRename, handleDuplicate, handleDelete } = useFileActions(file, onRenamed);

  return (
    <div className={entryClassName(variant, active)}>
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
          <button type="button" className="block w-full" onClick={() => onOpen(file)}>
            <FileThumbnail fileId={file.id} name={file.name} variant="grid" />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-col items-start gap-0.5 text-left"
            onClick={() => onOpen(file)}
          >
            <span className="w-full truncate text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeDate(file.updatedAt)}
            </span>
          </button>
        </>
      ) : (
        <>
          <FileThumbnail fileId={file.id} name={file.name} />
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
            onClick={() => onOpen(file)}
          >
            <span className="truncate text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeDate(file.updatedAt)}
            </span>
          </button>
        </>
      )}
      <div className={variant === "grid" ? "absolute right-1.5 top-1.5" : undefined}>
        <FileActionsMenu
          file={file}
          onRenamed={() => setRenaming(true)}
          onDuplicate={() => void handleDuplicate()}
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

export function FilesDialog({ onOpenFile }: { onOpenFile: (file: FileGql) => void }) {
  const dialog = useEditorStore((state) => state.dialog);
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const openAuthDialog = useEditorStore((state) => state.openAuthDialog);
  const activeFileId = useEditorStore((state) => state.activeFileId);
  const renameActiveFile = useEditorStore((state) => state.renameActiveFile);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const { data: meData } = useQuery<MeQueryData>(ME_QUERY);
  const isAuthenticated = Boolean(meData?.me);
  const { data: filesData, loading } = useQuery<FilesQueryData>(FILES_QUERY, {
    skip: !isAuthenticated,
  });

  const [createFile] = useMutation<FileMutationData, FileMutationVariables>(CREATE_FILE_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
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
              <Button onClick={() => void handleCreate()}>
                <FilePlus2 className="mr-2 h-4 w-4" aria-hidden />
                New
              </Button>
            </div>

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
                      onOpen={handleOpen}
                      onRenamed={handleRenamed}
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
                      onOpen={handleOpen}
                      onRenamed={handleRenamed}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
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
  );
}
