import type { NextRequest } from "next/server";

import type { UserRow } from "@/db/schema";
import {
  readSessionCookie,
  resolveSessionUser,
} from "@/server/auth/sessions";

export interface ApolloContext {
  /** Signed-in user row (or null for guests). */
  user: UserRow | null;
  /** Convenience accessor for resolvers that only need the id. */
  readonly userId: string | null;
  /** The incoming request headers (for cookie reads in resolvers). */
  readonly requestHeaders: Headers;
  /**
   * `Set-Cookie` strings queued by resolvers; the route handler applies
   * them to the outgoing response after Apollo finishes.
   */
  readonly cookiesToSet: string[];
  /** Queues a Set-Cookie header on the response. */
  setCookie(cookie: string): void;
}

export async function createApolloContext(
  request: NextRequest,
): Promise<ApolloContext> {
  const token = readSessionCookie(request.headers.get("cookie") ?? undefined);
  const user = await resolveSessionUser(token ?? undefined);

  const cookiesToSet: string[] = [];

  return {
    user,
    get userId(): string | null {
      return user?.id ?? null;
    },
    requestHeaders: request.headers,
    cookiesToSet,
    setCookie(cookie: string): void {
      cookiesToSet.push(cookie);
    },
  };
}
