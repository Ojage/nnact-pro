import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

export type BackButtonColors = {
  foreground: string;
  mutedForeground: string;
  surfaceMuted: string;
  borderLight: string;
  onEmphasis?: string;
  background: string;
  primary: string;
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
  variant?: "surface" | "hero";
  style?: StyleProp<ViewStyle>;
}) {
  const isHero = variant === "hero";
  const pillBg = isHero ? colors.background : colors.surfaceMuted;
  const borderColor = colors.borderLight;
  const iconColor = isHero ? colors.primary : colors.mutedForeground;
  const textColor = isHero ? colors.primary : colors.mutedForeground;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.hit, isHero && styles.floating, style]}
    >
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor }, isHero && styles.heroPill]}>
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
  heroPill: {
    shadowColor: "#0b1220",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
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
