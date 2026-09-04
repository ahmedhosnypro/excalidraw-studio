"use client";

import { useQuery } from "@apollo/client/react";
import { Check, MessageCircle } from "lucide-react";
import { useCallback, useMemo } from "react";
import type {
  CommentGql,
  CommentsQueryData,
  CommentsQueryVariables,
  SharedCommentsQueryData,
  SharedCommentsQueryVariables,
} from "@/lib/graphql/operations";
import { COMMENTS_QUERY, SHARED_COMMENTS_QUERY } from "@/lib/graphql/operations";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

/**
 * Canvas overlay rendering one pin per comment that has scene coordinates.
 * Pin position: (sceneX + scrollX) * zoom (Excalidraw's own transform, minus
 * the canvas offset which is 0 relative to the container).
 *
 * Clicking a pin opens the comments sidebar tab and highlights the comment.
 */
function CommentPinMarkers({ comments }: { comments: CommentGql[] }) {
  const viewport = useEditorStore((state) => state.viewport);
  const highlightedCommentId = useEditorStore((state) => state.highlightedCommentId);
  const highlightComment = useEditorStore((state) => state.highlightComment);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);

  const pinnedComments = useMemo(
    () =>
      comments.filter(
        (comment): comment is CommentGql & { x: number; y: number } =>
          comment.x !== null && comment.y !== null,
      ),
    [comments],
  );

  /** Replies per top-level comment — shown as a count badge on pins. */
  const replyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments) {
      if (comment.parentId !== null) {
        counts.set(comment.parentId, (counts.get(comment.parentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [comments]);

  const handlePinClick = useCallback(
    (commentId: string) => {
      const openSidebar = excalidrawApi?.getAppState().openSidebar;
      const alreadyOpen = openSidebar?.name === "default" && openSidebar.tab === "comments";
      if (!alreadyOpen) {
        excalidrawApi?.toggleSidebar({ name: "default", tab: "comments" });
      }
      highlightComment(commentId);
    },
    [excalidrawApi, highlightComment],
  );

  if (pinnedComments.length === 0) {
    return null;
  }

  const { scrollX, scrollY, zoom } = viewport;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {pinnedComments.map((comment) => {
        const left = (comment.x + scrollX) * zoom;
        const top = (comment.y + scrollY) * zoom;
        if (
          left < -40 ||
          top < -40 ||
          left > window.innerWidth + 40 ||
          top > window.innerHeight + 40
        ) {
          return null;
        }
        const highlighted = highlightedCommentId === comment.id;
        const replies = replyCounts.get(comment.id) ?? 0;
        return (
          <button
            key={comment.id}
            type="button"
            className={cn(
              "pointer-events-auto absolute flex h-7 w-7 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 text-white shadow-md transition-all duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              comment.resolved
                ? "border-emerald-200 bg-emerald-600 hover:bg-emerald-500"
                : "border-violet-200 bg-violet-600 hover:bg-violet-500",
              highlighted && "scale-110 ring-2 ring-ring ring-offset-2",
            )}
            style={{ left, top }}
            onClick={() => handlePinClick(comment.id)}
            aria-label={`Comment by ${comment.author?.name ?? "unknown"}: ${comment.body.slice(0, 60)}${comment.body.length > 60 ? "…" : ""}${replies > 0 ? ` (${replies} ${replies === 1 ? "reply" : "replies"})` : ""}`}
            title={comment.body.slice(0, 120)}
          >
            {comment.resolved ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            )}
            {replies > 0 ? (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-foreground px-1 text-[9px] font-bold leading-none text-background"
                aria-hidden
              >
                {replies}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Owner variant: renders pins for the open file's comments (queries by file
 * id, shares the Apollo cache with the comments sidebar tab).
 */
export function CommentPinsLayer({ fileId }: { fileId: string | null }) {
  const { data } = useQuery<CommentsQueryData, CommentsQueryVariables>(COMMENTS_QUERY, {
    variables: { fileId: fileId ?? "" },
    skip: !fileId,
    // Keep pins in sync after add/resolve/delete from the sidebar tab.
    refetchWritePolicy: "merge",
  });

  return <CommentPinMarkers comments={data?.comments ?? []} />;
}

/**
 * Guest variant: renders pins for a shared file's comments (queries by share
 * token, shares the cache with the guest comments sidebar tab).
 */
export function SharedCommentPinsLayer({ token }: { token: string }) {
  const { data } = useQuery<SharedCommentsQueryData, SharedCommentsQueryVariables>(
    SHARED_COMMENTS_QUERY,
    { variables: { token }, refetchWritePolicy: "merge" },
  );

  return <CommentPinMarkers comments={data?.sharedComments ?? []} />;
}
