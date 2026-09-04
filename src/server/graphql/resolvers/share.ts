import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { type FileRow, files, users } from "@/db/schema";
import { gqlError } from "@/server/graphql/errors";
import type { CommentOutput, FileOutput, SceneDataOutput } from "@/server/graphql/types";
import { toFileOutput } from "@/server/graphql/types";
import { notifyRealtimeCommentAdded, notifyRealtimeReactions } from "@/server/realtime/notify";
import { emptyScene, readScene } from "@/server/scenes";
import { insertComment, listFileComments, toggleCommentReaction } from "./comments";
import { requireOwnedFile } from "./files";

const guestNameSchema = z
  .string()
  .trim()
  .min(1, "Please add your name before posting.")
  .max(60, "Name is too long (60 characters max)");

const shareTokenSchema = z.string().trim().min(10).max(128);

// ---------------------------------------------------------------------------
// Share link lifecycle (owner actions)
// ---------------------------------------------------------------------------

/** Generates a URL-safe secret share token. */
function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Writes the share token column (null = disabled) on an owned file. */
async function setShareToken(
  userId: string,
  fileId: string,
  shareToken: string | null,
): Promise<FileOutput> {
  await requireOwnedFile(fileId, userId);
  const updated = await db
    .update(files)
    .set({ shareToken, updatedAt: new Date() })
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();
  const next = updated[0];
  if (!next) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to update the share link.");
  }
  return toFileOutput(next);
}

export async function createShareLink(userId: string, fileId: string): Promise<FileOutput> {
  const row = await requireOwnedFile(fileId, userId);
  if (row.shareToken) {
    return toFileOutput(row);
  }
  return setShareToken(userId, fileId, newShareToken());
}

export async function revokeShareLink(userId: string, fileId: string): Promise<FileOutput> {
  return setShareToken(userId, fileId, null);
}

// ---------------------------------------------------------------------------
// Public (token-scoped) reads
// ---------------------------------------------------------------------------

/** Resolves the file a share token points to (throws NOT_FOUND when invalid). */
async function requireSharedFile(token: unknown): Promise<FileRow> {
  const parsed = shareTokenSchema.safeParse(token);
  if (!parsed.success) {
    throw gqlError("NOT_FOUND", "This share link is invalid or has been revoked.");
  }
  const rows = await db.select().from(files).where(eq(files.shareToken, parsed.data)).limit(1);
  const row = rows[0];
  if (!row) {
    throw gqlError("NOT_FOUND", "This share link is invalid or has been revoked.");
  }
  return row;
}

export interface SharedFileSummary {
  id: string;
  name: string;
  ownerName: string;
  updatedAt: string;
}

export async function sharedFileSummary(token: unknown): Promise<SharedFileSummary> {
  const file = await requireSharedFile(token);
  const ownerRows = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, file.userId))
    .limit(1);
  return {
    id: file.id,
    name: file.name,
    ownerName: ownerRows[0]?.name ?? "someone",
    updatedAt: file.updatedAt.toISOString(),
  };
}

export async function sharedScene(token: unknown): Promise<SceneDataOutput> {
  const file = await requireSharedFile(token);
  const scene = (await readScene(file.storageKey)) ?? emptyScene();
  return {
    elements: scene.elements,
    appState: scene.appState,
    files: scene.files,
  };
}

export async function sharedComments(
  token: unknown,
  viewerGuestName: unknown,
): Promise<CommentOutput[]> {
  const file = await requireSharedFile(token);
  // Resolve the guest identity (read-only) so reaction "mine" flags reflect
  // the guest viewer's own reactions.
  let viewerId: string | null = null;
  if (typeof viewerGuestName === "string" && viewerGuestName.trim().length > 0) {
    const digest = createHash("sha256")
      .update(`${file.id}:${viewerGuestName.trim().toLowerCase()}`)
      .digest("hex");
    const email = `guest+${digest.slice(0, 16)}@guests.studio`;
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    viewerId = rows[0]?.id ?? null;
  }
  return listFileComments(file.id, viewerId);
}

// ---------------------------------------------------------------------------
// Guest commenting
// ---------------------------------------------------------------------------

/**
 * Simple in-memory sliding-window rate limiter for the public guest comment
 * mutation (abuse protection; personal-scale deployments only).
 */
const GUEST_RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 10 } as const;
const guestHits = new Map<string, number[]>();

function checkGuestRateLimit(clientKey: string): void {
  const now = Date.now();
  const cutoff = now - GUEST_RATE_LIMIT.windowMs;
  const hits = (guestHits.get(clientKey) ?? []).filter((time) => time > cutoff);
  if (hits.length >= GUEST_RATE_LIMIT.max) {
    throw gqlError(
      "BAD_USER_INPUT",
      "Too many comments from this network — please try again in a few minutes.",
    );
  }
  hits.push(now);
  guestHits.set(clientKey, hits);
  if (guestHits.size > 1000) {
    for (const [key, times] of guestHits) {
      if (times.every((time) => time <= cutoff)) {
        guestHits.delete(key);
      }
    }
  }
}

/** Unusable password hash for guest identities (they can never sign in). */
const GUEST_PASSWORD_HASH = "!guest-no-login";

/**
 * Finds (or creates) the deterministic guest identity for a display name on a
 * given shared file — the same name on the same file maps to one user row, so
 * guest threads read consistently.
 */
async function findOrCreateGuestUser(fileId: string, name: string): Promise<string> {
  const digest = createHash("sha256").update(`${fileId}:${name.toLowerCase()}`).digest("hex");
  const email = `guest+${digest.slice(0, 16)}@guests.studio`;
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    return existing[0].id;
  }
  const inserted = await db
    .insert(users)
    .values({ email, name, passwordHash: GUEST_PASSWORD_HASH, isGuest: true })
    .returning({ id: users.id });
  const row = inserted[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to create the guest identity.");
  }
  return row.id;
}

/** Resolves a validated guest identity for a share token (rate-limited). */
async function requireGuestIdentity(
  file: FileRow,
  guestName: unknown,
  clientKey: string,
): Promise<string> {
  checkGuestRateLimit(clientKey);
  const parsedName = guestNameSchema.safeParse(guestName);
  if (!parsedName.success) {
    throw gqlError("BAD_USER_INPUT", parsedName.error.issues[0]?.message ?? "Invalid guest name.");
  }
  return findOrCreateGuestUser(file.id, parsedName.data);
}

export async function addGuestComment(
  token: unknown,
  guestName: unknown,
  body: unknown,
  x: unknown,
  y: unknown,
  parentId: unknown,
  clientKey: string,
): Promise<CommentOutput> {
  const file = await requireSharedFile(token);
  const guestId = await requireGuestIdentity(file, guestName, clientKey);
  const displayName = typeof guestName === "string" ? guestName.trim().slice(0, 60) : "guest";
  const comment = await insertComment({
    fileId: file.id,
    userId: guestId,
    author: { id: guestId, name: displayName, isGuest: true },
    body,
    x,
    y,
    parentId,
  });
  // Notify the owner's live session (unread badge / toast) — fire-and-forget.
  if (file.shareToken) {
    void notifyRealtimeCommentAdded({
      token: file.shareToken,
      authorName: displayName,
      isGuest: true,
      body: comment.body,
    });
  }
  return comment;
}

/** Guest-side emoji reaction toggle (token-scoped, name-keyed identity). */
export async function toggleGuestCommentReaction(
  token: unknown,
  guestName: unknown,
  commentId: string,
  emoji: unknown,
  clientKey: string,
): Promise<CommentOutput> {
  const file = await requireSharedFile(token);
  const guestId = await requireGuestIdentity(file, guestName, clientKey);
  const comment = await toggleCommentReaction(guestId, commentId, emoji);
  // The owner's live session refetches so they see the guest's reaction.
  if (file.shareToken) {
    void notifyRealtimeReactions(file.shareToken);
  }
  return comment;
}
