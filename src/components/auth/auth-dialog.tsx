"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

import {
  LOGIN_MUTATION,
  ME_QUERY,
  MIGRATE_GUEST_SCENE_MUTATION,
  SIGNUP_MUTATION,
} from "@/lib/graphql/operations";
import type {
  AuthMutationData,
  AuthMutationVariables,
  FileMutationData,
  FileMutationVariables,
} from "@/lib/graphql/operations";
import type { MeQueryData } from "@/lib/graphql/operations";
import { loadGuestScene, clearGuestScene } from "@/lib/scene-persistence";
import { useEditorStore } from "@/store/editor-store";

function AuthForm({
  mode,
  onDone,
}: {
  mode: "login" | "signup";
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [login, { loading: loginLoading }] = useMutation<AuthMutationData, AuthMutationVariables>(LOGIN_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
  const [signup, { loading: signupLoading }] = useMutation<AuthMutationData, AuthMutationVariables>(SIGNUP_MUTATION, {
    refetchQueries: [{ query: ME_QUERY }, "Files"],
  });
  const [migrateGuestScene] = useMutation<FileMutationData, FileMutationVariables>(MIGRATE_GUEST_SCENE_MUTATION, {
    refetchQueries: ["Files"],
  });

  const loading = mode === "login" ? loginLoading : signupLoading;

  const adoptGuestScene = async (): Promise<void> => {
    // If a guest was drawing before signing in, adopt that scene into the account.
    const guest = loadGuestScene();
    if (guest && guest.data.elements.length > 0) {
      try {
        await migrateGuestScene({
          variables: { name: guest.name, data: guest.data },
        });
        clearGuestScene();
      } catch {
        // Non-fatal: the guest scene stays in localStorage.
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "login") {
        await login({ variables: { email, password } });
      } else {
        await signup({ variables: { email, password, name } });
        await adoptGuestScene();
      }
      onDone();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message.replace(/^ApolloError:\s*/, "")
          : "Something went wrong. Please try again.";
      setError(message);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
      {mode === "signup" ? (
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-name`}>Name</Label>
          <Input
            id={`${mode}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
            required
            minLength={1}
            maxLength={80}
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor={`${mode}-email`}>Email</Label>
        <Input
          id={`${mode}-email`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${mode}-password`}>Password</Label>
        <Input
          id={`${mode}-password`}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
        />
        {mode === "signup" ? (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            {mode === "login" ? "Signing in…" : "Creating account…"}
          </>
        ) : mode === "login" ? (
          "Sign in"
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  );
}

export function AuthDialog() {
  const dialog = useEditorStore((state) => state.dialog);
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const authIntent = useEditorStore((state) => state.authIntent);
  const { data } = useQuery<MeQueryData>(ME_QUERY);
  // Close automatically if the user becomes signed in through another flow.
  const isOpen = dialog === "auth" && !data?.me;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Excalidraw Studio</DialogTitle>
          <DialogDescription>
            {authIntent ??
              "Sign in to save your drawings to the cloud, switch between files and comment."}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <AuthForm mode="login" onDone={closeDialog} />
          </TabsContent>
          <TabsContent value="signup">
            <AuthForm mode="signup" onDone={closeDialog} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
