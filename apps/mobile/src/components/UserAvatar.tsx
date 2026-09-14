import { Image, StyleSheet, Text, View } from "react-native";
import { fonts, radius, type Palette } from "../theme";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

/** Circular member avatar: shows the profile picture when set, else initials. */
export function UserAvatar({
  colors,
  name,
  uri,
  size = 44,
}: {
  colors: Palette;
  name: string;
  uri?: string | null;
  size?: number;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cardMuted }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        styles.fallback,
        { backgroundColor: colors.primaryMuted, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.initial, { color: colors.primary, fontSize: Math.round(size * 0.42) }]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initial: {
    fontFamily: fonts.bold,
  },
});