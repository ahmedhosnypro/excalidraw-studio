"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { RemoteCursor } from "@/lib/realtime";
import { useRealtimeStore } from "@/lib/realtime";
import { useEditorStore } from "@/store/editor-store";

/** Cursor events older than this stop rendering (stale / lagged peers). */
const CURSOR_TTL_MS = 10_000;

/**
 * Live remote-cursor overlay: renders one labeled cursor per remote
 * participant (owner sees guests and vice versa). Positions use Excalidraw's
 * own transform — (sceneX + scrollX) * zoom — relative to the interactive
 * canvas rect, so the overlay works in both the full-screen editor and the
 * share viewer layout.
 */
export function RemoteCursorsLayer(): React.ReactNode {
  const cursors = useRealtimeStore((state) => state.cursors);
  const viewport = useEditorStore((state) => state.viewport);
  const presenting = useEditorStore((state) => state.presenting);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ left: 0, top: 0 });
  const [now, setNow] = useState(() => Date.now());

  // The overlay mirrors the interactive canvas' position (it sits in the
  // canvas' containing block, which may be offset — e.g. the viewer header).
  useEffect(() => {
    const measure = (): void => {
      const canvas = document.querySelector("canvas.interactive");
      const host = containerRef.current?.parentElement;
      if (!canvas || !host) {
        return;
      }
      const canvasRect = canvas.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      setOffset({ left: canvasRect.left - hostRect.left, top: canvasRect.top - hostRect.top });
    };
    measure();
    const observer = new ResizeObserver(measure);
    const canvasHost = containerRef.current?.parentElement;
    if (canvasHost) {
      observer.observe(canvasHost);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Tick so stale cursors disappear without new events.
  useEffect(() => {
    if (Object.keys(cursors).length === 0) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cursors]);

  const live = useMemo(
    () => Object.values(cursors).filter((cursor) => now - cursor.updatedAt < CURSOR_TTL_MS),
    [cursors, now],
  );

  if (presenting || live.length === 0) {
    return null;
  }

  const { scrollX, scrollY, zoom } = viewport;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {live.map((cursor) => (
        <RemoteCursorView
          key={cursor.id}
          cursor={cursor}
          left={offset.left + (cursor.x + scrollX) * zoom}
          top={offset.top + (cursor.y + scrollY) * zoom}
        />
      ))}
    </div>
  );
}

function RemoteCursorView({
  cursor,
  left,
  top,
}: {
  cursor: RemoteCursor;
  left: number;
  top: number;
}) {
  return (
    <div
      className="absolute will-change-transform"
      style={{
        transform: `translate3d(${left}px, ${top}px, 0)`,
        transition: "transform 90ms linear",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
        fill={cursor.color}
        aria-hidden
      >
        <path d="M4 2l14 10.5h-6.2L4 22z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span
        className="absolute left-4 top-4 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white shadow-sm"
        style={{ backgroundColor: cursor.color }}
      >
        {cursor.name}
      </span>
    </div>
  );
}
