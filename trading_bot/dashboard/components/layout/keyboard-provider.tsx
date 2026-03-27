"use client";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSSENotifications } from "@/hooks/use-sse-notifications";

export function KeyboardShortcutsProvider() {
  useKeyboardShortcuts();
  useSSENotifications();
  return null;
}
