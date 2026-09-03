"use client";

import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import type { ReactNode } from "react";
import { useState } from "react";

function makeApolloClient(): ApolloClient {
  return new ApolloClient({
    link: new HttpLink({
      uri: "/api/graphql",
      credentials: "same-origin",
    }),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: "cache-and-network",
      },
    },
  });
}

/**
 * Apollo Client provider for the App Router. The client is created once per
 * browser session (never during SSR).
 */
export function ApolloGraphQLProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeApolloClient);
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
