import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from "graphql";

import type { CommentRow, FileRow, SceneSnapshotRow, UserRow } from "@/db/schema";

import { GraphQLJSON } from "./scalars";

/** Shared user shape returned by `me` and the auth mutations. */
export const UserType: GraphQLObjectType = new GraphQLObjectType({
  name: "User",
  description: "A signed-up studio user.",
  fields: {
    id: { type: GraphQLID },
    email: { type: GraphQLString },
    name: { type: GraphQLString },
    createdAt: { type: GraphQLString },
  },
});

export interface UserOutput {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export function toUserOutput(row: UserRow): UserOutput {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Author reference embedded on comments. */
const CommentAuthorType: GraphQLObjectType = new GraphQLObjectType({
  name: "CommentAuthor",
  description: "Author of a comment.",
  fields: {
    id: { type: GraphQLID },
    name: { type: GraphQLString },
    isGuest: {
      type: GraphQLBoolean,
      description: "True when the author is a shared-link guest (no account).",
    },
  },
});

interface CommentAuthorOutput {
  id: string;
  name: string;
  isGuest: boolean;
}

export type { CommentAuthorOutput };

/** One emoji reaction aggregate on a comment (per viewer `mine` flag). */
const CommentReactionType: GraphQLObjectType = new GraphQLObjectType({
  name: "CommentReaction",
  description: "Emoji reactions aggregated per emoji on a comment.",
  fields: {
    emoji: { type: GraphQLString },
    count: { type: GraphQLInt },
    mine: {
      type: GraphQLBoolean,
      description: "True when the requesting viewer added this emoji.",
    },
  },
});

export interface CommentReactionOutput {
  emoji: string;
  count: number;
  mine: boolean;
}

/** Full comment shape returned by `comments(fileId)` and its mutations. */
export const CommentType: GraphQLObjectType = new GraphQLObjectType({
  name: "Comment",
  description: "A comment thread entry, optionally pinned to canvas coordinates.",
  fields: {
    id: { type: GraphQLID },
    fileId: { type: GraphQLID },
    body: { type: GraphQLString },
    parentId: {
      type: GraphQLID,
      description: "Top-level comment this entry replies to, if any.",
    },
    x: { type: GraphQLFloat },
    y: { type: GraphQLFloat },
    resolved: { type: GraphQLBoolean },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
    author: { type: CommentAuthorType },
    reactions: {
      type: new GraphQLList(new GraphQLNonNull(CommentReactionType)),
      description: "Emoji reactions on this comment, aggregated per emoji.",
    },
  },
});

export interface CommentOutput {
  id: string;
  fileId: string;
  body: string;
  parentId: string | null;
  x: number | null;
  y: number | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthorOutput | null;
  reactions: CommentReactionOutput[];
}

export function toCommentOutput(
  row: CommentRow,
  author: CommentAuthorOutput | null,
  reactions: CommentReactionOutput[] = [],
): CommentOutput {
  return {
    id: row.id,
    fileId: row.fileId,
    body: row.body,
    parentId: row.parentId,
    x: row.x,
    y: row.y,
    resolved: row.resolved,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author,
    reactions,
  };
}

/** Metadata about a share-link target, visible to guests (no scene data). */
export const SharedFileType: GraphQLObjectType = new GraphQLObjectType({
  name: "SharedFile",
  description: "Public metadata of a file a share token points to.",
  fields: {
    id: { type: GraphQLID },
    name: { type: GraphQLString },
    ownerName: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  },
});

/** Storage footprint of the viewer's scenes. */
export const StorageUsageType: GraphQLObjectType = new GraphQLObjectType({
  name: "StorageUsage",
  description: "Total storage used by the viewer's scene files.",
  fields: {
    bytes: { type: GraphQLInt },
    fileCount: { type: GraphQLInt },
  },
});

/** Metadata row of one version-history snapshot (content fetched on demand). */
export const SceneSnapshotType: GraphQLObjectType = new GraphQLObjectType({
  name: "SceneSnapshot",
  description: "A restorable point-in-time copy of a drawing (version history).",
  fields: {
    id: { type: GraphQLID },
    fileId: { type: GraphQLID },
    label: {
      type: GraphQLString,
      description: "User label; null for automatic snapshots.",
    },
    elementCount: { type: GraphQLInt },
    createdAt: { type: GraphQLString },
  },
});

export interface SceneSnapshotOutput {
  id: string;
  fileId: string;
  label: string | null;
  elementCount: number;
  createdAt: string;
}

export function toSnapshotOutput(row: SceneSnapshotRow): SceneSnapshotOutput {
  return {
    id: row.id,
    fileId: row.fileId,
    label: row.label,
    elementCount: row.elementCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface StorageUsageOutput {
  bytes: number;
  fileCount: number;
}

/**
 * Scene payload returned by `scene(fileId)` and accepted by `saveScene`.
 * `elements` / `appState` / `files` are opaque Excalidraw JSON.
 */
export const SceneDataType: GraphQLObjectType = new GraphQLObjectType({
  name: "SceneData",
  description: "Excalidraw scene contents (opaque JSON blobs).",
  fields: {
    elements: { type: GraphQLJSON },
    appState: { type: GraphQLJSON },
    files: { type: GraphQLJSON },
  },
});

export interface SceneDataOutput {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/**
 * Shape returned by file mutations. Matches the drizzle-graphql-generated
 * `FilesSelectItem` type so the Apollo cache treats rows uniformly.
 */
export interface FileOutput {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function toFileOutput(row: FileRow): FileOutput {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * AI text-to-diagram result: validated Excalidraw elements (without the
 * `index` field — assigned client-side when appending to a live scene).
 */
export const GenerateDiagramType: GraphQLObjectType = new GraphQLObjectType({
  name: "GenerateDiagramResult",
  description: "AI-generated Excalidraw elements for a prompt.",
  fields: {
    elements: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLJSON))),
    },
    elementCount: { type: new GraphQLNonNull(GraphQLInt) },
  },
});

/** One personal library item (Excalidraw library v2 shape). */
const LibraryItemType: GraphQLObjectType = new GraphQLObjectType({
  name: "LibraryItem",
  description: "One saved group of Excalidraw elements in the personal library.",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    status: { type: new GraphQLNonNull(GraphQLString) },
    created: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLString },
    elements: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLJSON))),
    },
  },
});

/** The viewer's whole personal library (account-synced). */
export const LibraryType: GraphQLObjectType = new GraphQLObjectType({
  name: "Library",
  description: "The viewer's personal element library, synced to their account.",
  fields: {
    items: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LibraryItemType))) },
    updatedAt: { type: GraphQLString },
  },
});

export interface LibraryItemOutput {
  id: string;
  status: string;
  created: string;
  name: string | null;
  elements: unknown[];
}

export interface LibraryOutput {
  items: LibraryItemOutput[];
  updatedAt: string | null;
}
