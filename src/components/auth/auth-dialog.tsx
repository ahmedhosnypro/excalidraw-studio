"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { AlertCircle, Eye, EyeOff, Loader2, PencilRuler } from "lucide-react";
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
import type {
  AuthMutationData,
  AuthMutationVariables,
  FileMutationData,
  FileMutationVariables,
  MeQueryData,
} from "@/lib/graphql/operations";
import {
  LOGIN_MUTATION,
  ME_QUERY,
  MIGRATE_GUEST_SCENE_MUTATION,
  SIGNUP_MUTATION,
} from "@/lib/graphql/operations";
import { clearGuestScene, loadGuestScene } from "@/lib/scene-persistence";
import { useEditorStore } from "@/store/editor-store";

function AuthForm({ mode, onDone }: { mode: "login" | "signup"; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const [login, { loading: loginLoading }] = useMutation<AuthMutationData, AuthMutationVariables>(
    LOGIN_MUTATION,
    {
      refetchQueries: [{ query: ME_QUERY }, "Files"],
    },
  );
  const [signup, { loading: signupLoading }] = useMutation<AuthMutationData, AuthMutationVariables>(
    SIGNUP_MUTATION,
    {
      refetchQueries: [{ query: ME_QUERY }, "Files"],
    },
  );
  const [migrateGuestScene] = useMutation<FileMutationData, FileMutationVariables>(
    MIGRATE_GUEST_SCENE_MUTATION,
    {
      refetchQueries: ["Files"],
    },
  );

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
        <div className="relative">
          <Input
            id={`${mode}-password`}
            type={passwordVisible ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            className="pr-10"
          />
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
          >
            {passwordVisible ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        {mode === "signup" ? (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        ) : null}
      </div>
      {error ? (
        <p
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="leading-relaxed">{error}</span>
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
          <DialogTitle className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm"
              aria-hidden
            >
              <PencilRuler className="h-5 w-5" />
            </span>
            <span>Welcome to Excalidraw Studio</span>
          </DialogTitle>
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
