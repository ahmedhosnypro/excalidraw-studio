import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLObjectType, GraphQLString } from "graphql";

import type { CommentRow, FileRow, UserRow } from "@/db/schema";

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
  },
});

interface CommentAuthorOutput {
  id: string;
  name: string;
}

/** Full comment shape returned by `comments(fileId)` and its mutations. */
export const CommentType: GraphQLObjectType = new GraphQLObjectType({
  name: "Comment",
  description: "A comment thread entry, optionally pinned to canvas coordinates.",
  fields: {
    id: { type: GraphQLID },
    fileId: { type: GraphQLID },
    body: { type: GraphQLString },
    x: { type: GraphQLFloat },
    y: { type: GraphQLFloat },
    resolved: { type: GraphQLBoolean },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
    author: { type: CommentAuthorType },
  },
});

export interface CommentOutput {
  id: string;
  fileId: string;
  body: string;
  x: number | null;
  y: number | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthorOutput | null;
}

export function toCommentOutput(
  row: CommentRow,
  author: { id: string; name: string } | null,
): CommentOutput {
  return {
    id: row.id,
    fileId: row.fileId,
    body: row.body,
    x: row.x,
    y: row.y,
    resolved: row.resolved,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author,
  };
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
