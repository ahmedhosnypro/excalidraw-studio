"use client";

import type { AppState } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";

import { useCursorBroadcast } from "@/hooks/use-cursor-broadcast";
import type { OwnerViewport } from "@/lib/realtime";
import { joinRealtimeRoom } from "@/lib/realtime";
import { useEditorStore } from "@/store/editor-store";

/**
 * Guest-side realtime collaboration for the share viewer: joins the token
 * room, broadcasts the guest cursor, reacts to owner activity (scene saves,
 * comments) and optionally follows the owner's viewport.
 *
 * The refetch callbacks live in refs (not effect deps) so the room join is
 * stable across renders — rejoining on every parent render would flap the
 * shared socket connection.
 */
export function useGuestRealtime({
  token,
  refetchScene,
  refetchComments,
}: {
  token: string;
  refetchScene: () => Promise<unknown>;
  refetchComments: () => Promise<unknown>;
}): {
  guestName: string;
  followEnabled: boolean;
  toggleFollow: () => void;
} {
  const [guestName, setGuestName] = useState(() => {
    try {
      return window.localStorage.getItem("studio:guest-name") ?? "";
    } catch {
      return "";
    }
  });
  const [followEnabled, setFollowEnabled] = useState(true);
  const followRef = useRef(true);
  const applyingViewportRef = useRef(false);
  const refetchSceneRef = useRef(refetchScene);
  const refetchCommentsRef = useRef(refetchComments);

  // Latest-value refs (synced in effects — never during render) so the room
  // join below can read fresh callbacks without re-subscribing every render.
  useEffect(() => {
    followRef.current = followEnabled;
  }, [followEnabled]);
  useEffect(() => {
    refetchSceneRef.current = refetchScene;
    refetchCommentsRef.current = refetchComments;
  }, [refetchScene, refetchComments]);

  // The guest display name may be set (and persisted) later in the comments
  // tab — watch for the shared storage event so the presence name updates.
  useEffect(() => {
    const handler = (): void => {
      try {
        setGuestName(window.localStorage.getItem("studio:guest-name") ?? "");
      } catch {
        // Ignore storage failures (private browsing).
      }
    };
    window.addEventListener("studio:guest-name", handler);
    return () => window.removeEventListener("studio:guest-name", handler);
  }, []);

  // Re-join only when the token or the display name changes.
  useEffect(() => {
    const name = guestName.trim().length > 0 ? guestName.trim() : "Guest";
    const leave = joinRealtimeRoom({
      token,
      role: "guest",
      name,
      onSceneSaved: () => {
        void refetchSceneRef.current();
      },
      onCommentAdded: () => {
        void refetchCommentsRef.current();
      },
      onOwnerViewport: (viewport: OwnerViewport) => {
        if (!followRef.current) {
          return;
        }
        const api = useEditorStore.getState().excalidrawApi;
        if (!api || applyingViewportRef.current) {
          return;
        }
        applyingViewportRef.current = true;
        api.updateScene({
          appState: {
            scrollX: viewport.scrollX,
            scrollY: viewport.scrollY,
            zoom: { value: viewport.zoom } as AppState["zoom"],
          },
        });
        requestAnimationFrame(() => {
          applyingViewportRef.current = false;
        });
      },
    });
    return leave;
  }, [token, guestName]);

  // Broadcast our cursor (scene coordinates).
  useCursorBroadcast(true);

  return { guestName, followEnabled, toggleFollow: () => setFollowEnabled((v) => !v) };
}
