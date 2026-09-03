"use client";

import { useMutation } from "@apollo/client/react";

import type { FileMutationData, FileMutationVariables } from "@/lib/graphql/operations";
import { CREATE_FILE_MUTATION, LOGOUT_MUTATION, ME_QUERY } from "@/lib/graphql/operations";

/**
 * Shared Apollo mutations for file lifecycle + auth, kept in sync with the
 * `me` query (files list) so every consumer sees fresh data.
 */
export function useStudioMutations() {
  const [createFile] = useMutation<FileMutationData, FileMutationVariables>(CREATE_FILE_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
  const [logout] = useMutation<{ logout: boolean }, Record<string, never>>(LOGOUT_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
  return { createFile, logout };
}
