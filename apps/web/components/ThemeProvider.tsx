"use client";

export { ThemeProvider } from "./theme-provider";
import { useTheme as useBaseTheme } from "./theme-provider";

export function useTheme() {
  const { theme, toggle } = useBaseTheme();
  return { theme, toggleTheme: toggle };
}
