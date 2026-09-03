"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { Check, CheckCheck, MessageSquareOff, Pencil, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
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

function CommentItem({ comment, fileId }: { comment: CommentGql; fileId: string }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);

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
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3",
        comment.resolved ? "border-border opacity-60" : "border-border/80 bg-card",
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
        <Badge variant="outline" className="w-fit text-[10px] font-normal">
          Pinned to canvas ({Math.round(comment.x)}, {Math.round(comment.y)})
        </Badge>
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

  const { data, loading } = useQuery<CommentsQueryData, CommentsQueryVariables>(COMMENTS_QUERY, {
    variables: { fileId: fileId ?? "" },
    skip: !fileId,
  });
  const [addComment] = useMutation<CommentMutationData, CommentMutationVariables>(
    ADD_COMMENT_MUTATION,
  );

  const comments = data?.comments ?? [];

  const handleAdd = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !fileId) {
      return;
    }
    setDraft("");
    await addComment({
      variables: { fileId, body: trimmed },
      refetchQueries: [{ query: COMMENTS_QUERY, variables: { fileId } }],
    });
  }, [addComment, draft, fileId]);

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
