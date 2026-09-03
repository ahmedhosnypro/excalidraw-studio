import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { PresentationSlide } from "@/store/editor-store";

type FrameElement = Extract<ExcalidrawElement, { type: "frame" }>;

/** Reads the speaker note stored on a frame's customData. */
function frameNote(frame: FrameElement): string {
  const note = frame.customData?.note;
  return typeof note === "string" ? note : "";
}

/**
 * Builds presentation slides from a scene: one slide per frame in the frame's
 * order within the elements array (creation order, adjustable via reorder);
 * frame-less content becomes a single "All content" slide.
 */
export function buildSlides(elements: readonly ExcalidrawElement[]): PresentationSlide[] {
  const frames = elements.filter(
    (element): element is FrameElement => element.type === "frame" && !element.isDeleted,
  );

  if (frames.length === 0) {
    const visible = elements.filter((element) => !element.isDeleted);
    if (visible.length === 0) {
      return [];
    }
    return [{ id: "all", name: "All content", elements: visible, frame: null, notes: "" }];
  }

  return frames.map((frame, index) => {
    const children = elements.filter(
      (element) => !element.isDeleted && element.id !== frame.id && element.frameId === frame.id,
    );
    return {
      id: frame.id,
      name: frame.name?.trim() || `Slide ${index + 1}`,
      elements: children.length > 0 ? children : [frame],
      frame,
      notes: frameNote(frame),
    };
  });
}

/**
 * Moves a frame one position up/down among the scene's frames (slide
 * reordering). Excalidraw orders elements by fractional `index` (with the
 * array acting as a cache of that order), so the swap exchanges BOTH the two
 * frames' array positions AND their index values — keeping array order and
 * index order perfectly in sync, which also makes the reorder persist.
 */
export function reorderFrame(
  elements: readonly ExcalidrawElement[],
  frameId: string,
  direction: "up" | "down",
): ExcalidrawElement[] {
  const frameEntries = elements
    .map((element, position) => ({ element, position }))
    .filter(({ element }) => element.type === "frame" && !element.isDeleted);

  const pos = frameEntries.findIndex((entry) => entry.element.id === frameId);
  if (pos === -1) {
    return [...elements];
  }

  const target = direction === "up" ? pos - 1 : pos + 1;
  if (target < 0 || target >= frameEntries.length) {
    return [...elements];
  }

  const a = frameEntries[pos];
  const b = frameEntries[target];
  const next = [...elements];
  // b lands at a's array position carrying a's index, and vice versa.
  next[a.position] = { ...b.element, index: a.element.index };
  next[b.position] = { ...a.element, index: b.element.index };
  return next;
}

/** Returns a new elements array with the frame's speaker note replaced. */
export function setFrameNote(
  elements: readonly ExcalidrawElement[],
  frameId: string,
  note: string,
): ExcalidrawElement[] {
  return elements.map((element) =>
    element.id === frameId
      ? ({ ...element, customData: { ...element.customData, note } } as ExcalidrawElement)
      : element,
  );
}
