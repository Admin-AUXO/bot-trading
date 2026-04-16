"use client";

import { Toaster } from "sonner";

export function UiToast() {
  return (
    <Toaster
      theme="dark"
      richColors
      expand={false}
      position="top-right"
      toastOptions={{
        duration: 3500,
      }}
    />
  );
}
