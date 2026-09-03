"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  Check,
  CheckCheck,
  Crosshair,
  MapPin,
  MessageSquareOff,
  Pencil,
  Trash2,
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
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

function CommentItem({ comment, fileId }: { comment: CommentGql; fileId: string }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const itemRef = useRef<HTMLDivElement>(null);
  const highlightedCommentId = useEditorStore((state) => state.highlightedCommentId);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);
  const viewport = useEditorStore((state) => state.viewport);
  const isHighlighted = highlightedCommentId === comment.id;

  // Scroll into view (and flash) when a canvas pin selects this comment.
  useEffect(() => {
    if (isHighlighted) {
      itemRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isHighlighted]);

  // Center the canvas on this comment's pin.
  const locatePin = useCallback(() => {
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
  }, [comment.x, comment.y, excalidrawApi, viewport]);

  const refetch = [{ query: COMMENTS_QUERY, variables: { fileId } }];
  const [updateComment] = useMutation<CommentMutationData, CommentMutationVariables>(
    UPDATE_COMMENT_MUTATION,
    {
      refetchQueries: refetch,
    },
  );
  const [resolveComment] = useMutation<CommentMutationData, CommentMutationVariables>(
    RESOLVE_COMMENT_MUTATION,
    {
      refetchQueries: refetch,
    },
  );
  const [deleteComment] = useMutation<{ deleteComment: boolean }, CommentMutationVariables>(
    DELETE_COMMENT_MUTATION,
    {
      refetchQueries: refetch,
    },
  );

  const commitEdit = useCallback(async () => {
    setEditing(false);
    const trimmed = body.trim();
    if (!trimmed || trimmed === comment.body) {
      setBody(comment.body);
      return;
    }
    await updateComment({ variables: { id: comment.id, body: trimmed } });
  }, [body, comment.body, comment.id, updateComment]);

  const toggleResolve = useCallback(async () => {
    await resolveComment({
      variables: { id: comment.id, resolved: !comment.resolved },
    });
  }, [comment.id, comment.resolved, resolveComment]);

  const handleDelete = useCallback(async () => {
    await deleteComment({ variables: { id: comment.id } });
  }, [comment.id, deleteComment]);

  return (
    <div
      ref={itemRef}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 transition-all",
        comment.resolved ? "border-border opacity-60" : "border-border/80 bg-card",
        isHighlighted &&
          "border-violet-400 bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-950/40 dark:ring-violet-700",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold">{comment.author?.name ?? "Unknown"}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {new Date(comment.createdAt).toLocaleString()}
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
        <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
      )}

      {comment.x !== null && comment.y !== null ? (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="w-fit gap-1 text-[10px] font-normal">
            <MapPin className="h-3 w-3" aria-hidden />
            Pinned ({Math.round(comment.x)}, {Math.round(comment.y)})
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 gap-1 p-0 text-xs"
            onClick={locatePin}
            aria-label="Center canvas on this comment"
            title="Center canvas on this comment"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-1 self-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => void toggleResolve()}
          aria-label={comment.resolved ? "Unresolve comment" : "Resolve comment"}
        >
          {comment.resolved ? (
            <CheckCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
        </Button>
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
          onClick={() => void handleDelete()}
          aria-label="Delete comment"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function CommentsTab({ fileId }: { fileId: string | null }) {
  const [draft, setDraft] = useState("");
  const [pinToCanvas, setPinToCanvas] = useState(true);
  const viewport = useEditorStore((state) => state.viewport);

  const { data, loading } = useQuery<CommentsQueryData, CommentsQueryVariables>(COMMENTS_QUERY, {
    variables: { fileId: fileId ?? "" },
    skip: !fileId,
  });
  const [addComment] = useMutation<CommentMutationData, CommentMutationVariables>(
    ADD_COMMENT_MUTATION,
  );

  const comments = data?.comments ?? [];

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
    const position = pinToCanvas ? pinLocation : { x: null, y: null };
    await addComment({
      variables: { fileId, body: trimmed, x: position.x, y: position.y },
      refetchQueries: [{ query: COMMENTS_QUERY, variables: { fileId } }],
    });
  }, [addComment, draft, fileId, pinLocation, pinToCanvas]);

  if (!fileId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <MessageSquareOff className="h-6 w-6 text-muted-foreground" aria-hidden />
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-9 w-9 shrink-0 p-0",
            pinToCanvas &&
              "bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-800 dark:bg-violet-950 dark:text-violet-300",
          )}
          onClick={() => setPinToCanvas((value) => !value)}
          aria-pressed={pinToCanvas}
          aria-label={
            pinToCanvas ? "Pinning comment to canvas center" : "Comment without canvas pin"
          }
          title={
            pinToCanvas
              ? "New comments get a pin at the canvas center — pan the canvas first to choose the spot"
              : "New comments are added without a canvas pin"
          }
        >
          <MapPin className="h-4 w-4" aria-hidden />
        </Button>
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          Post
        </Button>
      </form>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 pr-2">
          {loading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No comments yet. Add the first one above.
            </p>
          ) : (
            comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} fileId={fileId} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
