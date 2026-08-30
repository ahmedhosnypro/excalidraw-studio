import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const uuid = () => crypto.randomUUID();
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(uuid),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(uuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("files_user_id_idx").on(table.userId)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(uuid),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    x: real("x"),
    y: real("y"),
    resolved: integer("resolved", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("comments_file_id_idx").on(table.fileId)],
);

export type UserRow = typeof users.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
