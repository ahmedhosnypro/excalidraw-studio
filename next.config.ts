import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Keep the GraphQL toolchain on Node's single CJS instance: bundling
  // `graphql` through Turbopack can instantiate it twice (ESM + CJS realms),
  // which breaks Apollo's cross-realm type identity checks
  // ("Cannot use GraphQLInputObjectType from another module or realm").
  serverExternalPackages: [
    "graphql",
    "drizzle-graphql",
    "@apollo/server",
    "@as-integrations/next",
    "@graphql-tools/schema",
    "z-ai-web-dev-sdk",
  ],
};

export default nextConfig;
