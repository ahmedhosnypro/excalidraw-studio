import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { type CommentRow, commentReactions, comments, files, users } from "@/db/schema";
import { gqlError } from "@/server/graphql/errors";
import {
  type CommentAuthorOutput,
  type CommentOutput,
  type CommentReactionOutput,
  toCommentOutput,
} from "@/server/graphql/types";
import { notifyRealtimeCommentAdded } from "@/server/realtime/notify";
import { requireOwnedFile } from "./files";

const bodySchema = z
  .string()
  .trim()
  .min(1, "Comment body is required")
  .max(5000, "Comment is too long (5000 characters max)");

const coordinateSchema = z.number().finite().nullable();

function parseBody(value: unknown): string {
  const parsed = bodySchema.safeParse(value);
  if (!parsed.success) {
    throw gqlError("BAD_USER_INPUT", parsed.error.issues[0]?.message ?? "Invalid comment body");
  }
  return parsed.data;
}

function parseCoordinate(value: unknown): number | null {
  const parsed = coordinateSchema.safeParse(value ?? null);
  return parsed.success ? parsed.data : null;
}

interface CommentWithAuthor {
  comment: CommentRow;
  author: CommentAuthorOutput | null;
}

/** Shared select shape for comment rows joined with their author. */
const commentWithAuthor = {
  comment: comments,
  authorId: users.id,
  authorName: users.name,
  authorIsGuest: users.isGuest,
};

function authorOf(row: {
  authorId: string | null;
  authorName: string | null;
  authorIsGuest: boolean | null;
}) {
  return row.authorId
    ? { id: row.authorId, name: row.authorName ?? "", isGuest: row.authorIsGuest ?? false }
    : null;
}

async function fetchCommentWithAuthor(commentId: string): Promise<CommentWithAuthor | null> {
  const rows = await db
    .select(commentWithAuthor)
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.id, commentId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return { comment: row.comment, author: authorOf(row) };
}

/** Lists comments of a file, oldest first, with author info and reactions. */
export async function listFileComments(
  fileId: string,
  viewerId: string | null = null,
): Promise<CommentOutput[]> {
  const rows = await db
    .select(commentWithAuthor)
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.fileId, fileId))
    .orderBy(comments.createdAt);
  const reactionMap = await fetchReactions(
    rows.map((row) => row.comment.id),
    viewerId,
  );
  return rows.map((row) =>
    toCommentOutput(row.comment, authorOf(row), reactionMap.get(row.comment.id) ?? []),
  );
}

/** Lists comments of a viewer-owned file (thin ownership-guarded wrapper). */
export async function listComments(userId: string, fileId: string): Promise<CommentOutput[]> {
  await requireOwnedFile(fileId, userId);
  return listFileComments(fileId, userId);
}

/**
 * Validates a `parentId` for a new reply: the parent must exist, live on the
 * same file, and itself be a top-level comment (threads nest exactly once).
 */
async function requireValidParent(fileId: string, parentId: string): Promise<CommentRow> {
  const rows = await db.select().from(comments).where(eq(comments.id, parentId)).limit(1);
  const parent = rows[0];
  if (!parent) {
    throw gqlError("NOT_FOUND", "The comment you are replying to no longer exists.");
  }
  if (parent.fileId !== fileId) {
    throw gqlError("BAD_USER_INPUT", "Replies must stay within the same file.");
  }
  if (parent.parentId !== null) {
    throw gqlError(
      "BAD_USER_INPUT",
      "Replies only attach to top-level comments — reply to the thread instead.",
    );
  }
  return parent;
}

/** Inserts a comment row after validating the (optional) thread parent. */
export async function insertComment(input: {
  fileId: string;
  userId: string;
  author: CommentAuthorOutput;
  body: unknown;
  x: unknown;
  y: unknown;
  parentId: unknown;
}): Promise<CommentOutput> {
  const { fileId, userId, author, body, x, y, parentId } = input;
  let validatedParentId: string | null = null;
  if (typeof parentId === "string" && parentId.length > 0) {
    await requireValidParent(fileId, parentId);
    validatedParentId = parentId;
  }
  const inserted = await db
    .insert(comments)
    .values({
      fileId,
      userId,
      body: parseBody(body),
      x: parseCoordinate(x),
      y: parseCoordinate(y),
      parentId: validatedParentId,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to add the comment.");
  }
  return toCommentOutput(row, author);
}

export async function addComment(
  userId: string,
  authorName: string,
  fileId: string,
  body: unknown,
  x: unknown,
  y: unknown,
  parentId: unknown,
): Promise<CommentOutput> {
  const file = await requireOwnedFile(fileId, userId);
  const comment = await insertComment({
    fileId,
    userId,
    author: { id: userId, name: authorName, isGuest: false },
    body,
    x,
    y,
    parentId,
  });
  // Notify live viewers of the shared link (they refetch the thread list).
  if (file.shareToken) {
    void notifyRealtimeCommentAdded({
      token: file.shareToken,
      authorName,
      isGuest: false,
      body: comment.body,
    });
  }
  return comment;
}

async function requireCommentForUpdate(
  commentId: string,
  userId: string,
): Promise<CommentWithAuthor> {
  const found = await fetchCommentWithAuthor(commentId);
  if (!found) {
    throw gqlError("NOT_FOUND", "Comment not found.");
  }
  // Authors may edit their own comments; file owners may moderate any comment.
  const isAuthor = found.comment.userId === userId;
  const ownsFile = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.id, found.comment.fileId), eq(files.userId, userId)))
    .limit(1);
  if (!isAuthor && ownsFile.length === 0) {
    throw gqlError("FORBIDDEN", "You cannot modify this comment.");
  }
  return found;
}

/** Writes a patch onto a comment row and returns it with reactions. */
async function updateCommentRow(
  commentId: string,
  patch: Partial<CommentRow>,
  found: CommentWithAuthor,
  viewerId: string,
): Promise<CommentOutput> {
  const updated = await db
    .update(comments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(comments.id, commentId))
    .returning();
  const row = updated[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to update the comment.");
  }
  return toCommentOutput(row, found.author, await reactionsOf(commentId, viewerId));
}

export async function updateComment(
  userId: string,
  commentId: string,
  body: unknown,
): Promise<CommentOutput> {
  const found = await fetchCommentWithAuthor(commentId);
  if (!found || found.comment.userId !== userId) {
    throw gqlError("FORBIDDEN", "You can only edit your own comments.");
  }
  return updateCommentRow(commentId, { body: parseBody(body) }, found, userId);
}

export async function resolveComment(
  userId: string,
  commentId: string,
  resolved: unknown,
): Promise<CommentOutput> {
  const found = await requireCommentForUpdate(commentId, userId);
  if (typeof resolved !== "boolean") {
    throw gqlError("BAD_USER_INPUT", "`resolved` must be a boolean.");
  }
  return updateCommentRow(commentId, { resolved }, found, userId);
}

export async function deleteComment(userId: string, commentId: string): Promise<boolean> {
  const found = await fetchCommentWithAuthor(commentId);
  if (!found) {
    throw gqlError("NOT_FOUND", "Comment not found.");
  }
  const isAuthor = found.comment.userId === userId;
  if (!isAuthor) {
    // File owners may moderate (delete) any comment on their file.
    await requireOwnedFile(found.comment.fileId, userId);
  }
  // Replies are removed together with their thread root (the DB also has a
  // cascade FK, but deleting explicitly keeps it correct even when the
  // foreign_keys pragma is off).
  await db.delete(commentReactions).where(eq(commentReactions.commentId, commentId));
  await db.delete(comments).where(eq(comments.parentId, commentId));
  await db.delete(comments).where(eq(comments.id, commentId));
  return true;
}

// ---------------------------------------------------------------------------
// Emoji reactions
// ---------------------------------------------------------------------------

/** Fixed allow-list of reaction emojis (storage stays tight + predictable). */
const ALLOWED_REACTION_EMOJIS = ["👍", "❤️", "🎉", "😂", "😮", "✅"] as const;

/**
 * Batch-loads reaction aggregates for a set of comments. `mine` reflects the
 * requesting viewer (null = anonymous reader, e.g. token-less shared views).
 */
async function fetchReactions(
  commentIds: string[],
  viewerId: string | null,
): Promise<Map<string, CommentReactionOutput[]>> {
  const map = new Map<string, CommentReactionOutput[]>();
  if (commentIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      commentId: commentReactions.commentId,
      emoji: commentReactions.emoji,
      userId: commentReactions.userId,
    })
    .from(commentReactions)
    .where(inArray(commentReactions.commentId, commentIds));
  for (const row of rows) {
    const list = map.get(row.commentId) ?? [];
    const existing = list.find((reaction) => reaction.emoji === row.emoji);
    if (existing) {
      existing.count += 1;
      existing.mine = existing.mine || row.userId === viewerId;
    } else {
      list.push({ emoji: row.emoji, count: 1, mine: row.userId === viewerId });
    }
    map.set(row.commentId, list);
  }
  // Stable, count-descending order for display.
  for (const list of map.values()) {
    list.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  }
  return map;
}

/** Loads a single comment's reactions (aggregated, viewer-aware). */
async function reactionsOf(commentId: string, viewerId: string): Promise<CommentReactionOutput[]> {
  const map = await fetchReactions([commentId], viewerId);
  return map.get(commentId) ?? [];
}

function parseReactionEmoji(value: unknown): string {
  if (
    typeof value !== "string" ||
    !ALLOWED_REACTION_EMOJIS.includes(value as (typeof ALLOWED_REACTION_EMOJIS)[number])
  ) {
    throw gqlError("BAD_USER_INPUT", "Unsupported reaction emoji.");
  }
  return value;
}

/**
 * Toggles a viewer's emoji reaction on a comment (adds / removes). The viewer
 * must be able to see the comment: the file owner, or a guest identity of a
 * shared file (guest identities only exist for files shared with them).
 * Returns the updated comment (reactions included).
 */
export async function toggleCommentReaction(
  userId: string,
  commentId: string,
  emoji: unknown,
): Promise<CommentOutput> {
  const parsedEmoji = parseReactionEmoji(emoji);
  const found = await fetchCommentWithAuthor(commentId);
  if (!found) {
    throw gqlError("NOT_FOUND", "Comment not found.");
  }
  // Access: file owner, comment author, or a guest viewer of a shared file.
  const ownsFile =
    (
      await db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.id, found.comment.fileId), eq(files.userId, userId)))
        .limit(1)
    ).length > 0;
  const isAuthor = found.comment.userId === userId;
  const viewerRows = await db
    .select({ isGuest: users.isGuest })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const isGuestViewer = viewerRows[0]?.isGuest === true;
  if (!ownsFile && !isAuthor && !isGuestViewer) {
    throw gqlError("FORBIDDEN", "You cannot react to this comment.");
  }

  const existing = await db
    .select({ id: commentReactions.id })
    .from(commentReactions)
    .where(
      and(
        eq(commentReactions.commentId, commentId),
        eq(commentReactions.userId, userId),
        eq(commentReactions.emoji, parsedEmoji),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db.delete(commentReactions).where(eq(commentReactions.id, existing[0].id));
  } else {
    await db.insert(commentReactions).values({ commentId, userId, emoji: parsedEmoji });
  }
  return toCommentOutput(found.comment, found.author, await reactionsOf(commentId, userId));
}
