"use client";

import { MessageCircle, UsersRound } from "lucide-react";
import { useEffect } from "react";

import type { RealtimeParticipant, RealtimeToast } from "@/lib/realtime";
import { useRealtimeStore } from "@/lib/realtime";
import { cn } from "@/lib/utils";

/** Initials for the presence avatar. */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * Overlapped presence avatars with a live pulse. Shows remote participants
 * (the owner sees guests; a guest sees the owner and other guests).
 */
export function PresenceStack({ max = 3 }: { max?: number }) {
  const participants = useRealtimeStore((state) => state.participants);
  const selfId = useRealtimeStore((state) => state.selfId);
  const connected = useRealtimeStore((state) => state.connected);
  const roomToken = useRealtimeStore((state) => state.roomToken);

  // Everybody except ourselves is rendered.
  const others = participants.filter(
    (participant): participant is RealtimeParticipant & { name: string } =>
      participant.id !== selfId,
  );
  if (!connected || !roomToken || others.length === 0) {
    return null;
  }
  const shown = others.slice(0, max);
  const overflow = others.length - shown.length;

  return (
    <section
      className="flex items-center"
      aria-label={`${others.length} ${others.length === 1 ? "person is" : "people are"} viewing right now`}
    >
      <span className="mr-1.5 hidden items-center gap-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live
      </span>
      <div className="flex -space-x-1.5">
        {shown.map((participant) => (
          <span
            key={participant.id}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-background"
            style={{ backgroundColor: participant.color }}
            title={`${participant.name}${participant.role === "owner" ? " (owner)" : ""} — viewing live`}
          >
            {initialsOf(participant.name)}
          </span>
        ))}
        {overflow > 0 ? (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground ring-2 ring-background"
            title={`${overflow} more ${overflow === 1 ? "viewer" : "viewers"}`}
          >
            +{overflow}
          </span>
        ) : null}
      </div>
    </section>
  );
}

const TOAST_LIFETIME_MS = 4200;

/**
 * Lightweight realtime toasts (join/leave/comment events) — bottom-right
 * stack with slide-in animation, auto-dismiss and manual close.
 */
export function RealtimeToasts() {
  const toasts = useRealtimeStore((state) => state.toasts);
  const dismissToast = useRealtimeStore((state) => state.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }
    const timers = toasts.map((toast: RealtimeToast) =>
      setTimeout(() => dismissToast(toast.id), TOAST_LIFETIME_MS),
    );
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [toasts, dismissToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex min-w-52 max-w-xs items-center gap-2.5 rounded-xl border border-border/60 bg-background/95 px-3.5 py-2.5 shadow-lg backdrop-blur animate-[toast-in_180ms_ease-out]"
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              toast.kind === "comment" &&
                "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
              toast.kind === "join" &&
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
              toast.kind === "leave" && "bg-muted text-muted-foreground",
              toast.kind === "scene" && "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
            )}
          >
            {toast.kind === "comment" ? (
              <MessageCircle className="h-4 w-4" aria-hidden />
            ) : (
              <UsersRound className="h-4 w-4" aria-hidden />
            )}
          </span>
          <p className="flex-1 text-[13px] leading-snug text-foreground">{toast.message}</p>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
          >
            <span className="sr-only">Dismiss</span>
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
