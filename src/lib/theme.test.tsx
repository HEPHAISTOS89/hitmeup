// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "../components/theme-toggle";
import { applyColorTheme, preferredColorTheme, storedColorTheme, THEME_STORAGE_KEY } from "./theme";

describe("global color theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("uses the system preference only when no valid stored choice exists", () => {
    expect(storedColorTheme(window.localStorage)).toBeNull();
    expect(preferredColorTheme({ matches: true })).toBe("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(storedColorTheme(window.localStorage)).toBeNull();
  });

  it("applies data-theme and persists the explicit choice", () => {
    applyColorTheme("dark", document.documentElement, window.localStorage);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("toggles the accessible topbar control and updates its label", () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeTruthy();
  });
});
