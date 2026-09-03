import type * as ToastPrimitives from "@radix-ui/react-toast";
import type * as React from "react";

type ToastProps = React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & {
  variant?: "default" | "destructive" | null;
};

type ToastActionElement = React.ReactElement<typeof ToastPrimitives.Action>;

export type { ToastActionElement, ToastProps };
