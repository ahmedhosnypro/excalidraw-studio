import ZAI from "z-ai-web-dev-sdk";

import { gqlError } from "@/server/graphql/errors";

/**
 * AI text-to-diagram generation: turns a natural-language prompt into a set
 * of Excalidraw elements via the server-side LLM. The model emits a compact
 * element format which this module validates and expands into full
 * Excalidraw elements (defaults, bound labels, arrow bindings).
 */

// ---------------------------------------------------------------------------
// Rate limiting (per-user, in-memory — personal-scale deployments)
// ---------------------------------------------------------------------------

const AI_RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 8 } as const;
const aiHits = new Map<string, number[]>();

function checkAiRateLimit(userId: string): void {
  const now = Date.now();
  const cutoff = now - AI_RATE_LIMIT.windowMs;
  const hits = (aiHits.get(userId) ?? []).filter((time) => time > cutoff);
  if (hits.length >= AI_RATE_LIMIT.max) {
    throw gqlError(
      "BAD_USER_INPUT",
      "AI generation is temporarily throttled — please try again in a few minutes.",
    );
  }
  hits.push(now);
  aiHits.set(userId, hits);
  if (aiHits.size > 1000) {
    for (const [key, times] of aiHits) {
      if (times.every((time) => time <= cutoff)) {
        aiHits.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// LLM contract (compact element format)
// ---------------------------------------------------------------------------

interface LlmShape {
  kind: "shape";
  shape: "rectangle" | "ellipse" | "diamond";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
}

interface LlmArrow {
  kind: "arrow";
  id: string;
  start: string;
  end: string;
  label: string | null;
  dashed: boolean;
  endArrowhead: "arrow" | "none" | "triangle";
}

interface LlmText {
  kind: "text";
  id: string;
  x: number;
  y: number;
  text: string;
}

type LlmElement = LlmShape | LlmArrow | LlmText;

const MAX_ELEMENTS = 40;
const MAX_TEXT_CHARS = 240;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().slice(0, max);
  return trimmed.length === 0 ? null : trimmed;
}

/** Parses + sanitizes the model's raw JSON into the compact element union. */
function parseLlmElements(raw: string): LlmElement[] {
  let text = raw.trim();
  // Strip accidental markdown fences.
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    // Last resort: models occasionally prepend a sentence — grab the outermost
    // JSON object instead of failing outright.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw gqlError(
        "INTERNAL_SERVER_ERROR",
        "The AI returned an unreadable response — try again.",
      );
    }
    try {
      parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    } catch {
      throw gqlError(
        "INTERNAL_SERVER_ERROR",
        "The AI returned an unreadable response — try again.",
      );
    }
  }
  const container = parsed as { elements?: unknown };
  const list = Array.isArray(container?.elements)
    ? (container.elements as unknown[])
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : null;
  if (!list) {
    throw gqlError("INTERNAL_SERVER_ERROR", "The AI returned an unexpected format — try again.");
  }

  const seenIds = new Set<string>();
  const elements: LlmElement[] = [];
  for (const entry of list.slice(0, MAX_ELEMENTS)) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const type = typeof raw.type === "string" ? raw.type : "";
    const id = typeof raw.id === "string" ? raw.id.slice(0, 32) : "";
    if (id.length === 0 || seenIds.has(id)) {
      continue;
    }
    if (type === "rectangle" || type === "ellipse" || type === "diamond") {
      seenIds.add(id);
      elements.push({
        kind: "shape",
        shape: type,
        id,
        x: clampNumber(raw.x, -10000, 20000, 0),
        y: clampNumber(raw.y, -10000, 20000, 0),
        width: clampNumber(raw.width, 24, 4000, 160),
        height: clampNumber(raw.height, 24, 4000, 80),
        label: cleanText(raw.label, 80),
      });
    } else if (type === "arrow") {
      const start = typeof raw.start === "string" ? raw.start.slice(0, 32) : "";
      const end = typeof raw.end === "string" ? raw.end.slice(0, 32) : "";
      if (start.length === 0 || end.length === 0) {
        continue;
      }
      seenIds.add(id);
      const head =
        raw.endArrowhead === "none"
          ? "none"
          : raw.endArrowhead === "triangle"
            ? "triangle"
            : "arrow";
      elements.push({
        kind: "arrow",
        id,
        start,
        end,
        label: cleanText(raw.label, 60),
        dashed: raw.dashed === true,
        endArrowhead: head,
      });
    } else if (type === "text") {
      const textContent = cleanText(raw.text, MAX_TEXT_CHARS);
      if (!textContent) {
        continue;
      }
      seenIds.add(id);
      elements.push({
        kind: "text",
        id,
        x: clampNumber(raw.x, -10000, 20000, 0),
        y: clampNumber(raw.y, -10000, 20000, 0),
        text: textContent,
      });
    }
  }
  if (elements.length === 0) {
    throw gqlError(
      "BAD_USER_INPUT",
      "The AI could not produce a diagram from that prompt — try describing it differently.",
    );
  }
  return elements;
}

// ---------------------------------------------------------------------------
// Compact → Excalidraw element expansion
// ---------------------------------------------------------------------------

/** Base fields shared by every Excalidraw element (loosely typed on purpose:
 * the server never touches these beyond assembling known-good defaults). */
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
    id: `ai_${id}_${randomSeed().toString(36)}`,
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
 * Expands validated LLM elements into full Excalidraw elements (labels become
 * bound text, arrows get bindings + geometry). Output lacks the `index` field
 * — the client assigns fractional indices when appending to a live scene.
 */
function llmToExcalidrawElements(elements: LlmElement[]): Record<string, unknown>[] {
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
    const label = boundTextFor(
      byCompactId.get(element.id)?.id ?? element.id,
      box,
      element.label,
      20,
    );
    output.push(label);
    const container = byCompactId.get(element.id);
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

// ---------------------------------------------------------------------------
// LLM invocation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a diagram generator for Excalidraw. Convert the user's description into a clean, well-laid-out diagram.

Respond with STRICT JSON only — no markdown fences, no commentary, no explanation. Shape:
{"elements":[ ... ]}

Element schemas:
- Box / process / node: {"type":"rectangle","id":"n1","x":0,"y":0,"width":180,"height":70,"label":"short label"}
- Rounded / start / end state: {"type":"ellipse","id":"n2","x":0,"y":0,"width":160,"height":70,"label":"start"}
- Decision / branch: {"type":"diamond","id":"n3","x":0,"y":0,"width":180,"height":100,"label":"choice?"}
- Connection: {"type":"arrow","id":"n4","start":"n1","end":"n2","label":"optional","dashed":false,"endArrowhead":"arrow"}
- Loose annotation: {"type":"text","id":"n5","x":0,"y":0,"text":"a note"}

Layout rules:
- x grows right, y grows down. Use the region x 0..1600, y 0..900.
- Shapes at least 150x60. At least 80px spacing. NEVER overlap shapes.
- For flow diagrams lay out top-to-bottom (increasing y) or left-to-right (increasing x) in clear columns/rows.
- Arrows must reference existing shape ids (start/end). Text may also be referenced.
- Labels short (max 20 chars). 3..14 shapes is ideal. Include arrows between related steps.
- id strings are unique and short ("n1", "n2", ...).

Output ONLY the JSON object.`;

export interface GenerateDiagramResult {
  elements: Record<string, unknown>[];
  elementCount: number;
}

export async function generateDiagramFromPrompt(
  userId: string,
  rawPrompt: unknown,
): Promise<GenerateDiagramResult> {
  checkAiRateLimit(userId);
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim().slice(0, 2000) : "";
  if (prompt.length < 8) {
    throw gqlError("BAD_USER_INPUT", "Describe the diagram you want in a few more words.");
  }

  let content: string | null | undefined;
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      thinking: { type: "disabled" },
    });
    content = completion.choices[0]?.message?.content;
  } catch {
    throw gqlError(
      "INTERNAL_SERVER_ERROR",
      "The AI service is unavailable right now — please try again shortly.",
    );
  }
  if (!content || content.trim().length === 0) {
    throw gqlError("INTERNAL_SERVER_ERROR", "The AI returned an empty response — try again.");
  }

  const elements = llmToExcalidrawElements(parseLlmElements(content));
  return { elements, elementCount: elements.length };
}
