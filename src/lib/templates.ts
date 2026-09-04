import { generateNKeysBetween } from "fractional-indexing";

import { type CompactElementSpec, expandCompactElements } from "@/lib/element-factory";

/**
 * Built-in starter templates for new drawings. Each template is authored in
 * the compact element spec format and expanded into full Excalidraw elements
 * on demand (no server round-trip).
 */

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Grouping label rendered as filter chips in the gallery. */
  category: string;
  /** Extra search terms beyond name/description (lower-cased). */
  keywords: string[];
  /** Compact element specs — expanded lazily via `templateElements`. */
  specs: CompactElementSpec[];
}

const shape = (
  id: string,
  shape: "rectangle" | "ellipse" | "diamond",
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
): CompactElementSpec => ({
  kind: "shape",
  shape,
  id,
  x,
  y,
  width,
  height,
  label,
});

const arrow = (
  id: string,
  start: string,
  end: string,
  label: string | null = null,
  dashed = false,
): CompactElementSpec => ({
  kind: "arrow",
  id,
  start,
  end,
  label,
  dashed,
  endArrowhead: "arrow",
});

const text = (id: string, x: number, y: number, body: string): CompactElementSpec => ({
  kind: "text",
  id,
  x,
  y,
  text: body,
});

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: "flowchart",
    name: "Basic flowchart",
    description: "A vertical decision flow with a retry loop.",
    emoji: "🧭",
    category: "Diagrams",
    keywords: ["process", "decision", "workflow", "flow"],
    specs: [
      shape("n1", "ellipse", 400, 60, 180, 70, "Start"),
      shape("n2", "rectangle", 390, 200, 200, 70, "Step: do work"),
      shape("n3", "diamond", 380, 350, 220, 100, "Succeeded?"),
      shape("n4", "rectangle", 390, 520, 200, 70, "Fix the issue"),
      shape("n5", "ellipse", 400, 660, 180, 70, "Done"),
      arrow("a1", "n1", "n2"),
      arrow("a2", "n2", "n3"),
      arrow("a3", "n3", "n5", "yes"),
      arrow("a4", "n3", "n4", "no", true),
      arrow("a5", "n4", "n2", "retry", true),
    ],
  },
  {
    id: "kanban",
    name: "Kanban board",
    description: "Four columns to track work from backlog to done.",
    emoji: "🗂️",
    category: "Boards",
    keywords: ["agile", "tasks", "cards", "scrum"],
    specs: [
      shape("c1", "rectangle", 120, 100, 200, 500, "Backlog"),
      shape("c2", "rectangle", 380, 100, 200, 500, "To do"),
      shape("c3", "rectangle", 640, 100, 200, 500, "In progress"),
      shape("c4", "rectangle", 900, 100, 200, 500, "Done"),
      text("t1", 145, 200, "· First task"),
      text("t2", 405, 240, "· Second task"),
      text("t3", 665, 180, "· Current focus"),
      text("t4", 925, 260, "· Shipped"),
    ],
  },
  {
    id: "mindmap",
    name: "Mind map",
    description: "A central idea with four branches to explore.",
    emoji: "💭",
    category: "Diagrams",
    keywords: ["brainstorm", "ideas", "branches", "tree"],
    specs: [
      shape("c", "ellipse", 460, 330, 240, 110, "Central idea"),
      shape("b1", "rectangle", 80, 100, 200, 80, "Branch A"),
      shape("b2", "rectangle", 880, 100, 200, 80, "Branch B"),
      shape("b3", "rectangle", 80, 560, 200, 80, "Branch C"),
      shape("b4", "rectangle", 880, 560, 200, 80, "Branch D"),
      arrow("a1", "c", "b1"),
      arrow("a2", "c", "b2"),
      arrow("a3", "c", "b3"),
      arrow("a4", "c", "b4"),
    ],
  },
  {
    id: "retro",
    name: "Sprint retro",
    description: "Three columns for the team retrospective.",
    emoji: "🔄",
    category: "Boards",
    keywords: ["agile", "retrospective", "team", "meeting"],
    specs: [
      shape("c1", "rectangle", 120, 120, 280, 460, "Went well"),
      shape("c2", "rectangle", 470, 120, 280, 460, "To improve"),
      shape("c3", "rectangle", 820, 120, 280, 460, "Action items"),
      text("t1", 145, 210, "· Collaboration"),
      text("t2", 495, 210, "· Slow reviews"),
      text("t3", 845, 210, "· Pair Mondays"),
    ],
  },
  {
    id: "wireframe",
    name: "App wireframe",
    description: "A simple landing page layout sketch.",
    emoji: "📱",
    category: "Product",
    keywords: ["ui", "landing page", "layout", "web"],
    specs: [
      shape("nav", "rectangle", 120, 80, 880, 70, "Nav bar"),
      shape("hero", "rectangle", 120, 190, 520, 300, "Hero"),
      shape("heroText", "rectangle", 200, 260, 360, 50, "Headline"),
      shape("cta", "rectangle", 260, 350, 160, 50, "Get started"),
      shape("side", "rectangle", 690, 190, 310, 300, "Hero image"),
      shape("card1", "rectangle", 120, 530, 280, 160, "Feature one"),
      shape("card2", "rectangle", 420, 530, 280, 160, "Feature two"),
      shape("card3", "rectangle", 720, 530, 280, 160, "Feature three"),
      arrow("a1", "hero", "heroText"),
    ],
  },
  {
    id: "swimlanes",
    name: "Process lanes",
    description: "Two swimlanes showing a hand-off between teams.",
    emoji: "🏊",
    category: "Diagrams",
    keywords: ["swimlane", "teams", "handoff", "process"],
    specs: [
      shape("lane1", "rectangle", 120, 100, 1000, 260, "Team one"),
      shape("lane2", "rectangle", 120, 400, 1000, 260, "Team two"),
      shape("s1", "rectangle", 170, 180, 200, 70, "Request"),
      shape("s2", "rectangle", 470, 180, 200, 70, "Review"),
      shape("s3", "rectangle", 770, 180, 200, 70, "Approve"),
      shape("s4", "rectangle", 470, 480, 200, 70, "Build"),
      shape("s5", "rectangle", 770, 480, 200, 70, "Ship"),
      arrow("a1", "s1", "s2"),
      arrow("a2", "s2", "s3"),
      arrow("a3", "s3", "s4", "hand-off"),
      arrow("a4", "s4", "s5"),
    ],
  },
];

/** Expands a template's compact specs into full Excalidraw elements. */
export function templateElements(template: SceneTemplate): Record<string, unknown>[] {
  const elements = expandCompactElements(template.specs, "tpl");
  // Excalidraw mutates elements that lack a valid `index` (syncInvalidIndices)
  // — pre-assigned keys keep the stored scene immediately renderable and
  // safe against frozen-object errors when re-applied from query results.
  const keys = generateNKeysBetween(null, null, elements.length);
  return elements.map((element, i) => ({ ...element, index: keys[i] }));
}
