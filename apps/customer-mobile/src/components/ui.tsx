import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HeroSearchTrigger, type AppSearchFonts, BrandLogo, BackButton } from "@nnact/mobile-ui";
import { fonts, radius, spacing, type Palette } from "../theme";

export function HeroBanner({
  colors,
  eyebrow,
  title,
  subtitle,
  children,
  searchPlaceholder,
  onSearchPress,
  searchFonts,
}: {
  colors: Palette;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  searchPlaceholder?: string;
  onSearchPress?: () => void;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);
  const showSearch = Boolean(searchPlaceholder && onSearchPress && searchFonts);

  return (
    <View style={[styles.hero, showSearch && styles.heroWithSearch]}>
      {eyebrow ? <Text style={styles.heroEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.heroTitle}>{title}</Text>
      {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
      {children}
      {showSearch ? (
        <HeroSearchTrigger fonts={searchFonts!} placeholder={searchPlaceholder!} onPress={onSearchPress!} />
      ) : null}
    </View>
  );
}

export function ScreenHeader({
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
    <View style={styles.screenHeader}>
      {onBack ? (
        <BackButton colors={colors} onPress={onBack} variant="surface" style={{ marginBottom: spacing.sm }} />
      ) : null}
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionHeader({
  colors,
  title,
  action,
  onAction,
}: {
  colors: Palette;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  colors,
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
  size = "md",
  fullWidth = true,
}: {
  colors: Palette;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "accent" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}) {
  const styles = createStyles(colors);
  const variantStyle = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    accent: styles.btnAccent,
    danger: styles.btnDanger,
    ghost: styles.btnGhost,
  }[variant];
  const textStyle = {
    primary: styles.btnPrimaryText,
    secondary: styles.btnSecondaryText,
    accent: styles.btnAccentText,
    danger: styles.btnDangerText,
    ghost: styles.btnGhostText,
  }[variant];
  const spinnerColor = {
    primary: colors.onEmphasis,
    secondary: colors.foreground,
    accent: colors.primaryDark,
    danger: colors.danger,
    ghost: colors.primary,
  }[variant];
  const sizeStyle = { sm: styles.btnSm, md: styles.btnMd, lg: styles.btnLg }[size];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      disabled={isDisabled}
      onPress={onPress}
      activeOpacity={0.85}
      style={[variantStyle, sizeStyle, fullWidth && styles.btnFull, isDisabled && styles.btnDisabled]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} size="small" />
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function LoadingOverlay({ colors, message }: { colors: Palette; message: string }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.overlay} accessibilityLiveRegion="polite" accessibilityLabel={message}>
      <View style={styles.overlayCard}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.overlayText}>{message}</Text>
      </View>
    </View>
  );
}

export function Card({
  colors,
  children,
  style,
  elevated,
}: {
  colors: Palette;
  children: ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
}) {
  const styles = createStyles(colors);
  return <View style={[styles.card, elevated && styles.cardElevated, style]}>{children}</View>;
}

export function FeatureCard({
  colors,
  icon,
  title,
  description,
  badge,
  onPress,
}: {
  colors: Palette;
  icon?: string;
  title: string;
  description: string;
  badge?: string;
  onPress?: () => void;
}) {
  const styles = createStyles(colors);
  const content = (
    <>
      {icon ? (
        <View style={styles.featureIconWrap}>
          <Text style={styles.featureIcon}>{icon}</Text>
        </View>
      ) : null}
      <View style={styles.featureBody}>
        <View style={styles.featureTitleRow}>
          <Text style={styles.featureTitle}>{title}</Text>
          {badge ? (
            <View style={styles.featureBadge}>
              <Text style={styles.featureBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.featureDesc}>{description}</Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.featureCard} onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.featureCard}>{content}</View>;
}

export function LocationCard({
  colors,
  title,
  streetAddress,
  locality,
  region,
  actionLabel = "Open in Google Maps",
  onPress,
}: {
  colors: Palette;
  title: string;
  streetAddress: string;
  locality: string;
  region?: string;
  actionLabel?: string;
  onPress: () => void;
}) {
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.locationCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.locationIconWrap}>
        <Ionicons name="location" size={22} color={colors.primary} />
      </View>
      <View style={styles.locationBody}>
        <Text style={styles.locationTitle}>{title}</Text>
        <Text style={styles.locationAddress}>{streetAddress}</Text>
        <Text style={styles.locationAddress}>
          {locality}
          {region ? `, ${region}` : ""}
        </Text>
        <View style={styles.locationActionRow}>
          <Text style={styles.locationAction}>{actionLabel}</Text>
          <Ionicons name="open-outline" size={14} color={colors.primary} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} style={styles.locationChevron} />
    </TouchableOpacity>
  );
}

export function StatCard({
  colors,
  label,
  value,
  hint,
  accent,
}: {
  colors: Palette;
  label: string;
  value: string;
  hint?: string;
  accent?: "primary" | "success" | "warning" | "danger";
}) {
  const styles = createStyles(colors);
  const valueColor =
    accent === "success"
      ? colors.success
      : accent === "warning"
        ? colors.warning
        : accent === "danger"
          ? colors.danger
          : colors.primary;

  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function ProgressBar({
  colors,
  progress,
  label,
}: {
  colors: Palette;
  progress: number;
  label?: string;
}) {
  const styles = createStyles(colors);
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <View style={styles.progressWrap}>
      {label ? (
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>{label}</Text>
          <Text style={styles.progressPct}>{Math.round(pct)}%</Text>
        </View>
      ) : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export function Chip({
  colors,
  label,
  selected,
  onPress,
}: {
  colors: Palette;
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const styles = createStyles(colors);
  const chip = (
    <View style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {chip}
      </TouchableOpacity>
    );
  }
  return chip;
}

export function TextField({
  colors,
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  multiline,
  error,
}: {
  colors: Palette;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  multiline?: boolean;
  error?: string;
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.dimForeground}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline, error ? styles.inputError : null]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function SegmentedTabs({
  colors,
  tabs,
  active,
  onChange,
}: {
  colors: Palette;
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  const styles = createStyles(colors);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          onPress={() => onChange(tab.id)}
          style={[styles.tab, active === tab.id && styles.tabActive]}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, active === tab.id && styles.tabTextActive]}>{tab.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function EmptyState({
  colors,
  icon,
  title,
  description,
}: {
  colors: Palette;
  icon?: string;
  title: string;
  description: string;
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.empty}>
      {icon ? <Text style={styles.emptyIcon}>{icon}</Text> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
    </View>
  );
}

export function LoadingScreen({ colors, message }: { colors: Palette; message?: string }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.loadingScreen}>
      <BrandLogo size={72} />
      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.lg }} />
      {message ? <Text style={styles.loadingText}>{message}</Text> : null}
    </View>
  );
}

export function Divider({ colors }: { colors: Palette }) {
  const styles = createStyles(colors);
  return <View style={styles.divider} />;
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    hero: {
      backgroundColor: colors.primary,
      paddingTop: Platform.OS === "ios" ? 58 : 44,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
    },
    heroWithSearch: {
      paddingBottom: spacing.lg,
    },
    heroEyebrow: {
      color: colors.accent,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      marginBottom: spacing.xs,
    },
    heroTitle: {
      color: colors.onEmphasis,
      fontSize: 28,
      fontFamily: fonts.extraBold,
      letterSpacing: -0.5,
      lineHeight: 34,
    },
    heroSubtitle: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 15,
      fontFamily: fonts.regular,
      lineHeight: 22,
      marginTop: spacing.sm,
    },
    screenHeader: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, paddingTop: Platform.OS === "ios" ? 58 : 44 },
    eyebrow: { color: colors.primary, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.2, textTransform: "uppercase" },
    title: { color: colors.foreground, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: -0.4, marginTop: spacing.xs },
    subtitle: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20, marginTop: spacing.sm, fontFamily: fonts.regular },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    sectionTitle: { color: colors.foreground, fontSize: 18, fontFamily: fonts.bold },
    sectionAction: { color: colors.primary, fontSize: 14, fontFamily: fonts.semibold },
    btnPrimary: { backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    btnPrimaryText: { color: colors.onEmphasis, fontFamily: fonts.bold },
    btnSecondary: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    btnSecondaryText: { color: colors.foreground, fontFamily: fonts.bold },
    btnAccent: { backgroundColor: colors.accent, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    btnAccentText: { color: colors.primaryDark, fontFamily: fonts.bold },
    btnDanger: { backgroundColor: colors.dangerAlpha, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    btnDangerText: { color: colors.danger, fontFamily: fonts.bold },
    btnGhost: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    btnGhostText: { color: colors.mutedForeground, fontFamily: fonts.semibold },
    btnSm: { paddingVertical: 8, paddingHorizontal: 14 },
    btnMd: { paddingVertical: 13, paddingHorizontal: 20 },
    btnLg: { paddingVertical: 16, paddingHorizontal: 24 },
    btnFull: { alignSelf: "stretch" },
    btnDisabled: { opacity: 0.5 },
    card: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.card,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardElevated: {
      borderColor: colors.borderLight,
    },
    featureCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    featureIconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    featureIcon: { fontSize: 20 },
    featureBody: { flex: 1 },
    featureTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    featureTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, flex: 1 },
    featureBadge: { backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    featureBadgeText: { color: colors.warning, fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase" },
    featureDesc: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18, marginTop: 4, fontFamily: fonts.regular },
    statCard: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.lg,
      padding: spacing.md,
      minWidth: 100,
    },
    statLabel: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.semibold, textTransform: "uppercase", letterSpacing: 0.5 },
    statValue: { color: colors.primary, fontSize: 22, fontFamily: fonts.extraBold, marginTop: 4 },
    statHint: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
    progressWrap: { marginTop: spacing.sm },
    progressLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    progressLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.medium },
    progressPct: { color: colors.primary, fontSize: 12, fontFamily: fonts.bold },
    progressTrack: { height: 6, backgroundColor: colors.borderLight, borderRadius: radius.pill, overflow: "hidden" },
    progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: radius.pill },
    chip: {
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginRight: spacing.sm,
      marginBottom: spacing.sm,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.foreground, fontSize: 13, fontFamily: fonts.medium },
    chipTextSelected: { color: colors.onEmphasis },
    field: { gap: 6, marginBottom: spacing.sm },
    fieldLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.semibold },
    input: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      color: colors.foreground,
      fontSize: 15,
      fontFamily: fonts.regular,
    },
    inputMultiline: { minHeight: 96, textAlignVertical: "top" },
    inputError: { borderColor: colors.danger },
    fieldError: { color: colors.danger, fontSize: 12, fontFamily: fonts.regular },
    tabsScroll: { marginBottom: spacing.md },
    tabsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    tab: {
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      marginRight: spacing.sm,
    },
    tabActive: { backgroundColor: colors.primary },
    tabText: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.semibold },
    tabTextActive: { color: colors.onEmphasis },
    empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
    emptyIcon: { fontSize: 40, marginBottom: spacing.md },
    emptyTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold, textAlign: "center" },
    emptyDesc: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: spacing.sm, fontFamily: fonts.regular },
    loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.background },
    loadingText: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.regular },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    },
    overlayCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      alignItems: "center",
      gap: spacing.md,
      minWidth: 200,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    overlayText: { color: colors.foreground, fontSize: 15, fontFamily: fonts.semibold },
    locationCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    locationIconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    locationBody: { flex: 1, gap: 2 },
    locationTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold },
    locationAddress: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular, lineHeight: 18 },
    locationActionRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
    locationAction: { color: colors.primary, fontSize: 13, fontFamily: fonts.semibold },
    locationChevron: { alignSelf: "center" },
    divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md },
  });
