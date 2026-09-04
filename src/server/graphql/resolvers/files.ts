import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { type FileRow, files } from "@/db/schema";
import { gqlError } from "@/server/graphql/errors";
import { autoSnapshotOnSave, snapshotKeysOf } from "@/server/graphql/resolvers/history";
import type { FileOutput, StorageUsageOutput } from "@/server/graphql/types";
import { toFileOutput } from "@/server/graphql/types";
import {
  copyScene,
  emptyScene,
  type SceneDataInput,
  sceneStorageKey,
  validateSceneData,
  writeScene,
} from "@/server/scenes";
import { storage } from "@/server/storage";

const fileNameSchema = z
  .string()
  .trim()
  .min(1, "File name is required")
  .max(200, "File name is too long (200 characters max)");

export function parseFileName(value: unknown): string {
  const parsed = fileNameSchema.safeParse(value);
  if (!parsed.success) {
    throw gqlError("BAD_USER_INPUT", parsed.error.issues[0]?.message ?? "Invalid file name");
  }
  return parsed.data;
}

/** Fetches a file row owned by the user or throws NOT_FOUND. */
export async function requireOwnedFile(fileId: string, userId: string): Promise<FileRow> {
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw gqlError("NOT_FOUND", "File not found.");
  }
  return row;
}

/** Creates a file row plus its (initial or empty) scene blob. */
export async function createFile(
  userId: string,
  name: string,
  initialScene?: SceneDataInput,
): Promise<FileOutput> {
  const inserted = await db
    .insert(files)
    .values({ userId, name, storageKey: "pending" })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to create the file.");
  }

  const storageKey = sceneStorageKey(userId, row.id);
  await writeScene(storageKey, initialScene ?? emptyScene());
  const updated = await db
    .update(files)
    .set({ storageKey })
    .where(eq(files.id, row.id))
    .returning();
  return toFileOutput(updated[0] ?? { ...row, storageKey });
}

export async function renameFile(
  userId: string,
  fileId: string,
  name: string,
): Promise<FileOutput> {
  await requireOwnedFile(fileId, userId);
  const updated = await db
    .update(files)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();
  const row = updated[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to rename the file.");
  }
  return toFileOutput(row);
}

export async function deleteFile(userId: string, fileId: string): Promise<boolean> {
  const row = await requireOwnedFile(fileId, userId);
  await storage.delete(row.storageKey);
  await db.delete(files).where(and(eq(files.id, fileId), eq(files.userId, userId)));
  return true;
}

export async function duplicateFile(userId: string, fileId: string): Promise<FileOutput> {
  const row = await requireOwnedFile(fileId, userId);
  const copy = await createFile(userId, `Copy of ${row.name}`);
  await copyScene(row.storageKey, sceneStorageKey(userId, copy.id));
  return copy;
}

export async function saveScene(
  userId: string,
  fileId: string,
  data: unknown,
): Promise<FileOutput> {
  const row = await requireOwnedFile(fileId, userId);
  const scene = validateSceneData(data);
  await writeScene(row.storageKey, scene);
  const updated = await db
    .update(files)
    .set({ updatedAt: new Date() })
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();
  // Version history: periodically checkpoint the saved scene (best-effort,
  // throttled server-side — at most one snapshot every few minutes).
  await autoSnapshotOnSave(updated[0] ?? row, scene);
  return toFileOutput(updated[0] ?? row);
}

export async function migrateGuestScene(
  userId: string,
  name: string | undefined,
  data: unknown,
): Promise<FileOutput> {
  const scene = validateSceneData(data);
  return createFile(userId, parseFileName(name ?? "My drawing"), scene);
}

/** Total bytes + file count of the user's stored scenes (storage indicator). */
export async function storageUsageOf(userId: string): Promise<StorageUsageOutput> {
  const rows = await db
    .select({ storageKey: files.storageKey })
    .from(files)
    .where(eq(files.userId, userId));
  let bytes = 0;
  for (const row of rows) {
    bytes += (await storage.size(row.storageKey)) ?? 0;
  }
  // Version-history snapshots live in the same storage adapter — count them
  // so the indicator reflects real disk usage.
  for (const key of await snapshotKeysOf(userId)) {
    bytes += (await storage.size(key)) ?? 0;
  }
  return { bytes, fileCount: rows.length };
}
