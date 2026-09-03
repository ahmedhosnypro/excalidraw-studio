"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { Copy, FilePlus2, FolderOpen, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
import { useEditorStore } from "@/store/editor-store";

function FileRow({
  file,
  active,
  onOpen,
  onRenamed,
}: {
  file: FileGql;
  active: boolean;
  onOpen: (file: FileGql) => void;
  onRenamed: (file: FileGql) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(file.name);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [renameFile] = useMutation<FileMutationData, FileMutationVariables>(RENAME_FILE_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
  const [duplicateFile] = useMutation<FileMutationData, FileMutationVariables>(
    DUPLICATE_FILE_MUTATION,
    {
      refetchQueries: [{ query: ME_QUERY }, "Files"],
    },
  );
  const [deleteFile] = useMutation<{ deleteFile: boolean }, FileMutationVariables>(
    DELETE_FILE_MUTATION,
    {
      refetchQueries: [{ query: ME_QUERY }, "Files"],
    },
  );
  const { toast } = useToast();

  const commitRename = useCallback(async () => {
    setRenaming(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === file.name) {
      setName(file.name);
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
  }, [file.id, file.name, name, onRenamed, renameFile, toast]);

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
        store.setExcalidrawApi(store.excalidrawApi); // keep api
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

  return (
    <div
      className={`group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
        active
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
          : "border-transparent hover:bg-muted/60"
      }`}
    >
      {renaming ? (
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void commitRename();
            }
            if (event.key === "Escape") {
              setName(file.name);
              setRenaming(false);
            }
          }}
          className="h-7"
          maxLength={200}
        />
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Actions for ${file.name}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="mr-2 h-4 w-4" aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleDuplicate()}>
            <Copy className="mr-2 h-4 w-4" aria-hidden />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{file.name}”?</DialogTitle>
            <DialogDescription>
              This permanently deletes the drawing and its comments. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteDialogOpen(false);
                void handleDelete();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
    const list = filesData?.files ?? [];
    if (!search.trim()) {
      return list;
    }
    const needle = search.trim().toLowerCase();
    return list.filter((file) => file.name.toLowerCase().includes(needle));
  }, [filesData?.files, search]);

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
              <div className="relative flex-1">
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
              <Button onClick={() => void handleCreate()}>
                <FilePlus2 className="mr-2 h-4 w-4" aria-hidden />
                New
              </Button>
            </div>

            <ScrollArea className="max-h-80 -mx-1 px-1">
              <div className="flex flex-col gap-1">
                {loading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Loading files…</p>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <FolderOpen className="h-6 w-6 text-muted-foreground" aria-hidden />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">No drawings yet</p>
                      <p className="text-xs text-muted-foreground">
                        Create your first file — everything you draw autosaves to your account.
                      </p>
                    </div>
                    <Button size="sm" onClick={() => void handleCreate()} className="gap-1.5">
                      <FilePlus2 className="h-4 w-4" aria-hidden />
                      New drawing
                    </Button>
                  </div>
                ) : (
                  files.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      active={file.id === activeFileId}
                      onOpen={(f) => {
                        onOpenFile(f);
                        closeDialog();
                      }}
                      onRenamed={(f) => {
                        if (f.id === activeFileId) {
                          renameActiveFile(f.name);
                        }
                      }}
                    />
                  ))
                )}
              </div>
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
