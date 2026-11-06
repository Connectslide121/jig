import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

interface ThemeState {
  choice: ThemeChoice;
  dark: boolean;
  setChoice: (c: ThemeChoice) => void;
  reducedMotion: boolean;
  setReducedMotion: (on: boolean) => void;
}

const Ctx = createContext<ThemeState | null>(null);
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => stored("kit:theme", "system"));
  const [systemDark, setSystemDark] = useState(() => media().matches);
  const [reducedMotion, setReduced] = useState(() => stored<string>("kit:reduced-motion", "0") === "1");
  useEffect(() => {
    const m = media();
    const on = () => setSystemDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const dark = choice === "dark" || (choice === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    document.documentElement.classList.toggle("kit-reduced-motion", reducedMotion);
  }, [reducedMotion]);
  const setChoice = (c: ThemeChoice) => {
    setChoiceState(c);
    try {
      localStorage.setItem("kit:theme", c);
    } catch {}
  };
  const setReducedMotion = (on: boolean) => {
    setReduced(on);
    try {
      localStorage.setItem("kit:reduced-motion", on ? "1" : "0");
    } catch {}
  };
  return <Ctx.Provider value={{ choice, dark, setChoice, reducedMotion, setReducedMotion }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const t = useContext(Ctx);
  if (!t) throw new Error("useTheme outside ThemeProvider");
  return t;
}
