"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  Check,
  Cloud,
  CloudOff,
  FolderOpen,
  Globe,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  Moon,
  Presentation,
  RefreshCw,
  Sun,
} from "lucide-react";
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
import type {
  CommentsQueryData,
  CommentsQueryVariables,
  FilesQueryData,
  UserGql,
} from "@/lib/graphql/operations";
import { COMMENTS_QUERY, FILES_QUERY, LOGOUT_MUTATION, ME_QUERY } from "@/lib/graphql/operations";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

function SaveStatusChip() {
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const activeFileId = useEditorStore((state) => state.activeFileId);

  const config = (() => {
    if (!activeFileId && saveStatus === "idle") {
      return {
        icon: <CloudOff className="h-3.5 w-3.5" aria-hidden />,
        label: "Local only",
        className: "bg-muted/60 text-muted-foreground border-border/60",
      };
    }
    switch (saveStatus) {
      // A cloud file with nothing pending reads as synced — the chip never
      // disappears between saves.
      case "idle":
      case "saved":
        return {
          icon: <Check className="h-3.5 w-3.5" aria-hidden />,
          label: "Saved",
          className:
            "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
        };
      case "saving":
        return {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
          label: "Saving…",
          className:
            "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800",
        };
      case "dirty":
        return {
          icon: <Cloud className="h-3.5 w-3.5" aria-hidden />,
          label: "Unsaved changes",
          className:
            "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
        };
      case "error":
        return {
          icon: <RefreshCw className="h-3.5 w-3.5" aria-hidden />,
          label: "Save failed — retrying",
          className: "bg-destructive/10 text-destructive border-destructive/30",
        };
      default:
        return null;
    }
  })();

  if (!config) {
    return null;
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none transition-colors duration-300",
        config.className,
      )}
    >
      {config.icon}
      <span className="hidden sm:inline">{config.label}</span>
      <span className="sr-only sm:hidden">{config.label}</span>
    </span>
  );
}

/** Sidebar tab trigger (Comments / Present) with an active state + optional badge. */
function SidebarTabButton({
  tab,
  label,
  badge,
  children,
}: {
  tab: "comments" | "present";
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  const sidebarTab = useEditorStore((state) => state.sidebarTab);
  const presenting = useEditorStore((state) => state.presenting);
  const isActive = presenting ? false : sidebarTab === tab;

  const handleClick = useCallback(() => {
    useEditorStore.getState().excalidrawApi?.toggleSidebar({ name: "default", tab });
  }, [tab]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-8 gap-1.5 px-2",
        isActive &&
          "bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-800 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900",
      )}
      onClick={handleClick}
      aria-pressed={isActive}
      aria-label={badge !== undefined && badge > 0 ? `${label} (${badge} open)` : label}
      title={label}
    >
      {children}
      {badge !== undefined && badge > 0 ? (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Button>
  );
}

export function StudioTopRight({ user }: { user: UserGql | null }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [logout] = useMutation<{ logout: boolean }, Record<string, never>>(LOGOUT_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
  const activeFileId = useEditorStore((state) => state.activeFileId);
  const activeFileName = useEditorStore((state) => state.activeFileName);
  const openDialog = useEditorStore((state) => state.openDialog);
  const openAuthDialog = useEditorStore((state) => state.openAuthDialog);

  // Active file row (from the files cache) — used for the shared indicator.
  const { data: filesData } = useQuery<FilesQueryData>(FILES_QUERY, { skip: !user });
  const activeFileShared = (filesData?.files ?? []).some(
    (file) => file.id === activeFileId && Boolean(file.shareToken),
  );

  // Shares the Apollo cache with the comments sidebar tab — powers the open
  // comment count badge on the top-right trigger.
  const { data: commentsData } = useQuery<CommentsQueryData, CommentsQueryVariables>(
    COMMENTS_QUERY,
    {
      variables: { fileId: activeFileId ?? "" },
      skip: !activeFileId || !user,
    },
  );
  const openCommentCount = (commentsData?.comments ?? []).filter(
    (comment) => comment.parentId === null && !comment.resolved,
  ).length;

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
      {user && activeFileId ? (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 gap-1.5 px-2",
            activeFileShared &&
              "text-violet-700 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200",
          )}
          onClick={() => openDialog("share")}
          aria-label={activeFileShared ? "Share settings (link active)" : "Share this drawing"}
          title={activeFileShared ? "Sharing — a public link is active" : "Share this drawing"}
        >
          {activeFileShared ? (
            <Globe className="h-4 w-4" aria-hidden />
          ) : (
            <Link2 className="h-4 w-4" aria-hidden />
          )}
          <span className="hidden lg:inline">Share</span>
        </Button>
      ) : null}
      <SidebarTabButton tab="comments" label="Comments" badge={openCommentCount}>
        <MessageCircle className="h-4 w-4" aria-hidden />
        <span className="hidden lg:inline">Comments</span>
      </SidebarTabButton>
      <SidebarTabButton tab="present" label="Present slides">
        <Presentation className="h-4 w-4" aria-hidden />
        <span className="hidden lg:inline">Present</span>
      </SidebarTabButton>
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
                <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
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
            openAuthDialog("Sign in to save your drawings to the cloud and switch between files.")
          }
        >
          <LogIn className="mr-1 h-4 w-4" aria-hidden />
          Sign in
        </Button>
      )}
    </div>
  );
}
