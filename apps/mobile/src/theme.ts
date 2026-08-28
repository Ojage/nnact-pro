// Coursera-inspired NNACT customer theme — clean learning-platform aesthetics
// adapted for home-service customers: deep blue hero, gold accents, card discovery.

import { useColorScheme } from "react-native";

const light = {
  background: "#f3f7fc",
  surface: "#fafcfe",
  surfaceMuted: "#e8f1fa",
  surfaceElevated: "#ffffff",
  card: "#ffffff",
  cardMuted: "#eef3fa",
  border: "#dce4ef",
  borderLight: "#e4ebf4",
  shadow: "rgba(0, 0, 0, 0.04)",

  foreground: "#1f1f1f",
  mutedForeground: "#636363",
  dimForeground: "#8a8a8a",
  onEmphasis: "#ffffff",

  // Coursera blue + gold accent
  primary: "#0056d2",
  primaryDark: "#00255d",
  primaryHover: "#004bb8",
  primaryMuted: "#e8f1fc",
  accent: "#f2b705",
  accentMuted: "#fef8e7",
  focus: "#0056d2",

  success: "#1a7f37",
  warning: "#9a6700",
  danger: "#d4111e",

  heroGradientStart: "#0056d2",
  heroGradientEnd: "#00255d",

  borderAlpha: "rgba(0, 0, 0, 0.08)",
  primaryAlpha: "rgba(0, 86, 210, 0.10)",
  successAlpha: "rgba(26, 127, 55, 0.12)",
  warningAlpha: "rgba(154, 103, 0, 0.12)",
  dangerAlpha: "rgba(212, 17, 30, 0.10)",
};

export type Palette = typeof light;

const dark: Palette = {
  background: "#0d1117",
  surface: "#161b22",
  surfaceMuted: "#21262d",
  surfaceElevated: "#1c2128",
  card: "#161b22",
  cardMuted: "#21262d",
  border: "#30363d",
  borderLight: "#484f58",
  shadow: "rgba(0, 0, 0, 0.4)",

  foreground: "#f0f6fc",
  mutedForeground: "#8b949e",
  dimForeground: "#6e7681",
  onEmphasis: "#ffffff",

  primary: "#4c9aff",
  primaryDark: "#00255d",
  primaryHover: "#388bfd",
  primaryMuted: "#1a2332",
  accent: "#f2b705",
  accentMuted: "#2d2608",
  focus: "#4c9aff",

  success: "#3fb950",
  warning: "#d29922",
  danger: "#f85149",

  heroGradientStart: "#0d419d",
  heroGradientEnd: "#051c44",

  borderAlpha: "rgba(240, 246, 252, 0.08)",
  primaryAlpha: "rgba(76, 154, 255, 0.15)",
  successAlpha: "rgba(63, 185, 80, 0.12)",
  warningAlpha: "rgba(210, 153, 34, 0.12)",
  dangerAlpha: "rgba(248, 81, 73, 0.12)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fonts = {
  regular: "SourceSans3_400Regular",
  medium: "SourceSans3_500Medium",
  semibold: "SourceSans3_600SemiBold",
  bold: "SourceSans3_700Bold",
  extraBold: "SourceSans3_800ExtraBold",
  black: "SourceSans3_900Black",
};

export function useTheme() {
  const scheme = useColorScheme();
  return {
    colors: scheme === "light" ? light : dark,
    fonts,
    spacing,
    radius,
    scheme: scheme === "light" ? "light" : "dark",
  };
}
