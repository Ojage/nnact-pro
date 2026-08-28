import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

export type BackButtonColors = {
  foreground: string;
  mutedForeground: string;
  surfaceMuted: string;
  borderLight: string;
  onEmphasis?: string;
};

export function BackButton({
  colors,
  onPress,
  label = "Back",
  variant = "surface",
  style,
}: {
  colors: BackButtonColors;
  onPress: () => void;
  label?: string;
  variant?: "surface" | "hero" | "floating";
  style?: StyleProp<ViewStyle>;
}) {
  const isHero = variant === "hero";
  const pillBg = isHero ? "rgba(255, 255, 255, 0.22)" : colors.surfaceMuted;
  const borderColor = isHero ? "rgba(255, 255, 255, 0.35)" : colors.borderLight;
  const iconColor = isHero ? colors.onEmphasis ?? "#ffffff" : colors.mutedForeground;
  const textColor = isHero ? "rgba(255, 255, 255, 0.92)" : colors.mutedForeground;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.hit, variant === "floating" && styles.floating, style]}
    >
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor }]}>
        <Ionicons name="arrow-back" size={18} color={iconColor} />
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignSelf: "flex-start",
  },
  floating: {
    zIndex: 20,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
});
