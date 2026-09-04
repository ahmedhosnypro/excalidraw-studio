"use client";

import { X } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Renders queued app toasts (file operations, share links, AI generation).
 * Bottom-center placement keeps clear of the realtime stack (bottom-right)
 * and Excalidraw's side toolbars.
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] mx-auto flex w-full max-w-sm flex-col gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur animate-[toast-in_180ms_ease-out]",
            toast.variant === "destructive"
              ? "border-destructive/30 bg-destructive/10"
              : "border-border/60 bg-background/95",
          )}
        >
          <div className="min-w-0 flex-1">
            {toast.title ? (
              <p
                className={cn(
                  "text-sm font-semibold",
                  toast.variant === "destructive" && "text-destructive",
                )}
              >
                {toast.title}
              </p>
            ) : null}
            {toast.description ? (
              <p
                className={cn(
                  "mt-0.5 break-words text-[13px] leading-relaxed",
                  toast.variant === "destructive" ? "text-destructive/90" : "text-muted-foreground",
                )}
              >
                {toast.description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
