"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  Check,
  CheckCheck,
  Crosshair,
  MapPin,
  MessageSquareDashed,
  MessagesSquare,
  Pencil,
  Reply,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  CommentGql,
  CommentMutationData,
  CommentMutationVariables,
  CommentsQueryData,
  CommentsQueryVariables,
} from "@/lib/graphql/operations";
import {
  ADD_COMMENT_MUTATION,
  COMMENTS_QUERY,
  DELETE_COMMENT_MUTATION,
  RESOLVE_COMMENT_MUTATION,
  UPDATE_COMMENT_MUTATION,
} from "@/lib/graphql/operations";
import { formatRelativeDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

// ---------------------------------------------------------------------------
// Small presentation helpers (shared by threads and the composer chips).
// ---------------------------------------------------------------------------

const AVATAR_STYLES = [
  "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300",
];

function avatarStyle(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_STYLES[Math.abs(hash) % AVATAR_STYLES.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase() || "?";
}

/** Deterministic avatar bubble with the author's initials. */
function CommentAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-5 w-5 text-[9px]",
        avatarStyle(name),
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Comment mutations are hoisted into the tab and passed down so every card
// in every thread shares one Apollo mutation instance.
// ---------------------------------------------------------------------------

interface ThreadActions {
  onEdit: (id: string, body: string) => Promise<void>;
  onToggleResolve: (id: string, resolved: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReply: (parentId: string, body: string) => Promise<void>;
  onLocate: (comment: CommentGql) => void;
}

/** One comment card — root comments carry pins + resolve, replies stay lean. */
function CommentCard({
  comment,
  isRoot,
  actions,
}: {
  comment: CommentGql;
  isRoot: boolean;
  actions: ThreadActions;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const itemRef = useRef<HTMLDivElement>(null);
  const highlightedCommentId = useEditorStore((state) => state.highlightedCommentId);
  const isHighlighted = highlightedCommentId === comment.id;

  // Scroll into view (and flash) when a canvas pin selects this comment.
  useEffect(() => {
    if (isHighlighted) {
      itemRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isHighlighted]);

  const commitEdit = useCallback(async () => {
    setEditing(false);
    const trimmed = body.trim();
    if (!trimmed || trimmed === comment.body) {
      setBody(comment.body);
      return;
    }
    await actions.onEdit(comment.id, trimmed);
  }, [actions, body, comment.body, comment.id]);

  const authorName = comment.author?.name ?? "Unknown";

  return (
    <div
      ref={itemRef}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all",
        comment.resolved
          ? "border-border opacity-60"
          : "border-border/80 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]",
        isHighlighted &&
          "border-violet-400 bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-950/40 dark:ring-violet-700",
      )}
    >
      <div className="flex items-center gap-2">
        <CommentAvatar name={authorName} size={isRoot ? "sm" : "xs"} />
        <span className="truncate text-xs font-semibold">{authorName}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {formatRelativeDate(comment.createdAt)}
        </span>
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onBlur={() => void commitEdit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void commitEdit();
              }
              if (event.key === "Escape") {
                setBody(comment.body);
                setEditing(false);
              }
            }}
            className="h-7"
            maxLength={5000}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => void commitEdit()}
            aria-label="Save comment"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{comment.body}</p>
      )}

      {isRoot && comment.x !== null && comment.y !== null ? (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="w-fit gap-1 text-[10px] font-normal">
            <MapPin className="h-3 w-3" aria-hidden />
            Pinned ({Math.round(comment.x)}, {Math.round(comment.y)})
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 gap-1 p-0 text-xs"
            onClick={() => actions.onLocate(comment)}
            aria-label="Center canvas on this comment"
            title="Center canvas on this comment"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-1 self-end">
        {isRoot ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => void actions.onToggleResolve(comment.id, !comment.resolved)}
            aria-label={comment.resolved ? "Unresolve comment" : "Resolve comment"}
          >
            {comment.resolved ? (
              <CheckCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
        ) : null}
        {!comment.resolved ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setEditing(true)}
            aria-label="Edit comment"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          onClick={() => void actions.onDelete(comment.id)}
          aria-label="Delete comment"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** Root comment + its replies (one nesting level) + inline reply composer. */
function CommentThread({
  root,
  replies,
  actions,
}: {
  root: CommentGql;
  replies: CommentGql[];
  actions: ThreadActions;
}) {
  const [replying, setReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");

  const sendReply = useCallback(async () => {
    const trimmed = replyDraft.trim();
    if (!trimmed) {
      return;
    }
    setReplyDraft("");
    setReplying(false);
    await actions.onReply(root.id, trimmed);
  }, [actions, replyDraft, root.id]);

  return (
    <div className="flex flex-col gap-1.5">
      <CommentCard comment={root} isRoot actions={actions} />

      {replies.length > 0 ? (
        <div className="ml-3.5 flex flex-col gap-1.5 border-l-2 border-border/70 pl-2.5">
          {replies.map((reply) => (
            <CommentCard key={reply.id} comment={reply} isRoot={false} actions={actions} />
          ))}
        </div>
      ) : null}

      {replying ? (
        <form
          className="ml-3.5 flex items-center gap-1.5 pl-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendReply();
          }}
        >
          <Input
            autoFocus
            value={replyDraft}
            onChange={(event) => setReplyDraft(event.target.value)}
            placeholder={`Reply to ${root.author?.name ?? "thread"}…`}
            className="h-7"
            maxLength={5000}
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0 text-violet-600 hover:text-violet-700 dark:text-violet-400"
            disabled={!replyDraft.trim()}
            aria-label="Send reply"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={() => {
              setReplyDraft("");
              setReplying(false);
            }}
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </form>
      ) : (
        <button
          type="button"
          className="ml-3.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          onClick={() => setReplying(true)}
        >
          <Reply className="h-3 w-3" aria-hidden />
          Reply
          {replies.length > 0 ? (
            <span className="rounded-full bg-muted px-1.5 text-[10px]">{replies.length}</span>
          ) : null}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sidebar tab itself.
// ---------------------------------------------------------------------------

type CommentFilter = "all" | "open" | "resolved";

export function CommentsTab({ fileId }: { fileId: string | null }) {
  const [draft, setDraft] = useState("");
  const [pinToCanvas, setPinToCanvas] = useState(true);
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [search, setSearch] = useState("");
  const viewport = useEditorStore((state) => state.viewport);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);
  const pendingPin = useEditorStore((state) => state.pendingPin);
  const startPinPlacement = useEditorStore((state) => state.startPinPlacement);
  const pinPlacementActive = useEditorStore((state) => state.pinPlacementActive);
  const clearPendingPin = useEditorStore((state) => state.clearPendingPin);

  const { data, loading } = useQuery<CommentsQueryData, CommentsQueryVariables>(COMMENTS_QUERY, {
    variables: { fileId: fileId ?? "" },
    skip: !fileId,
  });
  const [addComment] = useMutation<CommentMutationData, CommentMutationVariables>(
    ADD_COMMENT_MUTATION,
  );
  const [updateComment] = useMutation<CommentMutationData, CommentMutationVariables>(
    UPDATE_COMMENT_MUTATION,
    { refetchQueries: refetchFor(fileId) },
  );
  const [resolveComment] = useMutation<CommentMutationData, CommentMutationVariables>(
    RESOLVE_COMMENT_MUTATION,
    { refetchQueries: refetchFor(fileId) },
  );
  const [deleteComment] = useMutation<{ deleteComment: boolean }, CommentMutationVariables>(
    DELETE_COMMENT_MUTATION,
    { refetchQueries: refetchFor(fileId) },
  );

  const comments = data?.comments ?? [];

  const threads = useMemo(() => {
    const roots = comments.filter((comment) => comment.parentId === null);
    const repliesByParent = new Map<string, CommentGql[]>();
    for (const comment of comments) {
      if (comment.parentId !== null) {
        const list = repliesByParent.get(comment.parentId);
        if (list) {
          list.push(comment);
        } else {
          repliesByParent.set(comment.parentId, [comment]);
        }
      }
    }
    const needle = search.trim().toLowerCase();
    const matches = (comment: CommentGql): boolean =>
      !needle ||
      comment.body.toLowerCase().includes(needle) ||
      (comment.author?.name ?? "").toLowerCase().includes(needle);
    const filteredRoots = roots.filter((root) => {
      const byFilter = filter === "all" || (filter === "open" ? !root.resolved : root.resolved);
      if (!byFilter) {
        return false;
      }
      // A thread matches the search if its root or any reply matches.
      return matches(root) || (repliesByParent.get(root.id) ?? []).some((reply) => matches(reply));
    });
    return filteredRoots.map((root) => ({ root, replies: repliesByParent.get(root.id) ?? [] }));
  }, [comments, filter, search]);

  const stats = useMemo(() => {
    const roots = comments.filter((comment) => comment.parentId === null);
    return {
      open: roots.filter((comment) => !comment.resolved).length,
      resolved: roots.filter((comment) => comment.resolved).length,
    };
  }, [comments]);

  /** Scene coordinates of the current viewport center (where a pin lands). */
  const pinLocation = useMemo(() => {
    const canvas = document.querySelector("canvas.excalidraw__canvas");
    const width = canvas?.clientWidth ?? window.innerWidth;
    const height = canvas?.clientHeight ?? window.innerHeight;
    return {
      x: width / (2 * viewport.zoom) - viewport.scrollX,
      y: height / (2 * viewport.zoom) - viewport.scrollY,
    };
  }, [viewport]);

  const handleAdd = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !fileId) {
      return;
    }
    setDraft("");
    const position = pendingPin ?? (pinToCanvas ? pinLocation : { x: null, y: null });
    if (pendingPin) {
      clearPendingPin();
    }
    await addComment({
      variables: { fileId, body: trimmed, x: position.x, y: position.y },
      refetchQueries: [{ query: COMMENTS_QUERY, variables: { fileId } }],
    });
  }, [addComment, clearPendingPin, draft, fileId, pendingPin, pinLocation, pinToCanvas]);

  const actions: ThreadActions = useMemo(
    () => ({
      onEdit: async (id, body) => {
        await updateComment({ variables: { id, body } });
      },
      onToggleResolve: async (id, resolved) => {
        await resolveComment({ variables: { id, resolved } });
      },
      onDelete: async (id) => {
        await deleteComment({ variables: { id } });
      },
      onReply: async (parentId, body) => {
        if (!fileId) {
          return;
        }
        await addComment({
          variables: { fileId, body, parentId },
          refetchQueries: [{ query: COMMENTS_QUERY, variables: { fileId } }],
        });
      },
      onLocate: (comment) => {
        if (comment.x === null || comment.y === null || !excalidrawApi) {
          return;
        }
        const canvas = document.querySelector("canvas.excalidraw__canvas");
        const width = canvas?.clientWidth ?? window.innerWidth;
        const height = canvas?.clientHeight ?? window.innerHeight;
        const { zoom } = viewport;
        excalidrawApi.updateScene({
          appState: {
            scrollX: width / (2 * zoom) - comment.x,
            scrollY: height / (2 * zoom) - comment.y,
          },
        });
      },
    }),
    [addComment, deleteComment, excalidrawApi, fileId, resolveComment, updateComment, viewport],
  );

  if (!fileId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <MessageSquareDashed className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-sm font-medium">No file open</p>
        <p className="text-xs text-muted-foreground">Open a file to see and add comments.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void handleAdd();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a comment…"
          maxLength={5000}
        />
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          Post
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-2 text-[11px]",
            pinToCanvas &&
              !pendingPin &&
              "bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-800 dark:bg-violet-950 dark:text-violet-300",
          )}
          onClick={() => {
            setPinToCanvas((value) => !value);
            if (pendingPin) {
              clearPendingPin();
            }
          }}
          aria-pressed={pinToCanvas && !pendingPin}
          aria-label={
            pinToCanvas ? "Pinning comment to canvas center" : "Comment without canvas pin"
          }
          title={
            pinToCanvas
              ? "New comments get a pin at the canvas center — pan the canvas first to choose the spot"
              : "New comments are added without a canvas pin"
          }
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Pin at center
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-2 text-[11px]",
            pinPlacementActive &&
              "bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-800 dark:bg-violet-950 dark:text-violet-300",
          )}
          onClick={startPinPlacement}
          aria-pressed={pinPlacementActive}
          aria-label="Click the canvas to place the next comment pin"
          title="Pick an exact spot: click, then post your comment"
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden />
          Place pin
        </Button>
        {pendingPin ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/60 bg-violet-50 py-0.5 pl-2 pr-1 text-[10px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
            <MapPin className="h-3 w-3" aria-hidden />
            Pin at ({Math.round(pendingPin.x)}, {Math.round(pendingPin.y)})
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-violet-200/60 dark:hover:bg-violet-900"
              onClick={clearPendingPin}
              aria-label="Clear pin position"
            >
              <X className="h-2.5 w-2.5" aria-hidden />
            </button>
          </span>
        ) : null}
      </div>

      <fieldset
        className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 p-0.5"
        aria-label="Filter comments"
      >
        {(
          [
            { key: "all", label: "All", count: stats.open + stats.resolved },
            { key: "open", label: "Open", count: stats.open },
            { key: "resolved", label: "Resolved", count: stats.resolved },
          ] as { key: CommentFilter; label: string; count: number }[]
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            className={cn(
              "flex h-7 flex-1 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
              filter === option.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setFilter(option.key)}
            aria-pressed={filter === option.key}
          >
            {option.label}
            {option.count > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1 text-[10px] tabular-nums",
                  filter === option.key
                    ? "bg-muted text-foreground"
                    : option.key === "open"
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                      : option.key === "resolved"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        ))}
      </fieldset>

      {comments.length > 0 ? (
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search comments…"
            className="h-8 pl-8 text-xs"
            aria-label="Search comments"
          />
          {search ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setSearch("")}
              aria-label="Clear comment search"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2.5 pr-2">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-lg border border-border/60 bg-muted/40"
                />
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <MessagesSquare className="h-6 w-6 text-muted-foreground" aria-hidden />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">No comments yet</p>
                <p className="text-xs text-muted-foreground">
                  Post the first one — pin it to the canvas or reply in threads.
                </p>
              </div>
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-sm font-medium">No matching comments</p>
              <p className="text-xs text-muted-foreground">
                {search.trim()
                  ? "Try a different search term."
                  : filter === "open"
                    ? "All threads are resolved."
                    : "No resolved threads yet."}
              </p>
            </div>
          ) : (
            threads.map(({ root, replies }) => (
              <CommentThread key={root.id} root={root} replies={replies} actions={actions} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Refetch list config shared by the thread mutations (needs fileId at call time). */
function refetchFor(fileId: string | null) {
  return fileId ? [{ query: COMMENTS_QUERY, variables: { fileId } }] : [];
}
