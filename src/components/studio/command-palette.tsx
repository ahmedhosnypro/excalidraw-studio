"use client";

import { serializeAsJSON } from "@excalidraw/excalidraw";
import type { AppState, ToolType } from "@excalidraw/excalidraw/types";
import {
  ArrowUpRight,
  Circle,
  ClipboardList,
  Copy,
  Diamond,
  Download,
  Eraser,
  Eye,
  FilePlus2,
  FolderOpen,
  Frame,
  Grid3x3,
  Hand,
  Image as ImageIcon,
  LogIn,
  LogOut,
  MessageCircle,
  Minus,
  Moon,
  MoveUpRight,
  Pencil,
  Play,
  Plus,
  Presentation,
  Redo2,
  Save,
  Search,
  Square,
  Sun,
  Type,
  Undo2,
  Waypoints,
  Zap,
  ZoomIn,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useStudioMutations } from "@/hooks/use-studio-mutations";
import type { FileGql, UserGql } from "@/lib/graphql/operations";
import { useEditorStore } from "@/store/editor-store";

/** Dispatches a keyboard shortcut onto the canvas so the package handles it. */
function canvasShortcut(
  key: string,
  options: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
): void {
  const target = document.querySelector<HTMLElement>(".excalidraw") ?? document.body;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: options.ctrl ?? false,
      metaKey: options.ctrl ?? false,
      shiftKey: options.shift ?? false,
      altKey: options.alt ?? false,
    }),
  );
}

function updateAppState(patch: Partial<AppState>): void {
  const api = useEditorStore.getState().excalidrawApi;
  api?.updateScene({ appState: patch as Pick<AppState, keyof AppState> });
}

function downloadSceneFile(): void {
  const api = useEditorStore.getState().excalidrawApi;
  if (!api) {
    return;
  }
  const name = useEditorStore.getState().activeFileName ?? "untitled";
  const json = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local");
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^\w- ]+/g, "") || "untitled"}.excalidraw`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function setZoom(multiplier: number): void {
  const api = useEditorStore.getState().excalidrawApi;
  if (!api) {
    return;
  }
  const current = api.getAppState().zoom.value;
  const next = Math.min(30, Math.max(0.1, current * multiplier));
  updateAppState({ zoom: { value: next as AppState["zoom"]["value"] } });
}

function zoomToSelection(): void {
  const api = useEditorStore.getState().excalidrawApi;
  if (!api) {
    return;
  }
  const selected = new Set(Object.keys(api.getAppState().selectedElementIds));
  const elements = api.getSceneElements().filter((element) => selected.has(element.id));
  if (elements.length > 0) {
    api.scrollToContent(elements, { fitToViewport: true });
  }
}

interface PaletteCommand {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  keywords?: string;
  perform: () => void;
}

export function CommandPalette({
  user,
  files,
  onOpenFile,
}: {
  user: UserGql | null;
  files: FileGql[];
  onOpenFile: (file: FileGql) => void;
}) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { createFile, logout } = useStudioMutations();

  // Global palette shortcuts: Ctrl+K, Ctrl+/ and Ctrl+Shift+P.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;
      if (
        mod &&
        !event.altKey &&
        (event.key.toLowerCase() === "k" ||
          event.key === "/" ||
          (event.shiftKey && event.key.toLowerCase() === "p"))
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const run = useCallback((perform: () => void) => {
    setOpen(false);
    perform();
  }, []);

  const handleNewFile = useCallback(async (): Promise<void> => {
    try {
      const result = await createFile({ variables: { name: "Untitled" } });
      const file = result.data?.createFile;
      if (file) {
        useEditorStore.getState().openFile(file.id, file.name);
        onOpenFile(file);
      }
    } catch {
      // The files dialog surfaces errors.
    }
  }, [createFile, onOpenFile]);

  const handleSignOut = useCallback(async (): Promise<void> => {
    const { flushSave, closeFile } = useEditorStore.getState();
    await flushSave?.();
    await logout();
    closeFile();
  }, [logout]);

  const appCommands = useMemo<PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = [
      {
        id: "theme",
        label: resolvedTheme === "dark" ? "Light mode" : "Dark mode",
        icon: resolvedTheme === "dark" ? <Sun /> : <Moon />,
        shortcut: "Shift+Alt+D",
        keywords: "theme dark light toggle",
        perform: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "library",
        label: "Library",
        icon: <FolderOpen />,
        keywords: "library assets shapes",
        perform: () => {
          useEditorStore.getState().excalidrawApi?.toggleSidebar({
            name: "default",
            tab: "library",
          });
        },
      },
      {
        id: "find",
        label: "Find on canvas",
        icon: <Search />,
        shortcut: "Ctrl+F",
        keywords: "search find canvas elements",
        perform: () => {
          useEditorStore.getState().excalidrawApi?.toggleSidebar({
            name: "default",
            tab: "canvasSearch",
          });
        },
      },
      {
        id: "files",
        label: "My files",
        icon: <FolderOpen />,
        shortcut: "Ctrl+O",
        keywords: "files open switch cloud drawings",
        perform: () => useEditorStore.getState().openDialog("files"),
      },
    ];

    if (user) {
      commands.push(
        {
          id: "new-file",
          label: "New file",
          icon: <FilePlus2 />,
          keywords: "create new file drawing",
          perform: () => void handleNewFile(),
        },
        {
          id: "save",
          label: "Save",
          icon: <Save />,
          shortcut: "Ctrl+S",
          keywords: "save cloud sync persist",
          perform: () => void useEditorStore.getState().flushSave?.(),
        },
        {
          id: "signout",
          label: "Sign out",
          icon: <LogOut />,
          keywords: "logout account sign out",
          perform: () => void handleSignOut(),
        },
      );
    } else {
      commands.push({
        id: "signin",
        label: "Sign in",
        icon: <LogIn />,
        keywords: "login account sign up signup",
        perform: () =>
          useEditorStore
            .getState()
            .openAuthDialog("Sign in to save your drawings to the cloud and switch between files."),
      });
    }

    return commands;
  }, [handleNewFile, handleSignOut, resolvedTheme, setTheme, user]);

  const exportCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "export-image",
        label: "Export image…",
        icon: <ImageIcon />,
        shortcut: "Ctrl+Shift+E",
        keywords: "export image png svg download",
        perform: () => updateAppState({ openDialog: { name: "imageExport" } }),
      },
      {
        id: "download-file",
        label: "Download .excalidraw file",
        icon: <Download />,
        keywords: "save disk download file json excalidraw",
        perform: downloadSceneFile,
      },
    ],
    [],
  );

  const editorCommands = useMemo<PaletteCommand[]>(() => {
    const api = useEditorStore.getState().excalidrawApi;
    const appState = api?.getAppState();
    return [
      {
        id: "undo",
        label: "Undo",
        icon: <Undo2 />,
        shortcut: "Ctrl+Z",
        keywords: "undo history back",
        perform: () => canvasShortcut("z", { ctrl: true }),
      },
      {
        id: "redo",
        label: "Redo",
        icon: <Redo2 />,
        shortcut: "Ctrl+Shift+Z",
        keywords: "redo history forward",
        perform: () => canvasShortcut("z", { ctrl: true, shift: true }),
      },
      {
        id: "zoom-in",
        label: "Zoom in",
        icon: <Plus />,
        shortcut: "Ctrl++",
        keywords: "zoom in magnify",
        perform: () => setZoom(1.1),
      },
      {
        id: "zoom-out",
        label: "Zoom out",
        icon: <Minus />,
        shortcut: "Ctrl+-",
        keywords: "zoom out shrink",
        perform: () => setZoom(1 / 1.1),
      },
      {
        id: "zoom-reset",
        label: "Reset zoom",
        icon: <ZoomIn />,
        shortcut: "Ctrl+0",
        keywords: "zoom reset 100",
        perform: () => updateAppState({ zoom: { value: 1 as AppState["zoom"]["value"] } }),
      },
      {
        id: "zoom-fit",
        label: "Zoom to fit",
        icon: <MoveUpRight />,
        shortcut: "Shift+1",
        keywords: "zoom fit all elements",
        perform: () => {
          const apiNow = useEditorStore.getState().excalidrawApi;
          if (apiNow) {
            apiNow.scrollToContent(apiNow.getSceneElements(), {
              fitToViewport: true,
            });
          }
        },
      },
      {
        id: "zen",
        label: "Zen mode",
        icon: <Eye />,
        shortcut: "Alt+Z",
        keywords: "zen focus hide ui",
        perform: () => updateAppState({ zenModeEnabled: !appState?.zenModeEnabled }),
      },
      {
        id: "view-mode",
        label: "View mode",
        icon: <Eye />,
        shortcut: "Alt+R",
        keywords: "view read only readonly",
        perform: () => updateAppState({ viewModeEnabled: !appState?.viewModeEnabled }),
      },
      {
        id: "grid",
        label: "Toggle grid",
        icon: <Grid3x3 />,
        shortcut: "Ctrl+'",
        keywords: "grid toggle background",
        perform: () => updateAppState({ gridModeEnabled: !appState?.gridModeEnabled }),
      },
      {
        id: "snap",
        label: "Snap to objects",
        icon: <Zap />,
        shortcut: "Alt+S",
        keywords: "snap objects magnet align",
        perform: () =>
          updateAppState({
            objectsSnapModeEnabled: !appState?.objectsSnapModeEnabled,
          }),
      },
      {
        id: "help",
        label: "Shortcuts & help",
        icon: <ClipboardList />,
        shortcut: "?",
        keywords: "help shortcuts keyboard",
        perform: () => updateAppState({ openDialog: { name: "help" } }),
      },
      {
        id: "select-all",
        label: "Select all",
        icon: <Copy />,
        shortcut: "Ctrl+A",
        keywords: "select all elements",
        perform: () => canvasShortcut("a", { ctrl: true }),
      },
      {
        id: "clear-canvas",
        label: "Clear canvas",
        icon: <Eraser />,
        shortcut: "Ctrl+Delete",
        keywords: "clear reset canvas delete all",
        perform: () => canvasShortcut("Delete", { ctrl: true }),
      },
    ];
  }, []);

  const toolCommands = useMemo<PaletteCommand[]>(() => {
    const tools: { type: ToolType; label: string; icon: React.ReactNode; shortcut?: string }[] = [
      { type: "hand", label: "Hand (panning tool)", icon: <Hand />, shortcut: "H" },
      { type: "selection", label: "Selection", icon: <ArrowUpRight />, shortcut: "V" },
      { type: "rectangle", label: "Rectangle", icon: <Square />, shortcut: "R" },
      { type: "diamond", label: "Diamond", icon: <Diamond />, shortcut: "D" },
      { type: "ellipse", label: "Ellipse", icon: <Circle />, shortcut: "O" },
      { type: "arrow", label: "Arrow", icon: <MoveUpRight />, shortcut: "A" },
      { type: "line", label: "Line", icon: <Minus />, shortcut: "L" },
      { type: "freedraw", label: "Draw", icon: <Pencil />, shortcut: "P" },
      { type: "text", label: "Text", icon: <Type />, shortcut: "T" },
      { type: "image", label: "Insert image", icon: <ImageIcon />, shortcut: "9" },
      { type: "eraser", label: "Eraser", icon: <Eraser />, shortcut: "E" },
      { type: "frame", label: "Frame tool", icon: <Frame />, shortcut: "F" },
      { type: "laser", label: "Laser pointer", icon: <Waypoints />, shortcut: "K" },
    ];
    return tools.map((tool) => ({
      id: `tool-${tool.type}`,
      label: tool.label,
      icon: tool.icon,
      shortcut: tool.shortcut,
      keywords: `tool ${tool.type}`,
      perform: () => {
        useEditorStore.getState().excalidrawApi?.setActiveTool({ type: tool.type });
      },
    }));
  }, []);

  const elementCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "zoom-selection",
        label: "Zoom to selection",
        icon: <ZoomIn />,
        shortcut: "Shift+3",
        keywords: "zoom selection focus",
        perform: zoomToSelection,
      },
      {
        id: "comments",
        label: "Comments",
        icon: <MessageCircle />,
        keywords: "comments sidebar feedback",
        perform: () => {
          useEditorStore.getState().excalidrawApi?.toggleSidebar({
            name: "default",
            tab: "comments",
          });
        },
      },
      {
        id: "present",
        label: "Present slides",
        icon: <Presentation />,
        keywords: "present presentation slides frames play",
        perform: () => {
          useEditorStore
            .getState()
            .excalidrawApi?.toggleSidebar({ name: "default", tab: "present" });
        },
      },
    ],
    [],
  );

  const fileCommands = useMemo<PaletteCommand[]>(
    () =>
      files.slice(0, 6).map((file) => ({
        id: `file-${file.id}`,
        label: `Open “${file.name}”`,
        icon: <Play />,
        keywords: "open file switch recent",
        perform: () => onOpenFile(file),
      })),
    [files, onOpenFile],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search menus, commands, and discover hidden gems…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="App">
          {appCommands.map((command) => (
            <PaletteRow key={command.id} command={command} onRun={run} />
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Export">
          {exportCommands.map((command) => (
            <PaletteRow key={command.id} command={command} onRun={run} />
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Editor">
          {editorCommands.map((command) => (
            <PaletteRow key={command.id} command={command} onRun={run} />
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tools">
          {toolCommands.map((command) => (
            <PaletteRow key={command.id} command={command} onRun={run} />
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Elements">
          {elementCommands.map((command) => (
            <PaletteRow key={command.id} command={command} onRun={run} />
          ))}
        </CommandGroup>
        {fileCommands.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Files">
              {fileCommands.map((command) => (
                <PaletteRow key={command.id} command={command} onRun={run} />
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

function PaletteRow({
  command,
  onRun,
}: {
  command: PaletteCommand;
  onRun: (perform: () => void) => void;
}) {
  return (
    <CommandItem
      value={`${command.label} ${command.keywords ?? ""}`}
      onSelect={() => onRun(command.perform)}
      className="gap-2"
    >
      <span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
        {command.icon}
      </span>
      <span className="flex-1">{command.label}</span>
      {command.shortcut ? (
        <kbd className="pointer-events-none hidden h-5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
          {command.shortcut}
        </kbd>
      ) : null}
    </CommandItem>
  );
}
