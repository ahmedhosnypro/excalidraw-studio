import { eq } from "drizzle-orm";
import { GraphQLBoolean, GraphQLFieldConfig, GraphQLNonNull, GraphQLString } from "graphql";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/passwords";
import {
  createSession,
  destroySession,
  readSessionCookie,
  serializeSessionCookie,
  serializeSessionCookieClear,
} from "@/server/auth/sessions";
import type { ApolloContext } from "@/server/graphql/context";
import { gqlError } from "@/server/graphql/errors";
import { UserType, toUserOutput } from "@/server/graphql/types";

const emailSchema = z.email().transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);
const nameSchema = z.string().trim().min(1, "Name is required").max(80);

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("UNIQUE")
  );
}

export const signupMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(UserType),
  description: "Create an account and sign in.",
  args: {
    email: { type: new GraphQLNonNull(GraphQLString) },
    password: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: async (_source, args, context) => {
    const input = signupSchema.safeParse(args);
    if (!input.success) {
      throw gqlError("BAD_USER_INPUT", input.error.issues[0]?.message ?? "Invalid input");
    }
    if (context.user) {
      throw gqlError("CONFLICT", "You are already signed in.");
    }

    const passwordHash = await hashPassword(input.data.password);
    let row;
    try {
      const inserted = await db
        .insert(users)
        .values({
          email: input.data.email,
          name: input.data.name,
          passwordHash,
        })
        .returning();
      row = inserted[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw gqlError("CONFLICT", "An account with this email already exists.");
      }
      throw error;
    }
    if (!row) {
      throw gqlError("INTERNAL_SERVER_ERROR", "Failed to create the account.");
    }

    const session = await createSession(row.id);
    context.setCookie(serializeSessionCookie(session));
    return toUserOutput(row);
  },
};

export const loginMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(UserType),
  description: "Sign in with email and password.",
  args: {
    email: { type: new GraphQLNonNull(GraphQLString) },
    password: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: async (_source, args, context) => {
    const input = loginSchema.safeParse(args);
    if (!input.success) {
      throw gqlError("BAD_USER_INPUT", "Email and password are required.");
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, input.data.email))
      .limit(1);
    const row = rows[0];
    if (!row || !(await verifyPassword(input.data.password, row.passwordHash))) {
      throw gqlError("UNAUTHENTICATED", "Invalid email or password.");
    }

    const session = await createSession(row.id);
    context.setCookie(serializeSessionCookie(session));
    return toUserOutput(row);
  },
};

export const logoutMutation: GraphQLFieldConfig<unknown, ApolloContext> = {
  type: new GraphQLNonNull(GraphQLBoolean),
  description: "Sign out and clear the session cookie.",
  resolve: async (_source, _args, context) => {
    const token = readSessionCookie(context.requestHeaders.get("cookie") ?? undefined);
    await destroySession(token ?? undefined);
    context.setCookie(serializeSessionCookieClear());
    return true;
  },
};
