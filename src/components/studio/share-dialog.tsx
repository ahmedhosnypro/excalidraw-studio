"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  Check,
  Copy,
  Globe,
  Link2,
  Loader2,
  MousePointer2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type {
  FileGql,
  FilesQueryData,
  MeQueryData,
  ShareLinkMutationData,
  ShareLinkMutationVariables,
} from "@/lib/graphql/operations";
import {
  CREATE_SHARE_LINK_MUTATION,
  FILES_QUERY,
  ME_QUERY,
  REVOKE_SHARE_LINK_MUTATION,
} from "@/lib/graphql/operations";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

/** Refetches the files list (share token state) after a link mutation. */
const REFETCH = [{ query: ME_QUERY }, "Files"];

/** Small feature bullet row used in both dialog states. */
function FeatureRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-muted text-muted-foreground"
        aria-hidden
      >
        {icon}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

export function ShareDialog() {
  const dialog = useEditorStore((state) => state.dialog);
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const activeFileId = useEditorStore((state) => state.activeFileId);
  const activeFileName = useEditorStore((state) => state.activeFileName);
  const shareFileId = useEditorStore((state) => state.shareFileId);
  const { toast } = useToast();

  const { data: meData } = useQuery<MeQueryData>(ME_QUERY);
  const isAuthenticated = Boolean(meData?.me);
  const { data: filesData } = useQuery<FilesQueryData>(FILES_QUERY, {
    skip: !isAuthenticated,
  });

  // Explicit row target wins; otherwise the dialog shares the open file.
  const targetFileId = dialog === "share" ? (shareFileId ?? activeFileId) : null;
  const activeFile = useMemo(
    () => (filesData?.files ?? []).find((file: FileGql) => file.id === targetFileId) ?? null,
    [targetFileId, filesData?.files],
  );
  const targetFileName = activeFile?.name ?? activeFileName ?? "drawing";

  const [createShareLink, createLink] = useMutation<
    ShareLinkMutationData,
    ShareLinkMutationVariables
  >(CREATE_SHARE_LINK_MUTATION, { refetchQueries: REFETCH });
  const [revokeShareLink, revokeLink] = useMutation<
    ShareLinkMutationData,
    ShareLinkMutationVariables
  >(REVOKE_SHARE_LINK_MUTATION, { refetchQueries: REFETCH });

  const [copied, setCopied] = useState(false);
  const shareToken = activeFile?.shareToken ?? null;

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const shareUrl = useMemo(
    () => (shareToken ? `${window.location.origin}/?share=${shareToken}` : ""),
    [shareToken],
  );

  const handleCreate = useCallback(async () => {
    if (!targetFileId) {
      return;
    }
    try {
      await createShareLink({ variables: { fileId: targetFileId } });
    } catch (error) {
      toast({
        title: "Could not create the link",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [targetFileId, createShareLink, toast]);

  const handleRevoke = useCallback(async () => {
    if (!targetFileId) {
      return;
    }
    try {
      await revokeShareLink({ variables: { fileId: targetFileId } });
      toast({
        title: "Share link revoked",
        description: "The old link no longer works for anyone who has it.",
      });
    } catch (error) {
      toast({
        title: "Could not revoke the link",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [targetFileId, revokeShareLink, toast]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the link text and copy it manually.",
        variant: "destructive",
      });
    }
  }, [shareUrl, toast]);

  return (
    <Dialog open={dialog === "share"} onOpenChange={(open) => (open ? null : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
              aria-hidden
            >
              <ShareIcon className="h-4 w-4" />
            </span>
            Share “{targetFileName}”
          </DialogTitle>
          <DialogDescription>
            Invite anyone to view this drawing — no account needed to comment.
          </DialogDescription>
        </DialogHeader>

        {!targetFileId ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm font-medium">No file open</p>
            <p className="text-xs text-muted-foreground">
              Open one of your files first, then share it.
            </p>
          </div>
        ) : !shareToken ? (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2.5">
              <FeatureRow icon={<Globe className="h-3.5 w-3.5" aria-hidden />}>
                Anyone with the link can <strong className="font-semibold">view</strong> the drawing
                and pan, zoom or present it — they cannot edit it.
              </FeatureRow>
              <FeatureRow icon={<Users className="h-3.5 w-3.5" aria-hidden />}>
                Visitors can leave <strong className="font-semibold">comments</strong> with canvas
                pins under a display name, without signing up.
              </FeatureRow>
              <FeatureRow icon={<MousePointer2 className="h-3.5 w-3.5" aria-hidden />}>
                While you draw, viewers see your{" "}
                <strong className="font-semibold">live cursor</strong>, presence and scene updates
                in real time — and can follow your every pan and zoom.
              </FeatureRow>
              <FeatureRow icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden />}>
                You stay in control: revoke the link at any time and it stops working immediately.
              </FeatureRow>
            </ul>
            <Button
              onClick={() => void handleCreate()}
              disabled={createLink.loading}
              className="gap-2"
            >
              {createLink.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden />
              )}
              Create share link
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Share link"
                className="font-mono text-xs"
              />
              <Button
                onClick={() => void handleCopy()}
                className={cn(
                  "shrink-0 gap-1.5 transition-colors",
                  copied && "bg-emerald-600 hover:bg-emerald-700",
                )}
                aria-live="polite"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden />
                    Copy
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Share this link — recipients can view the drawing and comment as guests.{" "}
              <span className="font-medium text-foreground">Do not post it publicly</span> if the
              drawing is sensitive: anyone holding the link can read it.
            </p>

            <Button
              variant="outline"
              onClick={() => void handleRevoke()}
              disabled={revokeLink.loading}
              className="gap-2 text-destructive hover:text-destructive"
            >
              {revokeLink.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ShieldAlert className="h-4 w-4" aria-hidden />
              )}
              Revoke link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Inline share-link badge (e.g. files dialog rows): a globe chip. */
export function SharedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-violet-300/60 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
      title="Shared — a public view link exists for this file"
    >
      <Globe className="h-3 w-3" aria-hidden />
      Shared
    </span>
  );
}

/** Share icon kept local to avoid importing Share2 in multiple call sites. */
function ShareIcon({ className }: { className?: string }) {
  return <Link2 className={className} aria-hidden />;
}
