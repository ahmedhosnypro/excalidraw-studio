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
import { generateDiagramFromPrompt, improveDiagramSelection } from "@/server/ai/diagram";
import { emptyScene, readScene } from "@/server/scenes";
import type { ApolloContext } from "./context";
import { assertAuthenticated } from "./errors";
import { loginMutation, logoutMutation, signupMutation } from "./resolvers/auth";
import {
  addComment,
  deleteComment,
  listComments,
  resolveComment,
  toggleCommentReaction,
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
  storageUsageOf,
} from "./resolvers/files";
import {
  createSceneSnapshot,
  deleteSceneSnapshot,
  listSceneSnapshots,
  readSceneSnapshot,
  restoreSceneSnapshot,
} from "./resolvers/history";
import {
  addGuestComment,
  createShareLink,
  revokeShareLink,
  sharedComments,
  sharedFileSummary,
  sharedScene,
  toggleGuestCommentReaction,
} from "./resolvers/share";
import { GraphQLJSON } from "./scalars";
import {
  CommentType,
  GenerateDiagramType,
  type SceneDataOutput,
  SceneDataType,
  SceneSnapshotType,
  SharedFileType,
  StorageUsageType,
  toUserOutput,
  UserType,
} from "./types";

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

const storageUsageQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(StorageUsageType),
  description: "Total storage used by the viewer's scene files.",
  resolve: (_source, _args, context) => {
    assertAuthenticated(context.userId);
    return storageUsageOf(context.userId);
  },
};

const sceneSnapshotsQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SceneSnapshotType))),
  description: "Version history: metadata of a viewer-owned file's snapshots, newest first.",
  args: {
    fileId: { type: new GraphQLNonNull(GraphQLID) },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return listSceneSnapshots(context.userId, String(args.fileId));
  },
};

const sceneSnapshotQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(SceneDataType),
  description: "Version history: full contents of one snapshot (preview / restore source).",
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
  },
  resolve: (_source, args, context): Promise<SceneDataOutput> => {
    assertAuthenticated(context.userId);
    return readSceneSnapshot(context.userId, String(args.id));
  },
};

// ---------------------------------------------------------------------------
// Query fields (public, share-token scoped — no authentication)
// ---------------------------------------------------------------------------

const sharedFileQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(SharedFileType),
  description: "Public metadata of the file a share token points to.",
  args: { token: { type: new GraphQLNonNull(GraphQLString) } },
  resolve: (_source, args) => sharedFileSummary(args.token),
};

const sharedSceneQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(SceneDataType),
  description: "Loads the (read-only) scene contents a share token grants access to.",
  args: { token: { type: new GraphQLNonNull(GraphQLString) } },
  resolve: (_source, args): Promise<SceneDataOutput> => sharedScene(args.token),
};

const sharedCommentsQuery: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(CommentType))),
  description:
    "Lists comments of a shared file (oldest first), with the guest viewer's own reaction flags.",
  args: {
    token: { type: new GraphQLNonNull(GraphQLString) },
    viewerGuestName: {
      type: GraphQLString,
      description: "Display name of the viewing guest (marks their own reactions).",
    },
  },
  resolve: (_source, args) => sharedComments(args.token, args.viewerGuestName),
};

/** Best-effort client IP for public (token-scoped) guest mutations. */
function clientIpOf(context: ApolloContext): string {
  return (
    context.requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    context.requestHeaders.get("x-real-ip") ??
    "local"
  );
}

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

// ---------------------------------------------------------------------------
// Mutation fields (version history)
// ---------------------------------------------------------------------------

const createSceneSnapshotMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(SceneSnapshotType),
  description: "Version history: save a labelled checkpoint of the file's currently stored scene.",
  args: {
    fileId: { type: new GraphQLNonNull(GraphQLID) },
    label: { type: GraphQLString },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return createSceneSnapshot(context.userId, String(args.fileId), args.label);
  },
};

const restoreSceneSnapshotMutation = fileMutationConfig(
  "Version history: restore a snapshot as the file's live scene (auto-snapshots the current state first).",
  { id: { type: new GraphQLNonNull(GraphQLID) } },
  (_source, args, context) => {
    assertAuthenticated(context.userId);
    return restoreSceneSnapshot(context.userId, String(args.id));
  },
);

const deleteSceneSnapshotMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(GraphQLBoolean),
  description: "Version history: delete one snapshot of a file you own.",
  args: { id: { type: new GraphQLNonNull(GraphQLID) } },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return deleteSceneSnapshot(context.userId, String(args.id));
  },
};

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
// Mutation fields (share links)
// ---------------------------------------------------------------------------

const createShareLinkMutation = fileMutationConfig(
  "Create (or return) the share link token for a file you own.",
  { fileId: { type: new GraphQLNonNull(GraphQLID) } },
  (_source, args, context) => {
    assertAuthenticated(context.userId);
    return createShareLink(context.userId, String(args.fileId));
  },
);

const revokeShareLinkMutation = fileMutationConfig(
  "Revoke the share link of a file you own — the token stops working immediately.",
  { fileId: { type: new GraphQLNonNull(GraphQLID) } },
  (_source, args, context) => {
    assertAuthenticated(context.userId);
    return revokeShareLink(context.userId, String(args.fileId));
  },
);

const addGuestCommentMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(CommentType),
  description:
    "Post a comment on a shared file as a named guest (no account). Pass parentId to reply within a thread.",
  args: {
    token: { type: new GraphQLNonNull(GraphQLString) },
    guestName: { type: new GraphQLNonNull(GraphQLString) },
    body: { type: new GraphQLNonNull(GraphQLString) },
    parentId: { type: GraphQLID },
    x: { type: GraphQLFloat },
    y: { type: GraphQLFloat },
  },
  resolve: (_source, args, context) => {
    const ip = clientIpOf(context);
    return addGuestComment(
      args.token,
      args.guestName,
      args.body,
      args.x,
      args.y,
      args.parentId,
      ip,
    );
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

const toggleCommentReactionMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(CommentType),
  description: "Toggle the viewer's emoji reaction on a comment (adds or removes it).",
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    emoji: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return toggleCommentReaction(context.userId, String(args.id), args.emoji);
  },
};

const toggleGuestCommentReactionMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(CommentType),
  description:
    "Toggle a guest's emoji reaction on a shared-file comment (token-scoped, name-keyed identity).",
  args: {
    token: { type: new GraphQLNonNull(GraphQLString) },
    guestName: { type: new GraphQLNonNull(GraphQLString) },
    id: { type: new GraphQLNonNull(GraphQLID) },
    emoji: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: (_source, args, context) => {
    const ip = clientIpOf(context);
    return toggleGuestCommentReaction(args.token, args.guestName, String(args.id), args.emoji, ip);
  },
};

// ---------------------------------------------------------------------------
// Mutation fields (AI)
// ---------------------------------------------------------------------------

const generateDiagramMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(GenerateDiagramType),
  description:
    "Generates Excalidraw elements from a natural-language prompt (AI text-to-diagram). Elements arrive without `index` — the client assigns fractional indices when appending.",
  args: {
    prompt: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return generateDiagramFromPrompt(context.userId, args.prompt);
  },
};

const improveDiagramMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(GenerateDiagramType),
  description:
    "Revises a compact selection of Excalidraw elements according to a natural-language instruction (AI improve-selection). Returns the full replacement element set without `index`.",
  args: {
    prompt: { type: new GraphQLNonNull(GraphQLString) },
    elements: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLJSON))),
    },
  },
  resolve: (_source, args, context) => {
    assertAuthenticated(context.userId);
    return improveDiagramSelection(context.userId, args.prompt, args.elements);
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
      storageUsage: storageUsageQuery,
      sceneSnapshots: sceneSnapshotsQuery,
      sceneSnapshot: sceneSnapshotQuery,
      sharedFile: sharedFileQuery,
      sharedScene: sharedSceneQuery,
      sharedComments: sharedCommentsQuery,
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
      toggleCommentReaction: toggleCommentReactionMutation,
      toggleGuestCommentReaction: toggleGuestCommentReactionMutation,
      createShareLink: createShareLinkMutation,
      revokeShareLink: revokeShareLinkMutation,
      addGuestComment: addGuestCommentMutation,
      createSceneSnapshot: createSceneSnapshotMutation,
      restoreSceneSnapshot: restoreSceneSnapshotMutation,
      deleteSceneSnapshot: deleteSceneSnapshotMutation,
      generateDiagram: generateDiagramMutation,
      improveDiagram: improveDiagramMutation,
    },
  }),
});
