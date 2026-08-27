// NNACT Pro mobile theme — mirrors the web design system (Banking palette) so
// web and mobile share the same visual language and type ramp. Both light and
// dark token sets are provided and follow the device system setting.

import { useColorScheme } from "react-native";

const light = {
  // canvas
  background: "#ffffff",
  surface: "#ffffff",
  card: "#ffffff",
  cardMuted: "#f6f8fa",
  border: "#d1d9e0",
  borderLight: "#eaeef2",
  shadow: "#d1d9e0",

  // text
  foreground: "#1f2328",
  mutedForeground: "#59636e",
  dimForeground: "#6e7781",
  onEmphasis: "#ffffff",

  // action / status
  primary: "#1d4ed8",
  primaryHover: "#1e40af",
  primaryMuted: "#dbeafe",
  focus: "#2563eb",
  success: "#1a7f37",
  warning: "#9a6700",
  danger: "#cf222e",

  // translucent helpers
  borderAlpha: "rgba(110,119,129,0.14)",
  primaryAlpha: "rgba(29,78,216,0.12)",
  successAlpha: "rgba(26,127,55,0.12)",
  warningAlpha: "rgba(154,103,0,0.12)",
  dangerAlpha: "rgba(207,34,46,0.10)",
};

export type Palette = typeof light;

const dark: Palette = {
  // canvas
  background: "#0f172a",
  surface: "#0f172a",
  card: "#1e293b",
  cardMuted: "#0f172a",
  border: "#334155",
  borderLight: "#475569",
  shadow: "#020617",

  // text
  foreground: "#e2e8f0",
  mutedForeground: "#94a3b8",
  dimForeground: "#64748b",
  onEmphasis: "#ffffff",

  // action / status
  primary: "#3b82f6",
  primaryHover: "#2563eb",
  primaryMuted: "#1e3a5f",
  focus: "#60a5fa",
  success: "#22c55e",
  warning: "#fbbf24",
  danger: "#f87171",

  // translucent helpers
  borderAlpha: "rgba(148,163,184,0.15)",
  primaryAlpha: "rgba(59,130,246,0.18)",
  successAlpha: "rgba(34,197,94,0.12)",
  warningAlpha: "rgba(251,191,36,0.12)",
  dangerAlpha: "rgba(248,113,113,0.12)",
};

// Source Sans 3 (the open continuation of Source Sans Pro).
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
    scheme: scheme === "light" ? "light" : "dark",
  };
}