import { defineRelations } from "drizzle-orm";
import { relations as classicRelations } from "drizzle-orm/_relations";
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const uuid = () => crypto.randomUUID();
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();
const createdAtColumn = () => timestamp("created_at").notNull().$defaultFn(now);
const updatedAtColumn = () => timestamp("updated_at").notNull().$defaultFn(now);

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(uuid),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Guest identities created for shared-link commenters (never sign in). */
  isGuest: integer("is_guest", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull(),
    /** Secret share-link token (null = sharing disabled for this file). */
    shareToken: text("share_token").unique(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index("files_user_id_idx").on(table.userId)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Top-level comment this row replies to (one level of nesting). */
    parentId: text("parent_id").references((): AnySQLiteColumn => comments.id, {
      onDelete: "cascade",
    }),
    x: real("x"),
    y: real("y"),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("comments_file_id_idx").on(table.fileId),
    index("comments_user_id_idx").on(table.userId),
    index("comments_parent_id_idx").on(table.parentId),
  ],
);

export const commentReactions = sqliteTable(
  "comment_reactions",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** A single emoji from the fixed allow-list (see server resolvers). */
    emoji: text("emoji").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("comment_reactions_comment_id_idx").on(table.commentId),
    uniqueIndex("comment_reactions_unique_idx").on(table.commentId, table.userId, table.emoji),
  ],
);

/** One restorable point-in-time copy of a file's scene (version history). */
export const sceneSnapshots = sqliteTable(
  "scene_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    /** null = automatic snapshot; text = user-labelled checkpoint. */
    label: text("label"),
    elementCount: integer("element_count").notNull().default(0),
    createdAt: createdAtColumn(),
  },
  (table) => [index("scene_snapshots_file_id_idx").on(table.fileId)],
);

// ---------------------------------------------------------------------------
// Relations (classic shape) — consumed by drizzle-graphql's buildSchema to
// derive nested GraphQL types (FileSelectItem.user, .comments, …).
// ---------------------------------------------------------------------------
export const usersRelations = classicRelations(users, ({ many }) => ({
  files: many(files),
}));

export const filesRelations = classicRelations(files, ({ one, many }) => ({
  user: one(users, { fields: [files.userId], references: [users.id] }),
  comments: many(comments),
}));

export const commentsRelations = classicRelations(comments, ({ one }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  file: one(files, { fields: [comments.fileId], references: [files.id] }),
}));

/**
 * Classic schema shape handed to drizzle-graphql (it reads `db._.fullSchema`,
 * a pre-drizzle-1.0 convention). The `sessions` table is deliberately omitted —
 * it must never be exposed through the generated GraphQL surface.
 */
export const classicFullSchema = {
  users,
  files,
  comments,
  usersRelations,
  filesRelations,
  commentsRelations,
};
// `scene_snapshots` is deliberately kept out of classicFullSchema — like
// `sessions`, its GraphQL surface stays fully hand-written (ownership +
// storage semantics the generator cannot know).

// ---------------------------------------------------------------------------
// Relations (drizzle-orm 1.0 RQBv2 shape) — powers db.query.*.findMany with
// nested `with` selects on the drizzle instance itself.
// ---------------------------------------------------------------------------
export const rqbRelations = defineRelations({ users, files, comments, sceneSnapshots }, (rl) => ({
  users: {
    files: rl.many.files({ from: rl.users.id, to: rl.files.userId }),
  },
  files: {
    user: rl.one.users({ from: rl.files.userId, to: rl.users.id }),
    comments: rl.many.comments({ from: rl.files.id, to: rl.comments.fileId }),
  },
  comments: {
    user: rl.one.users({ from: rl.comments.userId, to: rl.users.id }),
    file: rl.one.files({ from: rl.comments.fileId, to: rl.files.id }),
  },
}));

export type UserRow = typeof users.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SceneSnapshotRow = typeof sceneSnapshots.$inferSelect;
