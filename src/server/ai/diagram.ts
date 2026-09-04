import ZAI from "z-ai-web-dev-sdk";

import { expandCompactElements } from "@/lib/element-factory";
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

// ---------------------------------------------------------------------------
// JSON parsing with escalating repair (models occasionally emit near-JSON)
// ---------------------------------------------------------------------------

/**
 * Common LLM JSON malformations, repaired in order:
 * - backticks used as quotes: `"y=`600` → `"y"=600`
 * - `=` used as key separator: `"y"=600` → `"y":600`
 * - quoted numbers: `"width":"200"` → `"width":200`
 * - trailing commas before `}` / `]`
 */
function repairJsonFragment(raw: string): string {
  return raw
    .replace(/`/g, '"')
    .replace(/"(\w+)"\s*=/g, '"$1":')
    .replace(/"(\w+)":"(-?\d+(?:\.\d+)?)"/g, '"$1":$2')
    .replace(/,\s*([}\]])/g, "$1");
}

/** Tries JSON.parse with fence-stripping + outermost-object extraction. */
function tryParseJson(text: string): unknown | null {
  let candidate = text.trim();
  if (candidate.startsWith("```")) {
    candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    // Models occasionally prepend a sentence — grab the outermost JSON object.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Extracts balanced `{"type":…}` objects and parses each individually. */
function salvageElementObjects(text: string): unknown[] {
  const out: unknown[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('{"type"', cursor);
    if (start < 0) {
      break;
    }
    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) {
      break;
    }
    const fragment = text.slice(start, end + 1);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(fragment) as unknown;
    } catch {
      try {
        parsed = JSON.parse(repairJsonFragment(fragment)) as unknown;
      } catch {
        parsed = null;
      }
    }
    if (parsed !== null) {
      out.push(parsed);
    }
    cursor = end + 1;
  }
  return out;
}

/** Extracts the element list from a parsed container ({elements:[…]}) or bare array. */
function elementListOf(parsed: unknown): unknown[] | null {
  const container = parsed as { elements?: unknown };
  return Array.isArray(container?.elements)
    ? (container.elements as unknown[])
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : null;
}

/** Parses + sanitizes the model's raw JSON into the compact element union. */
function parseLlmElements(raw: string): LlmElement[] {
  const text = raw.trim();
  let parsed = tryParseJson(text);
  let list: unknown[] | null = parsed !== null ? elementListOf(parsed) : null;
  // Escalating repair: fix common malformations, then salvage individual
  // element objects from partially broken output.
  if (list === null) {
    const repaired = repairJsonFragment(text);
    parsed = tryParseJson(repaired);
    if (parsed !== null) {
      list = elementListOf(parsed);
    }
  }
  if (list === null) {
    const salvageSource = repairJsonFragment(text);
    const salvaged = salvageElementObjects(salvageSource);
    const fromOuter = salvageElementObjects(text);
    const merged = salvaged.length >= fromOuter.length ? salvaged : fromOuter;
    if (merged.length > 0) {
      list = merged;
    }
  }
  if (list === null) {
    throw gqlError("INTERNAL_SERVER_ERROR", "The AI returned an unreadable response — try again.");
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

const IMPROVE_SYSTEM_PROMPT = `You are a diagram editor for Excalidraw. The user gives you the CURRENT elements of a diagram (compact JSON) plus an INSTRUCTION. Apply the instruction and return the COMPLETE revised set of elements.

Respond with STRICT JSON only — no markdown fences, no commentary. Shape:
{"elements":[ ... ]}

Use the exact same element schema as the input:
- {"type":"rectangle"|"ellipse"|"diamond","id":"n1","x":0,"y":0,"width":180,"height":70,"label":"short label"}
- {"type":"arrow","id":"a1","start":"n1","end":"n2","label":"optional","dashed":false,"endArrowhead":"arrow"}
- {"type":"text","id":"t1","x":0,"y":0,"text":"a note"}

Editing rules:
- Return the FULL element list after the edit (kept elements + changed + added). Omit deleted elements.
- PRESERVATION: unless the instruction explicitly removes something, EVERY input element must still appear in your output (possibly moved, resized or relabeled). Silently dropping elements is a critical failure.
- Keep ids of unchanged elements stable so they stay recognizable; new elements get fresh short ids.
- Follow the user's instruction faithfully. Common edits: rearrange layout, add/remove steps, rename labels, change shape types, add branch arrows.
- x grows right, y grows down. Shapes at least 150x60, at least 80px apart, NEVER overlapping. Keep coordinates close to the input region unless the instruction implies a relayout.
- Arrows must reference ids present in your returned set. Labels max 20 chars.
- Do not add decorative commentary elements beyond what the instruction asks.

Output ONLY the JSON object.`;

/** Compact element format the client sends when improving a selection. */
interface CompactSelectionElement {
  type: string;
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: string | null;
  text?: string | null;
  start?: string | null;
  end?: string | null;
}

const MAX_SELECTION_ELEMENTS = 40;

/** Validates the client-supplied compact selection (ids, sizes, text). */
function validateCompactSelection(raw: unknown): CompactSelectionElement[] {
  if (!Array.isArray(raw)) {
    throw gqlError("BAD_USER_INPUT", "Selection must be a list of elements.");
  }
  const seenIds = new Set<string>();
  const out: CompactSelectionElement[] = [];
  for (const entry of raw.slice(0, MAX_SELECTION_ELEMENTS)) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const element = entry as Record<string, unknown>;
    const type = typeof element.type === "string" ? element.type : "";
    const id = typeof element.id === "string" ? element.id.slice(0, 32) : "";
    if (id.length === 0 || seenIds.has(id)) {
      continue;
    }
    if (
      type === "rectangle" ||
      type === "ellipse" ||
      type === "diamond" ||
      type === "arrow" ||
      type === "text"
    ) {
      seenIds.add(id);
      out.push({
        type,
        id,
        x: clampNumber(element.x, -100000, 100000, 0),
        y: clampNumber(element.y, -100000, 100000, 0),
        width: clampNumber(element.width, 0, 100000, 160),
        height: clampNumber(element.height, 0, 100000, 80),
        label: cleanText(element.label, 80),
        text: cleanText(element.text, MAX_TEXT_CHARS),
        start: typeof element.start === "string" ? element.start.slice(0, 32) : null,
        end: typeof element.end === "string" ? element.end.slice(0, 32) : null,
      });
    }
  }
  if (out.length === 0) {
    throw gqlError("BAD_USER_INPUT", "Select at least one shape, arrow or text to improve.");
  }
  return out;
}

export interface GenerateDiagramResult {
  elements: Record<string, unknown>[];
  elementCount: number;
}

/** Runs the LLM (system + user message) and expands its JSON into elements. */
async function completeDiagramElements(
  systemPrompt: string,
  userMessage: string,
): Promise<Record<string, unknown>[]> {
  let content: string | null | undefined;
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: userMessage },
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
  return expandCompactElements(parseLlmElements(content), "ai");
}

/** Rate-limits the user + validates the prompt, returning its trimmed form. */
function requireAIPrompt(userId: string, rawPrompt: unknown, tooShortHint: string): string {
  checkAiRateLimit(userId);
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim().slice(0, 2000) : "";
  if (prompt.length < 8) {
    throw gqlError("BAD_USER_INPUT", tooShortHint);
  }
  return prompt;
}

export async function generateDiagramFromPrompt(
  userId: string,
  rawPrompt: unknown,
): Promise<GenerateDiagramResult> {
  const prompt = requireAIPrompt(
    userId,
    rawPrompt,
    "Describe the diagram you want in a few more words.",
  );

  const elements = await completeDiagramElements(SYSTEM_PROMPT, prompt);
  return { elements, elementCount: elements.length };
}

export async function improveDiagramSelection(
  userId: string,
  rawPrompt: unknown,
  rawSelection: unknown,
): Promise<GenerateDiagramResult> {
  const prompt = requireAIPrompt(
    userId,
    rawPrompt,
    "Describe the change you want in a few more words.",
  );
  const selection = validateCompactSelection(rawSelection);

  const userMessage = `INSTRUCTION: ${prompt}

CURRENT ELEMENTS:
${JSON.stringify({ elements: selection })}`;

  const elements = await completeDiagramElements(IMPROVE_SYSTEM_PROMPT, userMessage);
  return { elements, elementCount: elements.length };
}
