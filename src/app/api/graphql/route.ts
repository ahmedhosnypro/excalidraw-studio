import { ApolloServer } from "@apollo/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import type { NextRequest } from "next/server";

import { type ApolloContext, createApolloContext } from "@/server/graphql/context";
import { schema } from "@/server/graphql/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const server = new ApolloServer<ApolloContext>({
  schema,
  formatError: (formatted) => ({
    message: formatted.message,
    extensions: {
      code: formatted.extensions?.code ?? "INTERNAL_SERVER_ERROR",
    },
  }),
});

/**
 * Per-request contexts, keyed weakly by the request object. Resolvers queue
 * `Set-Cookie` values on the context; the exported handlers below apply them
 * to the outgoing response once Apollo has finished processing.
 */
const contexts = new WeakMap<NextRequest, ApolloContext>();

const apolloHandler = startServerAndCreateNextHandler<NextRequest, ApolloContext>(server, {
  context: async (request) => {
    const context = await createApolloContext(request);
    contexts.set(request, context);
    return context;
  },
});

function applyCookies(request: NextRequest, response: Response): Response {
  const context = contexts.get(request);
  contexts.delete(request);
  if (!context || context.cookiesToSet.length === 0) {
    return response;
  }
  for (const cookie of context.cookiesToSet) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export async function POST(request: NextRequest): Promise<Response> {
  const response = await apolloHandler(request);
  return applyCookies(request, response);
}

export async function GET(request: NextRequest): Promise<Response> {
  const response = await apolloHandler(request);
  return applyCookies(request, response);
}
