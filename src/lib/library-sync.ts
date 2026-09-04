"use client";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { LibraryItemGql, LibraryQueryData } from "@/lib/graphql/operations";

/**
 * Personal library persistence (excalidraw+ paid parity).
 *
 * - Signed in: the whole library syncs to the account (server blob), so items
 *   follow the user across devices and browsers.
 * - Guest: the library persists to localStorage for this browser only.
 * - First sign-in: guest items are merged into the account library so nothing
 *   is lost when upgrading.
 */

const GUEST_LIBRARY_KEY = "studio:guest-library";

/** Client-side mirror of Excalidraw's library item (v2 shape). */
export interface StudioLibraryItem {
  id: string;
  status: "published" | "unpublished";
  created: number;
  name?: string;
  elements: ExcalidrawElement[];
}

/** Maps a server library payload back to the client item shape. */
export function libraryDataToItems(data: LibraryQueryData | undefined): StudioLibraryItem[] {
  const items = data?.library?.items;
  if (!items) {
    return [];
  }
  return items.map((item: LibraryItemGql) => ({
    id: item.id,
    status: item.status === "published" ? "published" : "unpublished",
    created: Date.parse(item.created) || Date.now(),
    ...(item.name ? { name: item.name } : {}),
    elements: item.elements as ExcalidrawElement[],
  }));
}

/** Cheap canonical form used to compare two library snapshots. */
export function libraryFingerprint(items: StudioLibraryItem[]): string {
  return JSON.stringify(items, (key, value) =>
    key === "created" ? undefined : (value as unknown),
  );
}

// ---------------------------------------------------------------------------
// Guest library (localStorage)
// ---------------------------------------------------------------------------

export function saveGuestLibrary(items: StudioLibraryItem[]): void {
  try {
    localStorage.setItem(GUEST_LIBRARY_KEY, JSON.stringify({ items, savedAt: Date.now() }));
  } catch {
    // localStorage full/unavailable — guest library stays in memory.
  }
}

export function loadGuestLibrary(): StudioLibraryItem[] {
  try {
    const raw = localStorage.getItem(GUEST_LIBRARY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { items?: unknown };
    return Array.isArray(parsed.items) ? (parsed.items as StudioLibraryItem[]) : [];
  } catch {
    return [];
  }
}

export function clearGuestLibrary(): void {
  try {
    localStorage.removeItem(GUEST_LIBRARY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Merges guest items into an existing account library (first sign-in).
 * Server items win on id collisions; guest items are appended otherwise.
 * Returns null when there is nothing to merge.
 */
export function mergeGuestIntoAccount(
  accountItems: StudioLibraryItem[],
  guestItems: StudioLibraryItem[],
): StudioLibraryItem[] | null {
  if (guestItems.length === 0) {
    return null;
  }
  const knownIds = new Set(accountItems.map((item) => item.id));
  const additions = guestItems.filter((item) => !knownIds.has(item.id));
  if (additions.length === 0) {
    return accountItems.length > 0 ? null : guestItems;
  }
  return [...additions, ...accountItems];
}

// ---------------------------------------------------------------------------
// Sync-toast coordination
// ---------------------------------------------------------------------------

/**
 * Set by flows that already show their own feedback (e.g. the palette's
 * "Add selection to library" command) so the sync hook skips its success
 * toast for the next save — avoids double toasting.
 */
let suppressNextSyncToast = false;

export function markSyncToastSuppressed(): void {
  suppressNextSyncToast = true;
}

export function consumeSyncToastSuppression(): boolean {
  const value = suppressNextSyncToast;
  suppressNextSyncToast = false;
  return value;
}
