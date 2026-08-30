import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

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
  schema,
});

export { schema };
