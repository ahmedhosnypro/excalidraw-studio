import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { libraryItems } from "@/db/schema";
import { gqlError } from "@/server/graphql/errors";
import { storage } from "@/server/storage";

/**
 * Personal element library — server-side persistence for the Excalidraw
 * library (excalidraw+ paid parity: items follow the account, not the
 * browser). The whole list is stored as one JSON blob mirroring the
 * client-side library shape so `onLibraryChange` payloads round-trip 1:1.
 */

const LIBRARY_SOURCE = "excalidraw-studio";
const LIBRARY_VERSION = 2;

/** Library items kept per account (mirrors excalidraw.com's published cap). */
const MAX_LIBRARY_ITEMS = 200;

/** Elements allowed inside a single library item. */
const MAX_ELEMENTS_PER_ITEM = 200;

/** Hard cap on the serialized library blob (2 MB). */
const MAX_LIBRARY_BYTES = 2 * 1024 * 1024;

/** One validated library item (v2 shape). */
export interface LibraryItemPayload {
  id: string;
  status: "published" | "unpublished";
  created: number;
  name?: string | null;
  elements: unknown[];
}

export interface LibraryPayload {
  type: "excalidraw-library";
  version: number;
  source: string;
  libraryItems: LibraryItemPayload[];
}

const elementSchema = z.record(z.string(), z.unknown());

const libraryItemSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(["published", "unpublished"]).default("unpublished"),
  created: z.number().int().nonnegative(),
  name: z.string().trim().max(120).optional().nullable(),
  elements: z.array(elementSchema).min(1).max(MAX_ELEMENTS_PER_ITEM),
});

const libraryInputSchema = z.array(z.unknown()).max(MAX_LIBRARY_ITEMS);

/** Validates an untrusted client-supplied library item list. */
function validateLibraryItems(data: unknown): LibraryItemPayload[] {
  const parsed = libraryInputSchema.safeParse(data);
  if (!parsed.success) {
    throw gqlError("BAD_USER_INPUT", `Library is too large (${MAX_LIBRARY_ITEMS} items max).`);
  }
  const items: LibraryItemPayload[] = [];
  const seenIds = new Set<string>();
  for (const [index, raw] of parsed.data.entries()) {
    const item = libraryItemSchema.safeParse(raw);
    if (!item.success) {
      throw gqlError(
        "BAD_USER_INPUT",
        `Library item ${index + 1} is invalid: ${item.error.issues[0]?.message ?? "unexpected shape"}`,
      );
    }
    if (seenIds.has(item.data.id)) {
      throw gqlError("BAD_USER_INPUT", `Library item ${index + 1} has a duplicate id.`);
    }
    seenIds.add(item.data.id);
    items.push({
      id: item.data.id,
      status: item.data.status,
      created: item.data.created,
      name: item.data.name ?? null,
      elements: item.data.elements,
    });
  }
  return items;
}

/** Storage location of a user's library blob. */
function libraryStorageKey(userId: string): string {
  return `library/${userId}/items.json`;
}

/** Reads the stored library blob (null when the user has none yet). */
export async function readLibrary(userId: string): Promise<LibraryPayload | null> {
  const rows = await db.select().from(libraryItems).where(eq(libraryItems.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const raw = await storage.get(row.storageKey);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as LibraryPayload;
  } catch {
    return null;
  }
}

/** Validates + persists the whole library (blob + metadata row). */
export async function writeLibrary(userId: string, data: unknown): Promise<LibraryItemPayload[]> {
  const items = validateLibraryItems(data);
  const payload: LibraryPayload = {
    type: "excalidraw-library",
    version: LIBRARY_VERSION,
    source: LIBRARY_SOURCE,
    libraryItems: items,
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_LIBRARY_BYTES) {
    throw gqlError("BAD_USER_INPUT", "Library is too large to sync (2 MB limit).");
  }
  const storageKey = libraryStorageKey(userId);
  await storage.put(storageKey, serialized);
  const existing = await db
    .select({ userId: libraryItems.userId })
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(libraryItems)
      .set({ itemCount: items.length, updatedAt: new Date() })
      .where(eq(libraryItems.userId, userId));
  } else {
    await db.insert(libraryItems).values({ userId, storageKey, itemCount: items.length });
  }
  return items;
}

/** Library blob key of a user (storage usage accounting). */
export async function libraryKeyOf(userId: string): Promise<string | null> {
  const rows = await db
    .select({ storageKey: libraryItems.storageKey })
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId))
    .limit(1);
  return rows[0]?.storageKey ?? null;
}
