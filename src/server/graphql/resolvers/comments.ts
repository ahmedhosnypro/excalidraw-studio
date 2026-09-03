import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { type CommentRow, comments, files, users } from "@/db/schema";
import { gqlError } from "@/server/graphql/errors";
import { type CommentOutput, toCommentOutput } from "@/server/graphql/types";
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
  author: { id: string; name: string } | null;
}

/** Shared select shape for comment rows joined with their author. */
const commentWithAuthor = {
  comment: comments,
  authorId: users.id,
  authorName: users.name,
};

function authorOf(row: { authorId: string | null; authorName: string | null }) {
  return row.authorId ? { id: row.authorId, name: row.authorName ?? "" } : null;
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

/** Lists comments of a viewer-owned file, oldest first, with author info. */
export async function listComments(userId: string, fileId: string): Promise<CommentOutput[]> {
  await requireOwnedFile(fileId, userId);
  const rows = await db
    .select(commentWithAuthor)
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.fileId, fileId))
    .orderBy(comments.createdAt);
  return rows.map((row) => toCommentOutput(row.comment, authorOf(row)));
}

export async function addComment(
  userId: string,
  authorName: string,
  fileId: string,
  body: unknown,
  x: unknown,
  y: unknown,
): Promise<CommentOutput> {
  await requireOwnedFile(fileId, userId);
  const inserted = await db
    .insert(comments)
    .values({
      fileId,
      userId,
      body: parseBody(body),
      x: parseCoordinate(x),
      y: parseCoordinate(y),
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to add the comment.");
  }
  return toCommentOutput(row, { id: userId, name: authorName });
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

export async function updateComment(
  userId: string,
  commentId: string,
  body: unknown,
): Promise<CommentOutput> {
  const found = await fetchCommentWithAuthor(commentId);
  if (!found || found.comment.userId !== userId) {
    throw gqlError("FORBIDDEN", "You can only edit your own comments.");
  }
  const updated = await db
    .update(comments)
    .set({ body: parseBody(body), updatedAt: new Date() })
    .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
    .returning();
  const row = updated[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to update the comment.");
  }
  return toCommentOutput(row, found.author);
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
  const updated = await db
    .update(comments)
    .set({ resolved, updatedAt: new Date() })
    .where(eq(comments.id, commentId))
    .returning();
  const row = updated[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to update the comment.");
  }
  return toCommentOutput(row, found.author);
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
  await db.delete(comments).where(eq(comments.id, commentId));
  return true;
}
