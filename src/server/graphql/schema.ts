import { buildSchema } from "drizzle-graphql";
import {
  GraphQLBoolean,
  type GraphQLFieldConfig,
  GraphQLFloat,
  GraphQLID,
  GraphQLInputObjectType,
  type GraphQLInputType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";

import { db } from "@/db";
import { emptyScene, readScene } from "@/server/scenes";
import type { ApolloContext } from "./context";
import { assertAuthenticated } from "./errors";
import { loginMutation, logoutMutation, signupMutation } from "./resolvers/auth";
import {
  addComment,
  deleteComment,
  listComments,
  resolveComment,
  updateComment,
} from "./resolvers/comments";
import {
  createFile,
  deleteFile,
  duplicateFile,
  migrateGuestScene,
  parseFileName,
  renameFile,
  requireOwnedFile,
  saveScene,
} from "./resolvers/files";
import { GraphQLJSON } from "./scalars";
import { CommentType, type SceneDataOutput, SceneDataType, toUserOutput, UserType } from "./types";

// ---------------------------------------------------------------------------
// drizzle-graphql: generated entities (types, filters, queries).
// Only the viewer-scoped `files` / `filesSingle` queries are exposed; every
// mutation is hand-written below because it needs auth + storage + ownership
// semantics the generator cannot know about.
// ---------------------------------------------------------------------------
const generated = buildSchema(db, { relationsDepthLimit: 1 });

const filesSelectItem = generated.entities.types.FilesSelectItem;

interface GeneratedQueryField {
  type: unknown;
  args?: Record<string, { type: unknown }>;
  resolve: (
    source: unknown,
    args: Record<string, unknown>,
    context: unknown,
    info: unknown,
  ) => Promise<unknown>;
}

/**
 * Wraps a generated list/single query so `userId` is always pinned to the
 * authenticated viewer — client-supplied values for that column are ignored.
 */
function scopeGeneratedQueryToViewer(
  field: GeneratedQueryField,
): GraphQLFieldConfig<unknown, ApolloContext> {
  return {
    type: field.type as GraphQLFieldConfig<unknown, ApolloContext>["type"],
    args: field.args as GraphQLFieldConfig<unknown, ApolloContext>["args"],
    description:
      field === generated.entities.queries.files
        ? "Lists the viewer's files (server forces ownership filter)."
        : "Fetches a single file of the viewer (server forces ownership filter).",
    resolve: (source, args, context, info) => {
      assertAuthenticated(context.userId);
      const scoped = {
        ...args,
        where: {
          ...(args.where as Record<string, unknown> | undefined),
          userId: { eq: context.userId },
        },
      };
      return field.resolve(source, scoped, context, info);
    },
  };
}

// ---------------------------------------------------------------------------
// Custom object/input types
// ---------------------------------------------------------------------------

const sceneDataInput = new GraphQLInputObjectType({
  name: "SceneDataInput",
  description: "Excalidraw scene payload (opaque JSON blobs).",
  fields: {
    elements: { type: new GraphQLNonNull(GraphQLJSON) },
    appState: { type: GraphQLJSON },
    files: { type: GraphQLJSON },
  },
});

// ---------------------------------------------------------------------------
// Query fields
// ---------------------------------------------------------------------------

const meQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: UserType,
  description: "The currently signed-in user, or null for guests.",
  resolve: (_source, _args, context) => (context.user ? toUserOutput(context.user) : null),
};

const sceneQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: SceneDataType,
  description: "Loads the scene contents of a viewer-owned file.",
  args: {
    fileId: { type: new GraphQLNonNull(GraphQLID) },
  },
  resolve: async (_source, args, context): Promise<SceneDataOutput> => {
    assertAuthenticated(context.userId);
    const fileId = String(args.fileId);
    const row = await requireOwnedFile(fileId, context.userId);
    const scene = (await readScene(row.storageKey)) ?? emptyScene();
    return {
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
    };
  },
};

const commentsQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(CommentType))),
  description: "Lists comments of a viewer-owned file (oldest first).",
  args: {
    fileId: { type: new GraphQLNonNull(GraphQLID) },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return listComments(context.userId, String(args.fileId));
  },
};

// ---------------------------------------------------------------------------
// Mutation fields (files)
// ---------------------------------------------------------------------------

function fileMutationConfig(
  description: string,
  argSpec: Record<string, { type: GraphQLInputType }>,
  resolve: (
    source: unknown,
    args: Record<string, unknown>,
    context: ApolloContext,
  ) => Promise<unknown>,
): GraphQLFieldConfig<unknown, ApolloContext> {
  return {
    type: new GraphQLNonNull(filesSelectItem),
    description,
    args: argSpec,
    resolve,
  };
}

const createFileMutation = fileMutationConfig(
  "Create a new file with an empty scene.",
  { name: { type: new GraphQLNonNull(GraphQLString) } },
  (_source, args, context) => {
    assertAuthenticated(context.userId);
    return createFile(context.userId, parseFileName(args.name));
  },
);

const renameFileMutation = fileMutationConfig(
  "Rename a file you own.",
  {
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: new GraphQLNonNull(GraphQLString) },
  },
  (_source, args, context) => {
    assertAuthenticated(context.userId);
    return renameFile(context.userId, String(args.id), parseFileName(args.name));
  },
);

const duplicateFileMutation = fileMutationConfig(
  "Duplicate a file you own (scene included).",
  { id: { type: new GraphQLNonNull(GraphQLID) } },
  (_source, args, context) => {
    assertAuthenticated(context.userId);
    return duplicateFile(context.userId, String(args.id));
  },
);

const saveSceneMutation = fileMutationConfig(
  "Persist the current scene (autosave target). Bumps the file's updatedAt.",
  {
    fileId: { type: new GraphQLNonNull(GraphQLID) },
    data: { type: new GraphQLNonNull(sceneDataInput) },
  },
  (_source, args, context) => {
    assertAuthenticated(context.userId);
    return saveScene(context.userId, String(args.fileId), args.data);
  },
);

const migrateGuestSceneMutation = fileMutationConfig(
  "Adopt a locally-stored guest scene into the account on sign-in.",
  {
    name: { type: GraphQLString },
    data: { type: new GraphQLNonNull(sceneDataInput) },
  },
  (_source, args, context) => {
    assertAuthenticated(context.userId);
    return migrateGuestScene(
      context.userId,
      typeof args.name === "string" ? args.name : undefined,
      args.data,
    );
  },
);

const deleteFileMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(GraphQLBoolean),
  description: "Delete a file you own together with its scene and comments.",
  args: { id: { type: new GraphQLNonNull(GraphQLID) } },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return deleteFile(context.userId, String(args.id));
  },
};

// ---------------------------------------------------------------------------
// Mutation fields (comments)
// ---------------------------------------------------------------------------

const addCommentMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(CommentType),
  description:
    "Add a comment to a file you own, optionally pinned to canvas coords. Pass parentId to reply within an existing thread.",
  args: {
    fileId: { type: new GraphQLNonNull(GraphQLID) },
    body: { type: new GraphQLNonNull(GraphQLString) },
    parentId: {
      type: GraphQLID,
      description: "Top-level comment to reply to (threads nest exactly once).",
    },
    x: { type: GraphQLFloat },
    y: { type: GraphQLFloat },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    const authorName = context.user?.name ?? "";
    return addComment(
      context.userId,
      authorName,
      String(args.fileId),
      args.body,
      args.x,
      args.y,
      args.parentId,
    );
  },
};

const updateCommentMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(CommentType),
  description: "Edit the body of your own comment.",
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    body: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return updateComment(context.userId, String(args.id), args.body);
  },
};

const resolveCommentMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(CommentType),
  description: "Toggle the resolved state of a comment (author or file owner).",
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    resolved: { type: new GraphQLNonNull(GraphQLBoolean) },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return resolveComment(context.userId, String(args.id), args.resolved);
  },
};

const deleteCommentMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(GraphQLBoolean),
  description: "Delete a comment (author or file owner).",
  args: { id: { type: new GraphQLNonNull(GraphQLID) } },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return deleteComment(context.userId, String(args.id));
  },
};

// ---------------------------------------------------------------------------
// Schema assembly
// ---------------------------------------------------------------------------

export const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: {
      me: meQuery,
      files: scopeGeneratedQueryToViewer(generated.entities.queries.files),
      filesSingle: scopeGeneratedQueryToViewer(generated.entities.queries.filesSingle),
      scene: sceneQuery,
      comments: commentsQuery,
    },
  }),
  mutation: new GraphQLObjectType({
    name: "Mutation",
    fields: {
      signup: signupMutation,
      login: loginMutation,
      logout: logoutMutation,
      createFile: createFileMutation,
      renameFile: renameFileMutation,
      deleteFile: deleteFileMutation,
      duplicateFile: duplicateFileMutation,
      saveScene: saveSceneMutation,
      migrateGuestScene: migrateGuestSceneMutation,
      addComment: addCommentMutation,
      updateComment: updateCommentMutation,
      resolveComment: resolveCommentMutation,
      deleteComment: deleteCommentMutation,
    },
  }),
});
