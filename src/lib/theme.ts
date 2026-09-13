export type ColorTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "hitmeup-color-theme";
export const THEME_CHANGE_EVENT = "hitmeup:theme-change";

export function isColorTheme(value: unknown): value is ColorTheme {
  return value === "light" || value === "dark";
}

export function preferredColorTheme(media: Pick<MediaQueryList, "matches">): ColorTheme {
  return media.matches ? "dark" : "light";
}

export function storedColorTheme(storage: Pick<Storage, "getItem">): ColorTheme | null {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isColorTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function applyColorTheme(
  theme: ColorTheme,
  root: Pick<HTMLElement, "dataset">,
  storage?: Pick<Storage, "setItem">,
) {
  root.dataset.theme = theme;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies when browser storage is unavailable.
  }
}
