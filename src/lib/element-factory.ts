/**
 * Shared Excalidraw element construction: expands compact element specs
 * (shapes / arrows / texts with labels) into full Excalidraw elements.
 * Used by both the server (AI diagram generation) and the client (starter
 * templates) — one source of truth for element defaults and arrow geometry.
 */

// ---------------------------------------------------------------------------
// Compact spec format (same schema the AI model emits)
// ---------------------------------------------------------------------------

interface CompactShapeSpec {
  kind: "shape";
  shape: "rectangle" | "ellipse" | "diamond";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
}

interface CompactArrowSpec {
  kind: "arrow";
  id: string;
  start: string;
  end: string;
  label: string | null;
  dashed: boolean;
  endArrowhead: "arrow" | "none" | "triangle";
}

interface CompactTextSpec {
  kind: "text";
  id: string;
  x: number;
  y: number;
  text: string;
}

export type CompactElementSpec = CompactShapeSpec | CompactArrowSpec | CompactTextSpec;

// ---------------------------------------------------------------------------
// Expansion machinery
// ---------------------------------------------------------------------------

/** Base fields shared by every Excalidraw element (loosely typed on purpose:
 * both sides only assemble known-good defaults). */
interface AnyElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  boundElements: { id: string; type: "text" | "arrow" }[] | null;
  [key: string]: unknown;
}

function randomSeed(): number {
  // Excalidraw seeds are 31-bit unsigned ints.
  return Math.floor(Math.random() * 2 ** 31);
}

function baseElement(id: string, x: number, y: number): AnyElement {
  return {
    type: "rectangle",
    id: `el_${id}_${randomSeed().toString(36)}`,
    x,
    y,
    width: 160,
    height: 80,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

/** Point on `shape`'s bounding-box edge along the line towards `other`. */
function rectEdgePoint(
  shape: { x: number; y: number; width: number; height: number },
  other: { x: number; y: number },
): { x: number; y: number } {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const dx = other.x - cx;
  const dy = other.y - cy;
  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy };
  }
  const tx = dx !== 0 ? Math.abs(shape.width / 2 / dx) : Number.POSITIVE_INFINITY;
  const ty = dy !== 0 ? Math.abs(shape.height / 2 / dy) : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);
  return { x: cx + t * dx, y: cy + t * dy };
}

function centerOf(shape: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
} {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

/** Bound label text centered on (or anchored at) a container. */
function boundTextFor(
  containerId: string,
  box: { x: number; y: number; width: number; height: number },
  text: string,
  fontSize: number,
): AnyElement {
  const el = baseElement(`t${randomSeed().toString(36)}`, box.x, box.y);
  el.type = "text";
  el.width = box.width;
  el.height = fontSize * 1.25;
  el.strokeWidth = 1;
  return Object.assign(el, {
    text,
    originalText: text,
    fontSize,
    fontFamily: 1,
    textAlign: "center",
    verticalAlign: "middle",
    containerId,
    autoResize: true,
    lineHeight: 1.25,
  });
}

function appendBound(element: AnyElement, entry: { id: string; type: "text" | "arrow" }): void {
  element.boundElements = [
    ...((element.boundElements as { id: string; type: "text" | "arrow" }[] | null) ?? []),
    entry,
  ];
}

/**
 * Expands compact element specs into full Excalidraw elements (labels become
 * bound text, arrows get bindings + geometry). Output lacks the `index` field
 * — callers assign fractional indices when inserting into a scene.
 */
export function expandCompactElements(
  elements: CompactElementSpec[],
  idPrefix = "el",
): Record<string, unknown>[] {
  /** compact id → final element (for arrow endpoint resolution). */
  const byCompactId = new Map<string, AnyElement>();
  const shapeBoxes = new Map<string, { x: number; y: number; width: number; height: number }>();
  const output: Record<string, unknown>[] = [];

  // Pass 1 — shapes.
  for (const element of elements) {
    if (element.kind !== "shape") {
      continue;
    }
    const el = baseElement(element.id, element.x, element.y);
    el.id = `${idPrefix}_${element.id}_${randomSeed().toString(36)}`;
    el.type = element.shape;
    el.width = element.width;
    el.height = element.height;
    el.roundness = element.shape === "rectangle" ? { type: 3 } : { type: 2 };
    byCompactId.set(element.id, el);
    shapeBoxes.set(element.id, {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    });
    output.push(el);
  }

  // Pass 2 — shape labels (bound text).
  for (const element of elements) {
    if (element.kind !== "shape" || !element.label) {
      continue;
    }
    const box = shapeBoxes.get(element.id);
    if (!box) {
      continue;
    }
    const container = byCompactId.get(element.id);
    const label = boundTextFor(container?.id ?? element.id, box, element.label, 20);
    output.push(label);
    if (container) {
      appendBound(container, { id: label.id, type: "text" });
    }
  }

  // Pass 3 — arrows (bindings; Excalidraw recomputes endpoints on render).
  for (const element of elements) {
    if (element.kind !== "arrow") {
      continue;
    }
    const startBox = shapeBoxes.get(element.start);
    const endBox = shapeBoxes.get(element.end);
    if (!startBox || !endBox) {
      continue; // Arrows must connect two shapes — otherwise drop.
    }
    const startAnchor = centerOf(startBox);
    const endAnchor = centerOf(endBox);
    const startPoint = rectEdgePoint(startBox, endAnchor);
    const endPoint = rectEdgePoint(endBox, startAnchor);
    const el = baseElement(element.id, startPoint.x, startPoint.y);
    el.id = `${idPrefix}_${element.id}_${randomSeed().toString(36)}`;
    el.type = "arrow";
    el.width = Math.abs(endPoint.x - startPoint.x);
    el.height = Math.abs(endPoint.y - startPoint.y);
    if (element.dashed) {
      el.strokeStyle = "dashed";
    }
    Object.assign(el, {
      points: [
        [0, 0],
        [endPoint.x - startPoint.x, endPoint.y - startPoint.y],
      ],
      lastCommittedPoint: null,
      startBinding: byCompactId.has(element.start)
        ? { elementId: byCompactId.get(element.start)?.id, focus: 0, gap: 4 }
        : null,
      endBinding: byCompactId.has(element.end)
        ? { elementId: byCompactId.get(element.end)?.id, focus: 0, gap: 4 }
        : null,
      startArrowhead: null,
      endArrowhead: element.endArrowhead === "none" ? null : element.endArrowhead,
      elbowed: false,
    });
    // Register the arrow on its bound shapes so selection highlights work.
    for (const boundId of [element.start, element.end]) {
      const bound = byCompactId.get(boundId);
      if (bound) {
        appendBound(bound, { id: el.id, type: "arrow" });
      }
    }
    output.push(el);
    // Arrow labels bind to the arrow itself.
    if (element.label) {
      const midX = (startPoint.x + endPoint.x) / 2;
      const midY = (startPoint.y + endPoint.y) / 2;
      const label = boundTextFor(
        el.id,
        { x: midX - 40, y: midY - 12, width: 80, height: 24 },
        element.label,
        16,
      );
      output.push(label);
      appendBound(el, { id: label.id, type: "text" });
    }
  }

  // Pass 4 — standalone text elements.
  for (const element of elements) {
    if (element.kind !== "text") {
      continue;
    }
    const el = baseElement(element.id, element.x, element.y);
    el.id = `${idPrefix}_${element.id}_${randomSeed().toString(36)}`;
    el.type = "text";
    el.strokeWidth = 1;
    const fontSize = element.text.length > 80 ? 20 : 28;
    Object.assign(el, {
      text: element.text,
      originalText: element.text,
      fontSize,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      autoResize: true,
      lineHeight: 1.25,
      width: Math.min(400, element.text.length * fontSize * 0.6),
      height: fontSize * 1.25,
    });
    output.push(el);
  }

  return output;
}
