"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  applyColorTheme,
  isColorTheme,
  preferredColorTheme,
  storedColorTheme,
  THEME_CHANGE_EVENT,
  type ColorTheme,
} from "@/lib/theme";

function currentTheme(): ColorTheme {
  if (typeof document === "undefined" || typeof window === "undefined") return "light";
  const active = document.documentElement.dataset.theme;
  if (isColorTheme(active)) return active;
  return storedColorTheme(window.localStorage)
    ?? preferredColorTheme(window.matchMedia("(prefers-color-scheme: dark)"));
}

function subscribeToTheme(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    observer.disconnect();
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function serverTheme(): ColorTheme {
  return "light";
}

export function ThemeToggle() {
  // useSyncExternalStore keeps the server snapshot deterministic while reading
  // the pre-hydration theme as soon as React attaches to the document.
  const theme = useSyncExternalStore(subscribeToTheme, currentTheme, serverTheme);
  const next = theme === "dark" ? "light" : "dark";

  function toggleTheme() {
    applyColorTheme(next, document.documentElement, window.localStorage);
  }

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
