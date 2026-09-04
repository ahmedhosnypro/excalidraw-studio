import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server, type Socket } from "socket.io";

/**
 * Realtime collaboration relay for Excalidraw Studio.
 *
 * Browser clients connect through the gateway with engine path "/" and the
 * `XTransformPort=3003` query param (verified: both polling and websocket
 * upgrades forward correctly). Each active share token gets one room
 * (`share:<token>`) shared by the owner editor and any number of guests.
 *
 * An internal HTTP endpoint on port 3004 (localhost only) lets the Next.js
 * GraphQL layer push events into rooms: comment-added, reactions, and
 * scene-saved (server-side scene changes such as version restores).
 */

const WS_PORT = 3003;
const INTERNAL_PORT = 3004;
const INTERNAL_SECRET = process.env.REALTIME_INTERNAL_SECRET ?? "dev-realtime-secret";

/** Participant color palette (hex — applied inline, theme-agnostic). */
const PALETTE = [
  "#0ea5e9", // sky
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#d946ef", // fuchsia
  "#14b8a6", // teal
  "#f97316", // orange
] as const;

interface Participant {
  id: string;
  role: "owner" | "guest";
  name: string;
  color: string;
}

interface JoinPayload {
  token?: unknown;
  role?: unknown;
  name?: unknown;
  color?: unknown;
}

interface CursorPayload {
  x?: unknown;
  y?: unknown;
}

interface ViewportPayload {
  scrollX?: unknown;
  scrollY?: unknown;
  zoom?: unknown;
}

interface SceneSavedPayload {
  fileId?: unknown;
}

interface CommentAddedPayload {
  authorName?: unknown;
  isGuest?: unknown;
  body?: unknown;
}

interface InternalNotifyBody {
  token?: unknown;
  event?: unknown;
  payload?: unknown;
}

/** Minimal non-empty trimmed string check with a length cap. */
function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) {
    return null;
  }
  return trimmed;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Picks a stable palette color from a name hash. */
function colorForName(name: string): string {
  let hash = 0;
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    hash = (hash * 31 + code) % 997;
  }
  return PALETTE[hash % PALETTE.length] ?? "#0ea5e9";
}

// ---------------------------------------------------------------------------
// Socket relay
// ---------------------------------------------------------------------------

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 20_000,
  pingTimeout: 25_000,
});

/** Server-side cursor relay throttle (participants can be chatty). */
const CURSOR_MIN_INTERVAL_MS = 33;

const lastCursorAt = new Map<string, number>();

function roomFor(token: string): string {
  return `share:${token}`;
}

/** Current participants of a room (socket → Participant). */
function participantsOf(token: string): Participant[] {
  const ids = io.sockets.adapter.rooms.get(roomFor(token)) ?? new Set<string>();
  const participants: Participant[] = [];
  for (const id of ids) {
    const socket = io.sockets.sockets.get(id);
    const participant = socket?.data.participant as Participant | undefined;
    if (participant) {
      participants.push(participant);
    }
  }
  return participants;
}

io.on("connection", (socket: Socket) => {
  socket.data.participant = null;
  socket.data.token = null;

  socket.on("rt:join", (raw: JoinPayload) => {
    const token = cleanString(raw?.token, 128);
    const role = raw?.role === "owner" ? "owner" : raw?.role === "guest" ? "guest" : null;
    const name = cleanString(raw?.name, 60);
    if (!token || !role || !name) {
      socket.emit("rt:error", { message: "Invalid join payload." });
      return;
    }
    // Leave any previous room first (token switches when the owner opens
    // another file, or the viewer reloads with a different link).
    if (typeof socket.data.token === "string" && socket.data.token !== token) {
      void socket.leave(roomFor(socket.data.token));
    }
    socket.data.token = token;
    const requestedColor = cleanString(raw?.color, 32);
    socket.data.participant = {
      id: socket.id,
      role,
      name,
      color: requestedColor ?? colorForName(`${name}:${role}`),
    };
    void socket.join(roomFor(token));
    io.to(roomFor(token)).emit("rt:presence", { participants: participantsOf(token) });
  });

  socket.on("rt:cursor", (raw: CursorPayload) => {
    const token = socket.data.token;
    const participant = socket.data.participant;
    const x = finiteNumber(raw?.x);
    const y = finiteNumber(raw?.y);
    if (typeof token !== "string" || !participant || x === null || y === null) {
      return;
    }
    const now = Date.now();
    const last = lastCursorAt.get(socket.id) ?? 0;
    if (now - last < CURSOR_MIN_INTERVAL_MS) {
      return;
    }
    lastCursorAt.set(socket.id, now);
    socket.to(roomFor(token)).emit("rt:cursor", { id: socket.id, x, y });
  });

  // Owner viewport broadcast → guests can "follow" the owner's pan/zoom.
  socket.on("rt:viewport", (raw: ViewportPayload) => {
    const token = socket.data.token;
    const participant = socket.data.participant;
    const scrollX = finiteNumber(raw?.scrollX);
    const scrollY = finiteNumber(raw?.scrollY);
    const zoom = finiteNumber(raw?.zoom);
    if (
      typeof token !== "string" ||
      !participant ||
      participant.role !== "owner" ||
      scrollX === null ||
      scrollY === null ||
      zoom === null ||
      zoom <= 0 ||
      zoom > 100
    ) {
      return;
    }
    socket.to(roomFor(token)).emit("rt:viewport", { scrollX, scrollY, zoom });
  });

  // Owner saved the scene → viewers refetch it.
  socket.on("rt:scene-saved", (raw: SceneSavedPayload) => {
    const token = socket.data.token;
    const participant = socket.data.participant;
    const fileId = cleanString(raw?.fileId, 64);
    if (typeof token !== "string" || !participant || participant.role !== "owner") {
      return;
    }
    socket.to(roomFor(token)).emit("rt:scene-saved", { fileId });
  });

  socket.on("disconnect", () => {
    lastCursorAt.delete(socket.id);
    const token = socket.data.token;
    const participant = socket.data.participant;
    if (typeof token === "string" && participant) {
      socket.data.participant = null;
      io.to(roomFor(token)).emit("rt:presence", { participants: participantsOf(token) });
    }
  });
});

// ---------------------------------------------------------------------------
// Internal notify endpoint (localhost only; called by the GraphQL layer)
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const internalServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST" || req.url?.split("?")[0] !== "/internal/notify") {
    res.writeHead(404).end();
    return;
  }
  if (req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = JSON.parse(await readBody(req)) as InternalNotifyBody;
    const token = cleanString(body?.token, 128);
    if (!token) {
      res.writeHead(400).end();
      return;
    }
    if (body?.event === "reactions") {
      // A comment's reactions changed — everyone refetches the thread list.
      io.to(roomFor(token)).emit("rt:reactions", {});
      res.writeHead(204).end();
      return;
    }
    if (body?.event === "scene-saved") {
      // Server-side scene change (e.g. version restore) — viewers refetch.
      const payload = body?.payload as SceneSavedPayload | undefined;
      const fileId = cleanString(payload?.fileId, 64);
      if (fileId) {
        io.to(roomFor(token)).emit("rt:scene-saved", { fileId });
      }
      res.writeHead(204).end();
      return;
    }
    const payload = body?.payload as CommentAddedPayload | undefined;
    const authorName = cleanString(payload?.authorName, 60);
    const commentBody = cleanString(payload?.body, 2000);
    const isGuest = payload?.isGuest === true;
    if (body?.event === "comment-added" && authorName && commentBody) {
      io.to(roomFor(token)).emit("rt:comment-added", { authorName, isGuest, body: commentBody });
    }
    res.writeHead(204).end();
  } catch {
    res.writeHead(400).end();
  }
});

httpServer.listen(WS_PORT, () => {
  console.log(`[realtime] socket relay listening on :${WS_PORT} (engine path "/")`);
});

internalServer.listen(INTERNAL_PORT, "127.0.0.1", () => {
  console.log(`[realtime] internal notify endpoint on 127.0.0.1:${INTERNAL_PORT}`);
});
