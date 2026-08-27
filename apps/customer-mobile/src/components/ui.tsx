import type { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fonts, type Palette } from "../theme";

export function ScreenHeader({
  colors,
  eyebrow,
  title,
  subtitle,
  onBack,
}: {
  colors: Palette;
  eyebrow: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  colors,
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  colors: Palette;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = createStyles(colors);
  const style =
    variant === "secondary" ? styles.btnSecondary : variant === "danger" ? styles.btnDanger : styles.btnPrimary;
  const textStyle =
    variant === "secondary" ? styles.btnSecondaryText : variant === "danger" ? styles.btnDangerText : styles.btnPrimaryText;
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} style={[style, disabled && styles.btnDisabled]}>
      <Text style={textStyle}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Card({ colors, children }: { colors: Palette; children: ReactNode }) {
  const styles = createStyles(colors);
  return <View style={styles.card}>{children}</View>;
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { paddingHorizontal: 20, marginBottom: 18 },
    back: { marginBottom: 10 },
    backText: { color: colors.primary, fontSize: 13, fontFamily: fonts.bold },
    eyebrow: { color: colors.primary, fontSize: 10, fontFamily: fonts.extraBold, letterSpacing: 2 },
    title: { color: colors.foreground, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.6, marginTop: 4 },
    subtitle: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 6, fontFamily: fonts.regular },
    btnPrimary: {
      borderRadius: 999,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 18,
      alignItems: "center",
    },
    btnPrimaryText: { color: colors.onEmphasis, fontSize: 14, fontFamily: fonts.bold },
    btnSecondary: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardMuted,
      paddingVertical: 14,
      paddingHorizontal: 18,
      alignItems: "center",
    },
    btnSecondaryText: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold },
    btnDanger: {
      borderRadius: 999,
      backgroundColor: colors.dangerAlpha,
      paddingVertical: 12,
      paddingHorizontal: 18,
      alignItems: "center",
    },
    btnDangerText: { color: colors.danger, fontSize: 13, fontFamily: fonts.bold },
    btnDisabled: { opacity: 0.5 },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 16,
      marginBottom: 10,
    },
  });
