"use client";

import { useQuery } from "@apollo/client/react";
import { useEffect, useRef } from "react";

import { useCursorBroadcast } from "@/hooks/use-cursor-broadcast";
import type { FilesQueryData } from "@/lib/graphql/operations";
import { FILES_QUERY } from "@/lib/graphql/operations";
import { emitOwnerViewport, emitSceneSaved, joinRealtimeRoom } from "@/lib/realtime";
import { useEditorStore } from "@/store/editor-store";

const VIEWPORT_THROTTLE_MS = 120;

/**
 * Owner-side realtime collaboration: joins the room of the open file's share
 * link (when active), broadcasts the live cursor + viewport, and announces
 * completed autosaves so viewers refresh.
 */
export function useOwnerRealtime(
  user: { id: string; name: string } | null,
  activeFileId: string | null,
): void {
  const { data: filesData } = useQuery<FilesQueryData>(FILES_QUERY, { skip: !user });
  const shareToken =
    user && activeFileId
      ? ((filesData?.files ?? []).find((file) => file.id === activeFileId)?.shareToken ?? null)
      : null;
  const shareTokenKey = shareToken ?? "";
  const userName = user?.name ?? "";
  const saveStatus = useEditorStore((state) => state.saveStatus);

  // Join / leave the realtime room as the share link turns on/off or the
  // active file changes.
  const joinRef = useRef(false);
  useEffect(() => {
    if (shareTokenKey.length === 0 || userName.length === 0) {
      joinRef.current = false;
      return;
    }
    if (joinRef.current) {
      return;
    }
    joinRef.current = true;
    const leave = joinRealtimeRoom({ token: shareTokenKey, role: "owner", name: userName });
    return () => {
      joinRef.current = false;
      leave();
    };
  }, [shareTokenKey, userName]);

  // Broadcast our cursor (scene coordinates) while the room is joined.
  useCursorBroadcast(shareTokenKey.length > 0);

  // Announce completed autosaves (any transition into "saved" is a fresh
  // cloud save — openFile resets the status to "idle" before loading).
  const prevStatusRef = useRef(saveStatus);
  useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = saveStatus;
    if (saveStatus === "saved" && was !== "saved" && shareTokenKey.length > 0 && activeFileId) {
      emitSceneSaved(activeFileId);
    }
  }, [activeFileId, saveStatus, shareTokenKey]);

  // Broadcast the live viewport so viewers can follow the owner's pan/zoom.
  useEffect(() => {
    if (shareTokenKey.length === 0) {
      return;
    }
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latest: { scrollX: number; scrollY: number; zoom: number } | null = null;
    const flush = (): void => {
      if (latest) {
        emitOwnerViewport(latest.scrollX, latest.scrollY, latest.zoom);
        latest = null;
      }
    };
    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      if (state.viewport === prevState.viewport) {
        return;
      }
      latest = state.viewport;
      const now = performance.now();
      const wait = VIEWPORT_THROTTLE_MS - (now - last);
      if (wait <= 0) {
        last = now;
        flush();
      } else if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          last = performance.now();
          flush();
        }, wait);
      }
    });
    return () => {
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [shareTokenKey]);
}
