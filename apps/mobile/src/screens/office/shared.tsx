import type { ReactNode } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BackButton } from "@nnact/mobile-ui";
import { fonts, spacing, type Palette } from "../../theme";

export function OfficeHeader({
  colors,
  eyebrow,
  title,
  subtitle,
  onBack,
}: {
  colors: Palette;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.header}>
      {onBack ? (
        <BackButton colors={colors} onPress={onBack} variant="surface" style={{ marginBottom: spacing.sm }} />
      ) : null}
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionLabel({ colors, children }: { colors: Palette; children: ReactNode }) {
  const styles = createStyles(colors);
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Row({
  colors,
  icon,
  avatar,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  colors: Palette;
  icon?: keyof typeof Ionicons.glyphMap;
  avatar?: ReactNode;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const styles = createStyles(colors);
  const content = (
    <View style={styles.row}>
      {avatar ? (
        <View style={styles.rowAvatar}>{avatar}</View>
      ) : icon ? (
        <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerAlpha }]}>
          <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
      {onPress ? <Ionicons name="chevron-forward" size={17} color={colors.dimForeground} /> : null}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.rowCard}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.rowCard}>{content}</View>;
}

export function Tag({
  colors,
  label,
  tone = "neutral",
}: {
  colors: Palette;
  label: string;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
}) {
  const styles = createStyles(colors);
  const bg =
    tone === "success"
      ? colors.successAlpha
      : tone === "warning"
        ? colors.warningAlpha
        : tone === "danger"
          ? colors.dangerAlpha
          : tone === "primary"
            ? colors.primaryAlpha
            : colors.surfaceMuted;
  const fg =
    tone === "success"
      ? colors.success
      : tone === "warning"
        ? colors.warning
        : tone === "danger"
          ? colors.danger
          : tone === "primary"
            ? colors.primary
            : colors.mutedForeground;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function StatusTag({ colors, status }: { colors: Palette; status: string }) {
  const upper = String(status).toUpperCase();
  const tone =
    upper === "PAID" || upper === "APPROVED" || upper === "COMPLETED" || upper === "SENT" || upper === "SUBMITTED" || upper === "ACCEPTED" || upper === "RECEIVED"
      ? "success"
      : upper === "VOIDED" || upper === "VOID" || upper === "REJECTED" || upper === "DECLINED" || upper === "CANCELED" || upper === "CANCELLED" || upper === "EXPIRED"
        ? "danger"
        : upper === "DRAFT" || upper === "PARTIALLY_PAID" || upper === "UNDER_REVIEW" || upper === "OVERDUE" || upper === "DISPUTED" || upper === "REQUESTED"
          ? "warning"
          : "primary";
  return <Tag colors={colors} label={String(status).replaceAll("_", " ")} tone={tone} />;
}

export function InfoRow({
  colors,
  label,
  value,
}: {
  colors: Palette;
  label: string;
  value?: string | null;
}) {
  const styles = createStyles(colors);
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function InlineError({ colors, message }: { colors: Palette; message: string | null }) {
  const styles = createStyles(colors);
  if (!message) return null;
  return (
    <View style={[styles.inlineError, { backgroundColor: colors.dangerAlpha }]}>
      <Text style={[styles.inlineErrorText, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

export function Sheet({
  colors,
  visible,
  title,
  onClose,
  children,
}: {
  colors: Palette;
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = createStyles(colors);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.dimForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            {children}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export function ActionButton({
  colors,
  label,
  icon,
  onPress,
  tone = "default",
  style,
}: {
  colors: Palette;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  style?: StyleProp<ViewStyle>;
}) {
  const styles = createStyles(colors);
  const bg =
    tone === "primary"
      ? colors.primaryAlpha
      : tone === "success"
        ? colors.successAlpha
        : tone === "warning"
          ? colors.warningAlpha
          : tone === "danger"
            ? colors.dangerAlpha
            : colors.surfaceMuted;
  const fg =
    tone === "primary"
      ? colors.primary
      : tone === "success"
        ? colors.success
        : tone === "warning"
          ? colors.warning
          : tone === "danger"
            ? colors.danger
            : colors.foreground;
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: bg }, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text style={[styles.actionBtnText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    header: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, paddingTop: spacing.lg },
    eyebrow: { color: colors.primary, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.2, textTransform: "uppercase" },
    title: { color: colors.foreground, fontSize: 24, fontFamily: fonts.extraBold, letterSpacing: -0.4, marginTop: spacing.xs },
    subtitle: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20, marginTop: spacing.sm, fontFamily: fonts.regular },
    sectionLabel: {
      color: colors.dimForeground,
      fontSize: 12,
      fontFamily: fonts.bold,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    rowCard: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 14,
      padding: spacing.sm,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primaryMuted,
    },
    rowAvatar: { marginRight: spacing.md },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.semibold },
    rowSubtitle: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
    rowRight: { alignItems: "flex-end" },
    tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" },
    tagText: { fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.3 },
    infoRow: { marginBottom: spacing.sm },
    infoLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.semibold, textTransform: "uppercase", letterSpacing: 0.5 },
    infoValue: { color: colors.foreground, fontSize: 15, fontFamily: fonts.medium, marginTop: 2 },
    inlineError: {
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    inlineErrorText: { fontSize: 13, fontFamily: fonts.medium },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: "82%",
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    sheetTitle: { color: colors.foreground, fontSize: 18, fontFamily: fonts.bold },
    sheetBody: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.xs,
    },
    actionBtnText: { fontSize: 13, fontFamily: fonts.semibold },
  });