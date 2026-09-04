import { eq } from "drizzle-orm";

import { db } from "@/db";
import { libraryItems } from "@/db/schema";
import type { LibraryItemOutput, LibraryOutput } from "@/server/graphql/types";
import type { LibraryItemPayload } from "@/server/library";
import { readLibrary, writeLibrary } from "@/server/library";

function toItemOutput(item: LibraryItemPayload): LibraryItemOutput {
  return {
    id: item.id,
    status: item.status,
    created: new Date(item.created).toISOString(),
    name: item.name ?? null,
    elements: item.elements,
  };
}

/** Last-synced timestamp of the viewer's library (null when never saved). */
async function libraryUpdatedAt(userId: string): Promise<string | null> {
  const rows = await db
    .select({ updatedAt: libraryItems.updatedAt })
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId))
    .limit(1);
  return rows[0]?.updatedAt?.toISOString() ?? null;
}

/** The viewer's personal library (empty list when nothing saved yet). */
export async function getLibrary(userId: string): Promise<LibraryOutput> {
  const payload = await readLibrary(userId);
  const items = payload?.libraryItems ?? [];
  return {
    items: items.map(toItemOutput),
    updatedAt: await libraryUpdatedAt(userId),
  };
}

/** Validates + replaces the viewer's whole library (account sync). */
export async function saveLibrary(userId: string, data: unknown): Promise<LibraryOutput> {
  const items = await writeLibrary(userId, data);
  return {
    items: items.map(toItemOutput),
    updatedAt: await libraryUpdatedAt(userId),
  };
}
