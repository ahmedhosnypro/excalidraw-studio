import { GraphQLError } from "graphql";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "BAD_USER_INPUT"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

export function gqlError(
  code: ErrorCode,
  message: string,
): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}

export function assertAuthenticated(
  userId: string | null | undefined,
): asserts userId is string {
  if (!userId) {
    throw gqlError(
      "UNAUTHENTICATED",
      "You must be signed in to perform this action.",
    );
  }
}
