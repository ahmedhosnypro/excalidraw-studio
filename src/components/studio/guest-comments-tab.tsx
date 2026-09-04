"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { Eye, Loader2, MessageSquareDashed, Send, UserRound } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  CommentComposer,
  CommentsEmptyState,
  CommentsLoadingSkeleton,
  CommentThread,
  GUEST_CAPABILITIES,
  groupCommentThreads,
} from "@/components/studio/comments-tab";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { centerCanvasOn, viewportSceneCenter } from "@/lib/canvas-geometry";
import type {
  CommentGql,
  GuestCommentMutationData,
  GuestCommentMutationVariables,
  SharedCommentsQueryData,
  SharedCommentsQueryVariables,
  ToggleGuestReactionMutationData,
  ToggleGuestReactionMutationVariables,
} from "@/lib/graphql/operations";
import {
  ADD_GUEST_COMMENT_MUTATION,
  SHARED_COMMENTS_QUERY,
  TOGGLE_GUEST_REACTION_MUTATION,
} from "@/lib/graphql/operations";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

const GUEST_NAME_STORAGE_KEY = "studio:guest-name";

/** Reads the persisted guest display name (browser-local). */
function loadGuestName(): string {
  try {
    return window.localStorage.getItem(GUEST_NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeGuestName(name: string): void {
  try {
    window.localStorage.setItem(GUEST_NAME_STORAGE_KEY, name);
    // Notify the realtime layer (same-tab) so live presence picks up the name.
    window.dispatchEvent(new CustomEvent("studio:guest-name"));
  } catch {
    // Private browsing — keep the name in memory only.
  }
}

/**
 * Comments sidebar tab for shared-link guests: read + reply, no moderation.
 * Posting requires a display name (persisted locally, no account).
 */
export function GuestCommentsTab({ token }: { token: string }) {
  const [guestName, setGuestName] = useState(loadGuestName);
  const [draft, setDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [lastMutationError, setLastMutationError] = useState<string | null>(null);
  const viewport = useEditorStore((state) => state.viewport);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);

  const {
    data,
    loading,
    refetch: refetchComments,
  } = useQuery<SharedCommentsQueryData, SharedCommentsQueryVariables>(SHARED_COMMENTS_QUERY, {
    // The guest name feeds viewerGuestName so their own reactions are
    // flagged "mine". Re-subscribes when the name changes.
    variables: { token, viewerGuestName: guestName.trim() || undefined },
  });
  const [addGuestComment, mutation] = useMutation<
    GuestCommentMutationData,
    GuestCommentMutationVariables
  >(ADD_GUEST_COMMENT_MUTATION);
  const [toggleGuestReaction] = useMutation<
    ToggleGuestReactionMutationData,
    ToggleGuestReactionMutationVariables
  >(TOGGLE_GUEST_REACTION_MUTATION);

  const comments = data?.sharedComments ?? [];

  const threads = useMemo(() => groupCommentThreads(comments), [comments]);

  const pinLocation = useMemo(() => viewportSceneCenter(viewport), [viewport]);

  const post = useCallback(
    async (body: string, parentId?: string) => {
      const trimmedName = guestName.trim();
      if (trimmedName.length === 0) {
        setNameError("Add your name above before posting.");
        return;
      }
      setNameError(null);
      storeGuestName(trimmedName);
      try {
        await addGuestComment({
          variables: {
            token,
            guestName: trimmedName,
            body,
            parentId: parentId ?? null,
            x: parentId ? null : pinLocation.x,
            y: parentId ? null : pinLocation.y,
          },
        });
        // Refetch with the CURRENT variables (name included) so reaction
        // "mine" flags and the fresh comment list both land.
        await refetchComments();
      } catch {
        // Errors surface through the mutation state chip below.
      }
    },
    [addGuestComment, guestName, pinLocation, refetchComments, token],
  );

  const handleAdd = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    setDraft("");
    await post(trimmed);
  }, [draft, post]);

  const actions = useMemo(
    () => ({
      onEdit: async () => undefined,
      onToggleResolve: async () => undefined,
      onDelete: async () => undefined,
      onReply: async (parentId: string, body: string) => {
        await post(body, parentId);
      },
      onLocate: (comment: CommentGql) => {
        if (comment.x === null || comment.y === null || !excalidrawApi) {
          return;
        }
        centerCanvasOn(excalidrawApi, comment.x, comment.y, viewport.zoom);
      },
      onToggleReaction: async (id: string, emoji: string) => {
        const trimmedName = guestName.trim();
        if (trimmedName.length === 0) {
          setNameError("Add your name above to react.");
          return;
        }
        storeGuestName(trimmedName);
        try {
          await toggleGuestReaction({
            variables: { token, guestName: trimmedName, id, emoji },
          });
          await refetchComments();
        } catch {
          // The refetch keeps the UI consistent; failures show as untouched
          // chips.
        }
      },
    }),
    [excalidrawApi, guestName, post, refetchComments, token, toggleGuestReaction, viewport],
  );

  // Surface name-related mutation errors on the name field (render-time
  // adjustment — setState-in-effect would cascade renders).
  const mutationError = mutation.error?.message ?? null;
  if (mutationError !== lastMutationError) {
    setLastMutationError(mutationError);
    if (mutationError?.toLowerCase().includes("name")) {
      setNameError(mutationError);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-muted-foreground" htmlFor="guest-name">
          Your name
        </label>
        <div className="relative">
          <UserRound
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="guest-name"
            value={guestName}
            onChange={(event) => {
              setGuestName(event.target.value);
              if (nameError) {
                setNameError(null);
              }
            }}
            placeholder="e.g. Sara"
            maxLength={60}
            className="h-8 pl-8 text-xs"
            aria-invalid={Boolean(nameError)}
          />
        </div>
        {nameError ? (
          <p className="text-[11px] text-destructive" role="alert">
            {nameError}
          </p>
        ) : null}
      </div>

      <CommentComposer
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={() => void handleAdd()}
        disabled={!draft.trim() || mutation.loading}
        submitContent={
          mutation.loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Post
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" aria-hidden />
              Post
            </>
          )
        }
      />

      {mutation.error && !nameError ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive"
          role="alert"
        >
          {mutation.error.message}
        </p>
      ) : null}

      {mutation.called && !mutation.loading && !mutation.error ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Send className="h-3 w-3" aria-hidden />
          Comment posted — refresh to see replies from others.
        </p>
      ) : null}

      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1.5">
        <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-[11px] leading-snug text-muted-foreground">
          You&apos;re commenting as a guest. The owner can read and moderate everything you post.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2.5 pr-2">
          {loading ? (
            <CommentsLoadingSkeleton />
          ) : comments.length === 0 ? (
            <CommentsEmptyState hint="Leave the first one — it lands as a pin on the canvas." />
          ) : (
            threads.map(({ root, replies }) => (
              <div key={root.id} className={cn("flex flex-col", root.resolved && "opacity-70")}>
                {root.resolved ? (
                  <Badge variant="outline" className="mb-1 w-fit gap-1 text-[10px] font-normal">
                    <MessageSquareDashed className="h-3 w-3" aria-hidden />
                    Resolved thread
                  </Badge>
                ) : null}
                <CommentThread
                  root={root}
                  replies={replies}
                  actions={actions}
                  capabilities={GUEST_CAPABILITIES}
                />
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
