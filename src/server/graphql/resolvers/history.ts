import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { type FileRow, files, type SceneSnapshotRow, sceneSnapshots } from "@/db/schema";
import { gqlError } from "@/server/graphql/errors";
import type { FileOutput, SceneSnapshotOutput } from "@/server/graphql/types";
import { toFileOutput, toSnapshotOutput } from "@/server/graphql/types";
import { notifyRealtimeSceneSaved } from "@/server/realtime/notify";
import {
  emptyScene,
  readScene,
  type SceneDataInput,
  snapshotStorageKey,
  writeScene,
} from "@/server/scenes";
import { storage } from "@/server/storage";
import { requireOwnedFile } from "./files";

/** Snapshots kept per file (oldest are pruned). */
const MAX_SNAPSHOTS_PER_FILE = 20;

/** Minimum age of the newest snapshot before an auto-snapshot is written. */
const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

/** Shared select shape for snapshot rows joined with their owning file. */
const snapshotWithOwner = {
  snapshot: sceneSnapshots,
  fileUserId: files.userId,
};

const labelSchema = z
  .string()
  .trim()
  .min(1, "Label cannot be empty")
  .max(80, "Label is too long (80 characters max)");

/** Writes one snapshot blob + row (caller has already verified ownership). */
async function insertSnapshot(
  file: FileRow,
  scene: { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> },
  label: string | null,
): Promise<SceneSnapshotOutput> {
  const inserted = await db
    .insert(sceneSnapshots)
    .values({ fileId: file.id, label, elementCount: scene.elements.length })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw gqlError("INTERNAL_SERVER_ERROR", "Failed to save the version.");
  }
  await writeScene(snapshotStorageKey(file.userId, file.id, row.id), scene);

  // Prune: keep only the newest MAX_SNAPSHOTS_PER_FILE rows (and blobs).
  const all = await db
    .select({ id: sceneSnapshots.id })
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.fileId, file.id))
    .orderBy(desc(sceneSnapshots.createdAt), desc(sceneSnapshots.id));
  const excess = all.slice(MAX_SNAPSHOTS_PER_FILE).map((entry) => entry.id);
  if (excess.length > 0) {
    await db.delete(sceneSnapshots).where(inArray(sceneSnapshots.id, excess));
    for (const id of excess) {
      await storage.delete(snapshotStorageKey(file.userId, file.id, id));
    }
  }
  return toSnapshotOutput(row);
}

/** Loads a snapshot row and verifies the viewer owns its file. */
async function requireOwnedSnapshot(snapshotId: string, userId: string): Promise<SceneSnapshotRow> {
  const rows = await db
    .select(snapshotWithOwner)
    .from(sceneSnapshots)
    .innerJoin(files, eq(sceneSnapshots.fileId, files.id))
    .where(and(eq(sceneSnapshots.id, snapshotId), eq(files.userId, userId)))
    .limit(1);
  const row = rows[0]?.snapshot;
  if (!row) {
    throw gqlError("NOT_FOUND", "Version not found.");
  }
  return row;
}

/** Lists a viewer-owned file's snapshots, newest first (metadata only). */
export async function listSceneSnapshots(
  userId: string,
  fileId: string,
): Promise<SceneSnapshotOutput[]> {
  await requireOwnedFile(fileId, userId);
  const rows = await db
    .select()
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.fileId, fileId))
    .orderBy(desc(sceneSnapshots.createdAt), desc(sceneSnapshots.id));
  return rows.map(toSnapshotOutput);
}

/** Creates a labelled checkpoint of the file's currently stored scene. */
export async function createSceneSnapshot(
  userId: string,
  fileId: string,
  label: unknown,
): Promise<SceneSnapshotOutput> {
  const file = await requireOwnedFile(fileId, userId);
  let validatedLabel: string | null = null;
  if (typeof label === "string" && label.trim().length > 0) {
    const parsed = labelSchema.safeParse(label);
    if (!parsed.success) {
      throw gqlError("BAD_USER_INPUT", parsed.error.issues[0]?.message ?? "Invalid version label");
    }
    validatedLabel = parsed.data;
  }
  const scene = (await readScene(file.storageKey)) ?? emptyScene();
  return insertSnapshot(
    file,
    { elements: scene.elements, appState: scene.appState, files: scene.files },
    validatedLabel,
  );
}

/** Full contents of one snapshot (viewer-owned) for preview + restore. */
export async function readSceneSnapshot(
  userId: string,
  snapshotId: string,
): Promise<SceneDataInput> {
  const row = await requireOwnedSnapshot(snapshotId, userId);
  const scene = await readScene(snapshotStorageKey(userId, row.fileId, row.id));
  if (!scene) {
    throw gqlError("NOT_FOUND", "This version's contents are no longer available.");
  }
  return { elements: scene.elements, appState: scene.appState, files: scene.files };
}

/**
 * Restores a snapshot: safety-snapshots the current scene first (labelled
 * "Before restore", skipped when identical), then writes the snapshot blob
 * over the file's live scene. Live share viewers are notified to refetch.
 */
export async function restoreSceneSnapshot(
  userId: string,
  snapshotId: string,
): Promise<FileOutput> {
  const row = await requireOwnedSnapshot(snapshotId, userId);
  const file = await requireOwnedFile(row.fileId, userId);
  const snapshotScene = await readScene(snapshotStorageKey(userId, file.id, row.id));
  if (!snapshotScene) {
    throw gqlError("NOT_FOUND", "This version's contents are no longer available.");
  }
  const current = await readScene(file.storageKey);
  if (current) {
    const asStorable = (scene: typeof snapshotScene): SceneDataInput => ({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
    });
    const identical =
      JSON.stringify(asStorable(current)) === JSON.stringify(asStorable(snapshotScene));
    if (!identical) {
      await insertSnapshot(file, asStorable(current), "Before restore");
    }
  }
  await writeScene(file.storageKey, {
    elements: snapshotScene.elements,
    appState: snapshotScene.appState,
    files: snapshotScene.files,
  });
  const updated = await db
    .update(files)
    .set({ updatedAt: new Date() })
    .where(and(eq(files.id, file.id), eq(files.userId, userId)))
    .returning();
  if (file.shareToken) {
    void notifyRealtimeSceneSaved(file.shareToken, file.id);
  }
  return toFileOutput(updated[0] ?? file);
}

/** Deletes one snapshot (blob + row). */
export async function deleteSceneSnapshot(userId: string, snapshotId: string): Promise<boolean> {
  const row = await requireOwnedSnapshot(snapshotId, userId);
  await db.delete(sceneSnapshots).where(eq(sceneSnapshots.id, snapshotId));
  await storage.delete(snapshotStorageKey(userId, row.fileId, row.id));
  return true;
}

/**
 * Best-effort auto-snapshot after a successful save: at most one per
 * AUTO_SNAPSHOT_INTERVAL_MS, never for empty scenes, and never allowed to
 * fail the save itself.
 */
export async function autoSnapshotOnSave(file: FileRow, scene: SceneDataInput): Promise<void> {
  try {
    if (scene.elements.length === 0) {
      return;
    }
    const latest = await db
      .select({ createdAt: sceneSnapshots.createdAt })
      .from(sceneSnapshots)
      .where(eq(sceneSnapshots.fileId, file.id))
      .orderBy(desc(sceneSnapshots.createdAt))
      .limit(1);
    const last = latest[0]?.createdAt?.getTime() ?? 0;
    if (Date.now() - last < AUTO_SNAPSHOT_INTERVAL_MS) {
      return;
    }
    await insertSnapshot(file, scene, null);
  } catch {
    // Snapshots are an enhancement — a failure must never break autosave.
  }
}

/** Snapshot storage keys of a viewer's files (storage usage accounting). */
export async function snapshotKeysOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ fileId: sceneSnapshots.fileId, id: sceneSnapshots.id })
    .from(sceneSnapshots)
    .innerJoin(files, eq(sceneSnapshots.fileId, files.id))
    .where(eq(files.userId, userId));
  return rows.map((row) => snapshotStorageKey(userId, row.fileId, row.id));
}
