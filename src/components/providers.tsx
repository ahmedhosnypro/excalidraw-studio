"use client";

import { ThemeProvider } from "next-themes";

import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/toaster";
import { ApolloGraphQLProvider } from "@/lib/apollo";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ApolloGraphQLProvider>
        {children}
        <Toaster />
      </ApolloGraphQLProvider>
    </ThemeProvider>
  );
}
