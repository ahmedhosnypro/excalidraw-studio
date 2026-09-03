"use client";

import { useQuery } from "@apollo/client/react";
import { Check, MessageCircle } from "lucide-react";
import { useCallback, useMemo } from "react";
import type {
  CommentGql,
  CommentsQueryData,
  CommentsQueryVariables,
} from "@/lib/graphql/operations";
import { COMMENTS_QUERY } from "@/lib/graphql/operations";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";

/**
 * Canvas overlay rendering one pin per comment that has scene coordinates.
 * Pin position: (sceneX + scrollX) * zoom (Excalidraw's own transform, minus
 * the canvas offset which is 0 relative to the container).
 *
 * Clicking a pin opens the comments sidebar tab and highlights the comment.
 */
export function CommentPinsLayer({ fileId }: { fileId: string | null }) {
  const viewport = useEditorStore((state) => state.viewport);
  const highlightedCommentId = useEditorStore((state) => state.highlightedCommentId);
  const highlightComment = useEditorStore((state) => state.highlightComment);
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);

  const { data } = useQuery<CommentsQueryData, CommentsQueryVariables>(COMMENTS_QUERY, {
    variables: { fileId: fileId ?? "" },
    skip: !fileId,
    // Keep pins in sync after add/resolve/delete from the sidebar tab.
    refetchWritePolicy: "merge",
  });

  const pinnedComments = useMemo(
    () =>
      (data?.comments ?? []).filter(
        (comment): comment is CommentGql & { x: number; y: number } =>
          comment.x !== null && comment.y !== null,
      ),
    [data?.comments],
  );

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

  if (!fileId || pinnedComments.length === 0) {
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
            aria-label={`Comment by ${comment.author?.name ?? "unknown"}: ${comment.body.slice(0, 60)}${comment.body.length > 60 ? "…" : ""}`}
            title={comment.body.slice(0, 120)}
          >
            {comment.resolved ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
