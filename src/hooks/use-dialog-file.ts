"use client";

import { useQuery } from "@apollo/client/react";
import { useMemo } from "react";

import type { FileGql, FilesQueryData, MeQueryData } from "@/lib/graphql/operations";
import { FILES_QUERY, ME_QUERY } from "@/lib/graphql/operations";
import { useEditorStore } from "@/store/editor-store";

/**
 * Resolves the file a per-file dialog (share, version history) targets:
 * an explicit row target wins, otherwise the currently open file. Shared by
 * dialogs that can be opened for a non-active file from the files list.
 */
export function useDialogFileTarget(
  dialogName: "share" | "history",
  fallbackName = "drawing",
): {
  isOpen: boolean;
  closeDialog: () => void;
  targetFileId: string | null;
  targetFile: FileGql | null;
  targetFileName: string;
} {
  const dialog = useEditorStore((state) => state.dialog);
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const activeFileId = useEditorStore((state) => state.activeFileId);
  const activeFileName = useEditorStore((state) => state.activeFileName);
  const targetedFileId = useEditorStore((state) =>
    dialogName === "share" ? state.shareFileId : state.historyFileId,
  );

  const { data: meData } = useQuery<MeQueryData>(ME_QUERY);
  const isAuthenticated = Boolean(meData?.me);
  const { data: filesData } = useQuery<FilesQueryData>(FILES_QUERY, {
    skip: !isAuthenticated,
  });

  const isOpen = dialog === dialogName;
  const targetFileId = isOpen ? (targetedFileId ?? activeFileId) : null;
  const targetFile = useMemo(
    () => (filesData?.files ?? []).find((file: FileGql) => file.id === targetFileId) ?? null,
    [targetFileId, filesData?.files],
  );
  const targetFileName = targetFile?.name ?? activeFileName ?? fallbackName;

  return { isOpen, closeDialog, targetFileId, targetFile, targetFileName };
}
