"use client";

import { Crosshair } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useEditorStore } from "@/store/editor-store";

/**
 * Full-canvas overlay shown while click-to-place pin mode is active.
 * The next canvas click becomes the pending comment pin's scene position
 * (inverse of the pin layer transform: scene = client / zoom − scroll).
 * Escape exits without placing; Enter/Space places at the viewport center
 * (keyboard-initiated clicks carry 0/0 coordinates, so they are intercepted).
 */
export function PinPlacementOverlay() {
  const active = useEditorStore((state) => state.pinPlacementActive);
  const cancelPinPlacement = useEditorStore((state) => state.cancelPinPlacement);
  const placePin = useEditorStore((state) => state.placePin);
  const viewport = useEditorStore((state) => state.viewport);

  useEffect(() => {
    if (!active) {
      return;
    }
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelPinPlacement();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, cancelPinPlacement]);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const { zoom, scrollX, scrollY } = viewport;
      placePin(
        (event.clientX - rect.left) / zoom - scrollX,
        (event.clientY - rect.top) / zoom - scrollY,
      );
    },
    [placePin, viewport],
  );

  // Keyboard parity: Enter/Space places the pin at the current viewport center.
  const handleCanvasKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      const canvas = document.querySelector("canvas.excalidraw__canvas");
      const width = canvas?.clientWidth ?? window.innerWidth;
      const height = canvas?.clientHeight ?? window.innerHeight;
      const { zoom, scrollX, scrollY } = viewport;
      placePin(width / (2 * zoom) - scrollX, height / (2 * zoom) - scrollY);
    },
    [placePin, viewport],
  );

  if (!active) {
    return null;
  }

  return (
    <button
      type="button"
      className="absolute inset-0 z-30 cursor-crosshair bg-violet-500/5"
      onClick={handleCanvasClick}
      onKeyDown={handleCanvasKeyDown}
      aria-label="Click anywhere (or press Enter for the canvas center) to place the comment pin. Escape cancels."
    >
      <div className="pointer-events-none absolute inset-3 rounded-lg border-2 border-dashed border-violet-400/60" />
      <div className="pointer-events-none absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-full border border-violet-300/60 bg-background/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <Crosshair className="h-3.5 w-3.5 text-violet-500" aria-hidden />
        <span>Click on the canvas to place the comment pin</span>
        <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
          Esc
        </kbd>
      </div>
    </button>
  );
}
