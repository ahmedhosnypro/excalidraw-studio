import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/libsql";

import { classicFullSchema, rqbRelations } from "./schema";

const DEFAULT_DATABASE_URL = "file:db/excalidraw-studio.db";

function resolveDatabaseFile(url: string): string {
  if (!url.startsWith("file:")) {
    return url;
  }
  const filePath = url.slice("file:".length);
  if (filePath === ":memory:" || filePath === "") {
    return url;
  }
  const absolute = resolve(process.cwd(), filePath);
  mkdirSync(dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}

const databaseUrl = resolveDatabaseFile(
  process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
);

export const db = drizzle({
  client: createClient({ url: databaseUrl }),
  relations: rqbRelations,
});

// drizzle-graphql 0.8.5 discovers tables/relations through `db._.fullSchema`
// (the pre-1.0 convention). Shim it with the classic schema shape.
type DrizzleInternals = { fullSchema?: Record<string, unknown> };
(db._ as DrizzleInternals).fullSchema = classicFullSchema;

export { classicFullSchema, rqbRelations };
export * from "./schema";
