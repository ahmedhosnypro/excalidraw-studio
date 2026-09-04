import { io, type Socket } from "socket.io-client";
import { create } from "zustand";

/**
 * Realtime collaboration client: one shared socket (engine path "/" +
 * XTransformPort gateway query), rooms per share token. State (presence,
 * remote cursors, unread comments, live toasts) lives in a zustand store so
 * the presence stack, cursor overlay and comment badge all share it.
 */

const REALTIME_PORT = 3003;

export interface RealtimeParticipant {
  id: string;
  role: "owner" | "guest";
  name: string;
  color: string;
}

export interface RemoteCursor {
  id: string;
  x: number;
  y: number;
  name: string;
  color: string;
  updatedAt: number;
}

export interface RealtimeToast {
  id: number;
  kind: "join" | "leave" | "comment" | "scene";
  message: string;
}

export interface OwnerViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

interface RealtimeState {
  /** Connected and joined into the current room. */
  connected: boolean;
  /** Our own socket id (used to exclude ourselves from presence lists). */
  selfId: string | null;
  /** Share token of the joined room (null = idle). */
  roomToken: string | null;
  /** Our own role in the room. */
  selfRole: "owner" | "guest" | null;
  participants: RealtimeParticipant[];
  cursors: Record<string, RemoteCursor>;
  unreadComments: number;
  toasts: RealtimeToast[];
  /** Owner viewport broadcasts (viewer "follow" feature). */
  ownerViewport: OwnerViewport | null;
  /**
   * Increments whenever the owner saves the scene — the viewer listens and
   * refetches the shared scene.
   */
  sceneVersion: number;
  /**
   * Increments whenever any participant changes a reaction — comment tabs
   * listen and refetch their thread lists.
   */
  reactionsVersion: number;

  setJoined: (token: string, role: "owner" | "guest", selfId: string | null) => void;
  setSelfId: (selfId: string | null) => void;
  setDisconnected: () => void;
  setParticipants: (participants: RealtimeParticipant[]) => void;
  updateCursor: (id: string, x: number, y: number) => void;
  bumpUnreadComments: () => void;
  clearUnreadComments: () => void;
  setOwnerViewport: (viewport: OwnerViewport | null) => void;
  bumpSceneVersion: () => void;
  bumpReactionsVersion: () => void;
  pushToast: (kind: RealtimeToast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  selfId: null,
  roomToken: null,
  selfRole: null,
  participants: [],
  cursors: {},
  unreadComments: 0,
  toasts: [],
  ownerViewport: null,
  sceneVersion: 0,
  reactionsVersion: 0,

  setJoined: (token, role, selfId) =>
    set({
      connected: true,
      selfId,
      roomToken: token,
      selfRole: role,
      participants: [],
      cursors: {},
      ownerViewport: null,
    }),
  setSelfId: (selfId) => set({ selfId }),
  setDisconnected: () =>
    set({
      connected: false,
      selfId: null,
      roomToken: null,
      selfRole: null,
      participants: [],
      cursors: {},
      ownerViewport: null,
    }),
  setParticipants: (participants) => {
    set({ participants });
    // Drop cursors of participants that left.
    set((state) => {
      const alive = new Set(participants.map((participant) => participant.id));
      const next: Record<string, RemoteCursor> = {};
      for (const [id, cursor] of Object.entries(state.cursors)) {
        if (alive.has(id)) {
          next[id] = cursor;
        }
      }
      return { cursors: next };
    });
  },
  updateCursor: (id, x, y) =>
    set((state) => {
      const participant = state.participants.find((entry) => entry.id === id);
      if (!participant) {
        return state;
      }
      return {
        cursors: {
          ...state.cursors,
          [id]: {
            id,
            x,
            y,
            name: participant.name,
            color: participant.color,
            updatedAt: Date.now(),
          },
        },
      };
    }),
  bumpUnreadComments: () => set((state) => ({ unreadComments: state.unreadComments + 1 })),
  clearUnreadComments: () => set({ unreadComments: 0 }),
  setOwnerViewport: (viewport) => set({ ownerViewport: viewport }),
  bumpSceneVersion: () => set((state) => ({ sceneVersion: state.sceneVersion + 1 })),
  bumpReactionsVersion: () => set((state) => ({ reactionsVersion: state.reactionsVersion + 1 })),
  pushToast: (kind, message) =>
    set((state) => ({
      toasts: [...state.toasts, { id: Date.now() + Math.random(), kind, message }].slice(-4),
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/",
      query: { XTransformPort: REALTIME_PORT },
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    // Debug handle for E2E verification (dev-only aid, harmless in prod).
    (window as unknown as { __RT_DEBUG?: { socket: Socket } }).__RT_DEBUG = { socket };
  }
  return socket;
}

export interface JoinOptions {
  token: string;
  role: "owner" | "guest";
  name: string;
  /** Called for every new comment event (owner: badge; viewer: refetch). */
  onCommentAdded?: (event: { authorName: string; isGuest: boolean; body: string }) => void;
  /** Viewer-only: the owner saved the scene (refetch it). */
  onSceneSaved?: () => void;
  /** Viewer-only: the owner moved their viewport (follow mode). */
  onOwnerViewport?: (viewport: OwnerViewport) => void;
  /** Any participant changed a reaction (both roles refetch the thread). */
  onReactions?: () => void;
}

/** Joins (or switches) the realtime room for a share token. */
export function joinRealtimeRoom(options: JoinOptions): () => void {
  const socket = getSocket();
  const { token, role, name } = options;
  const store = useRealtimeStore.getState();

  const handleConnect = (): void => {
    useRealtimeStore.getState().setSelfId(socket.id ?? null);
    socket.emit("rt:join", { token, role, name });
  };
  const handlePresence = (event: { participants: RealtimeParticipant[] }): void => {
    const before = useRealtimeStore.getState().participants;
    useRealtimeStore.getState().setParticipants(event.participants);
    if (useRealtimeStore.getState().roomToken === token) {
      const beforeIds = new Set(before.map((participant) => participant.id));
      const nowIds = new Set(event.participants.map((participant) => participant.id));
      for (const participant of event.participants) {
        if (!beforeIds.has(participant.id) && participant.id !== socket.id) {
          useRealtimeStore
            .getState()
            .pushToast(
              "join",
              `${participant.name} joined${role === "owner" ? " via your link" : ""}`,
            );
        }
      }
      for (const participant of before) {
        if (!nowIds.has(participant.id)) {
          useRealtimeStore.getState().pushToast("leave", `${participant.name} left`);
        }
      }
    }
  };
  const handleCursor = (event: { id: string; x: number; y: number }): void => {
    useRealtimeStore.getState().updateCursor(event.id, event.x, event.y);
  };
  const handleComment = (event: { authorName: string; isGuest: boolean; body: string }): void => {
    if (useRealtimeStore.getState().roomToken !== token) {
      return;
    }
    const store2 = useRealtimeStore.getState();
    if (store2.selfRole === "owner") {
      store2.bumpUnreadComments();
      store2.pushToast("comment", `New comment from ${event.authorName}`);
    }
    options.onCommentAdded?.(event);
  };
  const handleSceneSaved = (): void => {
    if (useRealtimeStore.getState().roomToken !== token) {
      return;
    }
    useRealtimeStore.getState().bumpSceneVersion();
    options.onSceneSaved?.();
  };
  const handleViewport = (viewport: OwnerViewport): void => {
    if (useRealtimeStore.getState().roomToken !== token) {
      return;
    }
    useRealtimeStore.getState().setOwnerViewport(viewport);
    options.onOwnerViewport?.(viewport);
  };
  const handleReactions = (): void => {
    if (useRealtimeStore.getState().roomToken !== token) {
      return;
    }
    useRealtimeStore.getState().bumpReactionsVersion();
    options.onReactions?.();
  };
  const handleDisconnect = (): void => {
    useRealtimeStore.getState().setDisconnected();
  };

  socket.on("connect", handleConnect);
  socket.on("rt:presence", handlePresence);
  socket.on("rt:cursor", handleCursor);
  socket.on("rt:comment-added", handleComment);
  socket.on("rt:scene-saved", handleSceneSaved);
  socket.on("rt:viewport", handleViewport);
  socket.on("rt:reactions", handleReactions);
  socket.on("disconnect", handleDisconnect);

  if (socket.connected) {
    handleConnect();
  } else {
    socket.connect();
  }
  store.setJoined(token, role, socket.connected ? (socket.id ?? null) : null);

  return () => {
    socket.off("connect", handleConnect);
    socket.off("rt:presence", handlePresence);
    socket.off("rt:cursor", handleCursor);
    socket.off("rt:comment-added", handleComment);
    socket.off("rt:scene-saved", handleSceneSaved);
    socket.off("rt:viewport", handleViewport);
    socket.off("rt:reactions", handleReactions);
    socket.off("disconnect", handleDisconnect);
    if (useRealtimeStore.getState().roomToken === token) {
      socket.disconnect();
      useRealtimeStore.getState().setDisconnected();
    }
  };
}

/** Broadcasts our cursor position (scene coordinates). Fire-and-forget. */
export function emitRealtimeCursor(x: number, y: number): void {
  if (!socket?.connected) {
    return;
  }
  socket.emit("rt:cursor", { x, y });
}

/** Owner-only: announces a completed scene save to viewers. */
export function emitSceneSaved(fileId: string): void {
  if (!socket?.connected) {
    return;
  }
  socket.emit("rt:scene-saved", { fileId });
}

/** Owner-only: broadcasts the live viewport (viewers may follow it). */
export function emitOwnerViewport(scrollX: number, scrollY: number, zoom: number): void {
  if (!socket?.connected) {
    return;
  }
  socket.emit("rt:viewport", { scrollX, scrollY, zoom });
}
