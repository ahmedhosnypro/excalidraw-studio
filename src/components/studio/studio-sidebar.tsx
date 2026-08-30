"use client";

import { MessageCircle, Presentation } from "lucide-react";

import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";

import { useEditorStore } from "@/store/editor-store";
import { CommentsTab } from "@/components/studio/comments-tab";
import { PresentTab } from "@/components/studio/present-tab";

/**
 * The right sidebar: search (built-in), libraries (built-in) plus our
 * comments and present tabs — mirroring the Excalidraw.com layout.
 */
export function StudioSidebar() {
  const activeFileId = useEditorStore((state) => state.activeFileId);

  return (
    <DefaultSidebar>
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
