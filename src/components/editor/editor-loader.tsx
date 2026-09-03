"use client";

import dynamic from "next/dynamic";

const EditorApp = dynamic(async () => (await import("@/components/editor/editor-app")).EditorApp, {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading editor…</p>
      </div>
    </div>
  ),
});

export function EditorLoader() {
  return <EditorApp />;
}
