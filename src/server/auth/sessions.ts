import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { sessions, users, type UserRow } from "@/db/schema";

const SESSION_TTL_DAYS = 30;
const TOKEN_BYTES = 32;

export const SESSION_COOKIE = "studio_session";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface SessionCookieSpec {
  name: string;
  value: string;
  maxAgeSeconds: number;
}

/**
 * Creates a session row for the user and returns the opaque token together
 * with the cookie attributes to apply on the HTTP response.
 */
export async function createSession(
  userId: string,
): Promise<SessionCookieSpec> {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await db.insert(sessions).values({ userId, tokenHash, expiresAt });

  return {
    name: SESSION_COOKIE,
    value: token,
    maxAgeSeconds: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

/** Resolves the user owning a valid (non-expired) session token. */
export async function resolveSessionUser(
  token: string | undefined,
): Promise<UserRow | null> {
  if (!token) {
    return null;
  }
  const tokenHash = await sha256Hex(token);
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

/** Deletes the session row (if any) for a token. */
export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }
  const tokenHash = await sha256Hex(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export function readSessionCookie(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return rest.join("=");
    }
  }
  return undefined;
}

/** Serializes a `Set-Cookie` value for a session token. */
export function serializeSessionCookie(spec: SessionCookieSpec): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${spec.name}=${spec.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${spec.maxAgeSeconds}${secure}`;
}

/** Serialized `Set-Cookie` that clears the session cookie. */
export function serializeSessionCookieClear(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
