"use client";

import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import type { AppState } from "@excalidraw/excalidraw/types";
import { MessageCircle, Presentation } from "lucide-react";
import { useCallback } from "react";
import { CommentsTab } from "@/components/studio/comments-tab";
import { PresentTab } from "@/components/studio/present-tab";
import { useRealtimeStore } from "@/lib/realtime";
import type { SidebarTab } from "@/store/editor-store";
import { useEditorStore } from "@/store/editor-store";

/**
 * The right sidebar: search (built-in), libraries (built-in) plus our
 * comments and present tabs — mirroring the Excalidraw.com layout.
 *
 * onStateChange mirrors the open sidebar + tab into the editor store so
 * the top-right trigger buttons can render an accurate active state.
 */
export function StudioSidebar() {
  const activeFileId = useEditorStore((state) => state.activeFileId);

  const handleStateChange = useCallback((state: AppState["openSidebar"]) => {
    const tab = state?.name === "default" ? (state.tab ?? null) : null;
    useEditorStore
      .getState()
      .setSidebarTab(tab === "comments" || tab === "present" ? (tab as SidebarTab) : null);
    // Opening the comments tab counts as "reading" — clear the live unread
    // notifications pushed by the realtime service.
    if (tab === "comments") {
      useRealtimeStore.getState().clearUnreadComments();
    }
  }, []);

  return (
    <DefaultSidebar onStateChange={handleStateChange}>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger tab="comments" title="Comments">
          <MessageCircle className="h-4 w-4" aria-hidden />
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger tab="present" title="Present">
          <Presentation className="h-4 w-4" aria-hidden />
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab="comments">
        <CommentsTab fileId={activeFileId} />
      </Sidebar.Tab>
      <Sidebar.Tab tab="present">
        <PresentTab fileId={activeFileId} />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
}
