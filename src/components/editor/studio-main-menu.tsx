"use client";

import { loadFromBlob, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";
import {
  FilePlus2,
  FolderOpen,
  HardDriveDownload,
  History as HistoryIcon,
  LayoutTemplate,
  Link2,
  LogIn,
  LogOut,
  Save,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { useStudioMutations } from "@/hooks/use-studio-mutations";
import { useEditorStore } from "@/store/editor-store";

const ACCEPTED_TYPES = ".excalidraw,application/json,application/vnd.excalidraw+json";

/** Opens a local `.excalidraw` file directly onto the canvas. */
function useOpenFromDisk() {
  return useCallback((): void => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED_TYPES;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      const api = useEditorStore.getState().excalidrawApi;
      if (!api) {
        return;
      }
      try {
        const data = await loadFromBlob(file, null, null);
        const elements = (data.elements ?? []) as ExcalidrawElement[];
        api.updateScene({
          elements,
          appState: (data.appState ?? {}) as Pick<AppState, keyof AppState>,
        });
        const filesList = Object.values(data.files ?? {}) as BinaryFileData[];
        if (filesList.length > 0) {
          await api.addFiles(filesList);
        }
        api.scrollToContent(elements, { fitToViewport: true });
      } catch {
        // Invalid file — ignore gracefully.
      }
    };
    input.click();
  }, []);
}

export function StudioMainMenu({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { theme, setTheme } = useTheme();
  const openFromDisk = useOpenFromDisk();
  const { createFile, logout } = useStudioMutations();

  const openDialog = useEditorStore((state) => state.openDialog);
  const openHistoryDialog = useEditorStore((state) => state.openHistoryDialog);
  const openAuthDialog = useEditorStore((state) => state.openAuthDialog);
  const openFile = useEditorStore((state) => state.openFile);
  const flushSave = useEditorStore((state) => state.flushSave);
  const activeFileId = useEditorStore((state) => state.activeFileId);

  const handleNewFile = useCallback(async () => {
    try {
      const result = await createFile({ variables: { name: "Untitled" } });
      const file = result.data?.createFile;
      if (file) {
        openFile(file.id, file.name);
      }
    } catch {
      // surfaced through the files dialog / toast on failure
    }
  }, [createFile, openFile]);

  const handleSave = useCallback(() => {
    void flushSave?.();
  }, [flushSave]);

  const handleLogout = useCallback(async () => {
    const { closeFile } = useEditorStore.getState();
    await flushSave?.();
    await logout();
    closeFile();
  }, [flushSave, logout]);

  const handleSignIn = useCallback(() => {
    openAuthDialog("Sign in to save your drawings to the cloud and switch between files.");
  }, [openAuthDialog]);

  return (
    <MainMenu>
      <MainMenu.Group title="Canvas">
        <MainMenu.Item
          icon={<FolderOpen className="h-4 w-4" />}
          shortcut="Ctrl+O"
          onSelect={() => openDialog("files")}
        >
          My files…
        </MainMenu.Item>
        {isAuthenticated ? (
          <MainMenu.Item
            icon={<FilePlus2 className="h-4 w-4" />}
            onSelect={() => void handleNewFile()}
          >
            New file
          </MainMenu.Item>
        ) : null}
        <MainMenu.Item icon={<HardDriveDownload className="h-4 w-4" />} onSelect={openFromDisk}>
          Open from disk…
        </MainMenu.Item>
        {isAuthenticated ? (
          <MainMenu.Item
            icon={<Save className="h-4 w-4" />}
            shortcut="Ctrl+S"
            onSelect={handleSave}
          >
            Save
          </MainMenu.Item>
        ) : (
          <MainMenu.Item icon={<Save className="h-4 w-4" />} onSelect={handleSignIn}>
            Save to cloud…
          </MainMenu.Item>
        )}
        {isAuthenticated && activeFileId ? (
          <MainMenu.Item
            icon={<Link2 className="h-4 w-4" />}
            shortcut="Ctrl+E"
            onSelect={() => openDialog("share")}
          >
            Share…
          </MainMenu.Item>
        ) : null}
        {isAuthenticated ? (
          <MainMenu.Item
            icon={<HistoryIcon className="h-4 w-4" />}
            shortcut="Ctrl+Alt+H"
            onSelect={() => openHistoryDialog()}
          >
            Version history…
          </MainMenu.Item>
        ) : null}
        <MainMenu.DefaultItems.Export />
      </MainMenu.Group>

      <MainMenu.Group title="Workspace">
        <MainMenu.DefaultItems.CommandPalette />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
      </MainMenu.Group>

      <MainMenu.Group title="Links">
        <MainMenu.DefaultItems.Socials />
      </MainMenu.Group>

      <MainMenu.Group title="Account">
        {isAuthenticated ? (
          <MainMenu.Item icon={<LogOut className="h-4 w-4" />} onSelect={() => void handleLogout()}>
            Sign out
          </MainMenu.Item>
        ) : (
          <MainMenu.Item icon={<LogIn className="h-4 w-4" />} onSelect={handleSignIn}>
            Sign in
          </MainMenu.Item>
        )}
      </MainMenu.Group>

      <MainMenu.Group title="Preferences">
        <MainMenu.DefaultItems.ToggleTheme
          allowSystemTheme
          theme={theme === "dark" ? "dark" : theme === "light" ? "light" : "system"}
          onSelect={(next) => setTheme(next === "system" ? "system" : next)}
        />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu.Group>
    </MainMenu>
  );
}

export function StudioWelcomeScreen({ isAuthenticated }: { isAuthenticated: boolean }) {
  const openDialog = useEditorStore((state) => state.openDialog);
  const openFilesDialog = useEditorStore((state) => state.openFilesDialog);
  const openAuthDialog = useEditorStore((state) => state.openAuthDialog);

  return (
    <WelcomeScreen>
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo>Excalidraw Studio</WelcomeScreen.Center.Logo>
        <WelcomeScreen.Center.Heading>
          {isAuthenticated
            ? "Your drawings are saved to your account."
            : "Your drawing is saved locally in this browser. Sign in to sync it to the cloud."}
        </WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          {isAuthenticated ? (
            <WelcomeScreen.Center.MenuItem
              shortcut="Ctrl+O"
              icon={<FolderOpen className="h-4 w-4" />}
              onSelect={() => openDialog("files")}
            >
              My files
            </WelcomeScreen.Center.MenuItem>
          ) : (
            <WelcomeScreen.Center.MenuItem
              icon={<LogIn className="h-4 w-4" />}
              onSelect={() =>
                openAuthDialog(
                  "Sign in to save your drawings to the cloud and switch between files.",
                )
              }
            >
              Sign in
            </WelcomeScreen.Center.MenuItem>
          )}
          {isAuthenticated ? (
            <WelcomeScreen.Center.MenuItem
              icon={<LayoutTemplate className="h-4 w-4" />}
              onSelect={() => openFilesDialog("templates")}
            >
              Start from a template
            </WelcomeScreen.Center.MenuItem>
          ) : null}
          <WelcomeScreen.Center.MenuItem
            shortcut="Ctrl+M"
            icon={<Sparkles className="h-4 w-4" />}
            onSelect={() =>
              isAuthenticated
                ? openDialog("ai")
                : openAuthDialog("Sign in to generate diagrams with AI.")
            }
          >
            Generate a diagram with AI
          </WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItemHelp />
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
}
