"use client";

import { useEffect } from "react";

import { clientToScene } from "@/lib/canvas-geometry";
import { emitRealtimeCursor } from "@/lib/realtime";

const CURSOR_THROTTLE_MS = 60;

/**
 * Broadcasts the local pointer position (converted to scene coordinates) to
 * the realtime room while `enabled`. Shared by the owner editor and the
 * share-link viewer.
 */
export function useCursorBroadcast(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let last = 0;
    const handler = (event: PointerEvent): void => {
      const now = performance.now();
      if (now - last < CURSOR_THROTTLE_MS) {
        return;
      }
      last = now;
      const { x, y } = clientToScene(event.clientX, event.clientY);
      emitRealtimeCursor(x, y);
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [enabled]);
}
