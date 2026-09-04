import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useEditorStore } from "@/store/editor-store";

interface ViewportState {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

/** Live canvas size, with graceful window fallbacks. */
function canvasSize(): { width: number; height: number } {
  const canvas = document.querySelector("canvas.excalidraw__canvas");
  return {
    width: canvas?.clientWidth ?? window.innerWidth,
    height: canvas?.clientHeight ?? window.innerHeight,
  };
}

/** Scene coordinates of the current viewport center (where a new pin lands). */
export function viewportSceneCenter(viewport: ViewportState): { x: number; y: number } {
  const { width, height } = canvasSize();
  return {
    x: width / (2 * viewport.zoom) - viewport.scrollX,
    y: height / (2 * viewport.zoom) - viewport.scrollY,
  };
}

/** Centers the canvas viewport on a scene point (comment "locate" action). */
export function centerCanvasOn(
  api: ExcalidrawImperativeAPI,
  x: number,
  y: number,
  zoom: number,
): void {
  const { width, height } = canvasSize();
  api.updateScene({
    appState: {
      scrollX: width / (2 * zoom) - x,
      scrollY: height / (2 * zoom) - y,
    },
  });
}

/**
 * Mirrors the live canvas viewport (pan/zoom) into the editor store so canvas
 * overlays (comment pins) follow it. Returns Excalidraw's unsubscribe fn.
 */
export function registerViewportTracking(api: ExcalidrawImperativeAPI): () => void {
  const appState = api.getAppState();
  useEditorStore.getState().setViewport({
    scrollX: appState.scrollX ?? 0,
    scrollY: appState.scrollY ?? 0,
    zoom: appState.zoom.value,
  });
  return api.onScrollChange((scrollX, scrollY, zoom) => {
    useEditorStore.getState().setViewport({ scrollX, scrollY, zoom: zoom.value });
  });
}

/**
 * Converts a pointer event position to scene coordinates (used to broadcast
 * the live cursor to realtime collaborators). Falls back to the viewport
 * math when the canvas rect is unavailable.
 */
export function clientToScene(clientX: number, clientY: number): { x: number; y: number } {
  const { scrollX, scrollY, zoom } = useEditorStore.getState().viewport;
  const canvas = document.querySelector("canvas.interactive");
  const rect = canvas?.getBoundingClientRect();
  const left = rect?.left ?? 0;
  const top = rect?.top ?? 0;
  return {
    x: (clientX - left) / zoom - scrollX,
    y: (clientY - top) / zoom - scrollY,
  };
}
