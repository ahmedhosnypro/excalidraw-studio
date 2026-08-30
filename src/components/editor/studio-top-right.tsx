"use client";

import { useMutation } from "@apollo/client/react";
import { useTheme } from "next-themes";
import { useCallback } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CloudOff,
  Cloud,
  FolderOpen,
  Loader2,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";

import {
  LOGOUT_MUTATION,
  ME_QUERY,
} from "@/lib/graphql/operations";
import type { UserGql } from "@/lib/graphql/operations";
import { useEditorStore } from "@/store/editor-store";

function SaveStatusChip() {
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const activeFileId = useEditorStore((state) => state.activeFileId);

  if (!activeFileId && saveStatus === "idle") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
        Local only
      </span>
    );
  }

  switch (saveStatus) {
    case "saving":
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Saving…
        </span>
      );
    case "dirty":
      return (
        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <Cloud className="h-3.5 w-3.5" aria-hidden />
          Unsaved changes
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Save failed — retrying
        </span>
      );
    case "saved":
      return (
        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Cloud className="h-3.5 w-3.5" aria-hidden />
          Saved
        </span>
      );
    default:
      return null;
  }
}

export function StudioTopRight({ user }: { user: UserGql | null }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [logout] = useMutation<{ logout: boolean }, Record<string, never>>(LOGOUT_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
  const activeFileName = useEditorStore((state) => state.activeFileName);
  const openDialog = useEditorStore((state) => state.openDialog);
  const openAuthDialog = useEditorStore((state) => state.openAuthDialog);

  const handleLogout = useCallback(async () => {
    const { flushSave, closeFile } = useEditorStore.getState();
    await flushSave?.();
    await logout();
    closeFile();
  }, [logout]);

  const initials = user
    ? user.name
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "U"
    : "";

  return (
    <div className="excalidraw-ui flex items-center gap-2">
      {activeFileName ? (
        <span className="max-w-[16ch] truncate rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {activeFileName}
        </span>
      ) : null}
      <SaveStatusChip />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={() => openDialog("files")}
        aria-label="My files"
      >
        <FolderOpen className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Files</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
      >
        {resolvedTheme === "dark" ? (
          <Sun className="h-4 w-4" aria-hidden />
        ) : (
          <Moon className="h-4 w-4" aria-hidden />
        )}
      </Button>
      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Account menu">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openDialog("files")}>
              <FolderOpen className="mr-2 h-4 w-4" aria-hidden />
              My files
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleLogout()}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          size="sm"
          className="h-8"
          onClick={() =>
            openAuthDialog(
              "Sign in to save your drawings to the cloud and switch between files.",
            )
          }
        >
          <LogIn className="mr-1 h-4 w-4" aria-hidden />
          Sign in
        </Button>
      )}
    </div>
  );
}
