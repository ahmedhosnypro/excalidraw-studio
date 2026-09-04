"use client";

import { useApolloClient } from "@apollo/client/react";
import type { ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { LibraryQueryData } from "@/lib/graphql/operations";
import { LIBRARY_QUERY, SAVE_LIBRARY_MUTATION } from "@/lib/graphql/operations";
import {
  clearGuestLibrary,
  consumeSyncToastSuppression,
  libraryDataToItems,
  libraryFingerprint,
  loadGuestLibrary,
  mergeGuestIntoAccount,
  type StudioLibraryItem,
  saveGuestLibrary,
} from "@/lib/library-sync";
import { useEditorStore } from "@/store/editor-store";

/** Debounce for account library saves (Excalidraw fires updates in bursts). */
const SYNC_DEBOUNCE_MS = 1200;

/** Clones readonly Excalidraw items into the mutable client shape. */
function fromLibraryItems(items: LibraryItems): StudioLibraryItem[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    created: item.created,
    ...(item.name ? { name: item.name } : {}),
    elements: [...item.elements] as StudioLibraryItem["elements"],
  }));
}

/**
 * Personal library persistence (excalidraw+ paid parity).
 *
 * - Signed in: the whole library syncs to the account (server blob), so items
 *   follow the user across devices and browsers.
 * - Guest: the library persists to localStorage for this browser only.
 * - First sign-in: guest items are merged into the account library.
 *
 * Loading is imperative (`updateLibrary`) so it works both on mount and on
 * identity switches — `initialData.libraryItems` would only apply once.
 */
export function useLibrarySync(userId: string | null): {
  onLibraryChange: (items: LibraryItems) => void;
} {
  const client = useApolloClient();
  const { toast } = useToast();
  const excalidrawApi = useEditorStore((state) => state.excalidrawApi);

  // Fingerprint of the last library state we persisted/loaded — suppresses
  // the echo `onLibraryChange` Excalidraw fires after applying loaded items.
  const lastSyncedRef = useRef<string>("");
  // Fingerprint behind the pending debounce (guards double-scheduling).
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // (api instance, identity) pair the in-canvas library was loaded for.
  const loadedApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const loadedIdentityRef = useRef<string | null | undefined>(undefined);

  const loadItems = useCallback(async (): Promise<LibraryItems> => {
    if (!userId) {
      const guestItems = loadGuestLibrary();
      lastSyncedRef.current = libraryFingerprint(guestItems);
      return guestItems;
    }
    try {
      const result = await client.query<LibraryQueryData>({
        query: LIBRARY_QUERY,
        fetchPolicy: "network-only",
      });
      const accountItems = libraryDataToItems(result.data);
      // First sign-in: fold guest items into the account library (server
      // items win on id collisions) and clear the guest copy afterwards.
      const merged = mergeGuestIntoAccount(accountItems, loadGuestLibrary());
      const items = merged ?? accountItems;
      if (merged) {
        clearGuestLibrary();
        // The merged items can share the guest fingerprint (pure migration)
        // — reset the echo guard so applying them triggers the migration save.
        lastSyncedRef.current = "";
      } else {
        lastSyncedRef.current = libraryFingerprint(items);
      }
      return items;
    } catch {
      // Library load failure is non-fatal — fall back to an empty library
      // rather than blocking the editor.
      return [];
    }
  }, [client, userId]);

  const flushSave = useCallback(
    async (items: LibraryItems): Promise<void> => {
      const studioItems = fromLibraryItems(items);
      try {
        await client.mutate({
          mutation: SAVE_LIBRARY_MUTATION,
          variables: { items: studioItems },
        });
        lastSyncedRef.current = libraryFingerprint(studioItems);
        if (!consumeSyncToastSuppression()) {
          toast({
            title: "Library synced",
            description:
              studioItems.length === 1
                ? "1 item saved to your account"
                : `${studioItems.length} items saved to your account`,
          });
        }
      } catch (error) {
        toast({
          title: "Library sync failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [client, toast],
  );

  const onLibraryChange = useCallback(
    (items: LibraryItems): void => {
      const studioItems = fromLibraryItems(items);
      const fingerprint = libraryFingerprint(studioItems);

      // Echo of the state we just loaded/saved — nothing to write. Checked
      // before the guest branch too, so the post-load notification never
      // rewrites (or briefly wipes) the stored library.
      if (fingerprint === lastSyncedRef.current || fingerprint === pendingRef.current) {
        return;
      }

      if (!userId) {
        saveGuestLibrary(studioItems);
        lastSyncedRef.current = fingerprint;
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      pendingRef.current = fingerprint;
      // Capture the snapshot the timer will save (later changes re-schedule).
      const snapshot = items;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingRef.current = null;
        void flushSave(snapshot);
      }, SYNC_DEBOUNCE_MS);
    },
    [flushSave, userId],
  );

  // Load into the canvas whenever a new API instance appears (mount, HMR
  // remount) or the identity switches (guest ↔ account).
  useEffect(() => {
    if (!excalidrawApi) {
      return;
    }
    if (loadedApiRef.current === excalidrawApi && loadedIdentityRef.current === userId) {
      return;
    }
    loadedApiRef.current = excalidrawApi;
    loadedIdentityRef.current = userId;
    void (async () => {
      const items = await loadItems();
      await excalidrawApi.updateLibrary({
        libraryItems: items,
        merge: false,
        openLibraryMenu: false,
      });
    })();
  }, [excalidrawApi, loadItems, userId]);

  // Cancel the pending debounce on unmount (the save would still be valid,
  // but its toast would outlive the editor).
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { onLibraryChange };
}
