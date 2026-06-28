import { useEffect, useState } from "react";

export type ThemeId = "dark" | "light" | "homebrew" | "amber" | "dracula";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  hint: string;
  /** [background, accent] swatch for the picker. */
  swatch: [string, string];
}

/** Selectable themes. The CSS for each lives in src/index.css. */
export const THEMES: ThemeMeta[] = [
  { id: "dark", name: "Midnight", hint: "Cool & dark (default)", swatch: ["#0b0b11", "#6f5ef2"] },
  { id: "light", name: "Daylight", hint: "Clean & bright", swatch: ["#fbfbfd", "#5b50f0"] },
  { id: "homebrew", name: "Homebrew", hint: "Green-on-black terminal", swatch: ["#020402", "#36d399"] },
  { id: "amber", name: "Amber CRT", hint: "Warm retro terminal", swatch: ["#140d02", "#ffb000"] },
  { id: "dracula", name: "Dracula", hint: "Cult dev classic", swatch: ["#282a36", "#bd93f9"] },
];

const ALL = THEMES.map((t) => `theme-${t.id}`);

/** Persisted theme. Applies a single `theme-<id>` class to <html>. */
export function useTheme(): {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  cycle: () => void;
} {
  const [theme, setTheme] = useState<ThemeId>(
    () => (localStorage.getItem("theme") as ThemeId) || "dark",
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...ALL, "light", "dark");
    root.classList.add(`theme-${theme}`);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const cycle = () =>
    setTheme((t) => {
      const i = THEMES.findIndex((x) => x.id === t);
      return THEMES[(i + 1) % THEMES.length].id;
    });

  return { theme, setTheme, cycle };
}
