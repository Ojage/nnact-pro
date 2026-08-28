import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NNACT_COMPANY, NNACT_PRODUCT } from "@nnact/shared";
import { HeroCarousel } from "../components/HeroCarousel";
import { Card, HeroBanner, PrimaryButton, SectionHeader } from "../components/ui";
import { BrandLogo, type AppSearchFonts } from "@nnact/mobile-ui";
import { FIELD_TOOLS_SLIDES } from "../content/field-carousels";
import { fonts, spacing, type Palette } from "../theme";

const HIGHLIGHTS = [
  {
    icon: "navigate-outline" as const,
    title: "Today's route",
    description: "See appointments in order with arrival windows and job status at a glance.",
  },
  {
    icon: "pulse-outline" as const,
    title: "Guided diagnostics",
    description: "Run validated Repair Brain workflows and capture measurements in the field.",
  },
  {
    icon: "cloud-offline-outline" as const,
    title: "Offline field packages",
    description: "Queue readings and sync automatically when connectivity returns.",
  },
];

export function WelcomeScreen({
  colors,
  onSignIn,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  onSignIn: () => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.logoRow}>
        <BrandLogo size={64} />
      </View>
      <HeroBanner
        colors={colors}
        eyebrow={NNACT_PRODUCT.name}
        title="Field operations, in your pocket"
        subtitle={NNACT_PRODUCT.subtitle}
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      >
        <View style={styles.heroActions}>
          <PrimaryButton colors={colors} label="Sign in" onPress={onSignIn} variant="accent" size="md" />
        </View>
      </HeroBanner>

      <SectionHeader colors={colors} title="Built for technicians" />
      <View style={styles.highlights}>
        {HIGHLIGHTS.map((item) => (
          <Card key={item.title} colors={colors} elevated>
            <View style={styles.highlightRow}>
              <View style={styles.highlightIcon}>
                <Ionicons name={item.icon} size={22} color={colors.primary} />
              </View>
              <View style={styles.highlightCopy}>
                <Text style={styles.highlightTitle}>{item.title}</Text>
                <Text style={styles.highlightDescription}>{item.description}</Text>
              </View>
            </View>
          </Card>
        ))}
      </View>

      <SectionHeader colors={colors} title="Field tools" />
      <HeroCarousel colors={colors} slides={FIELD_TOOLS_SLIDES} />

      <View style={styles.contactCard}>
        <Text style={styles.contactTitle}>Need dispatch support?</Text>
        <Text style={styles.contactCopy}>Call the workshop for routing help or urgent escalations.</Text>
        <PrimaryButton
          colors={colors}
          label={`Call ${NNACT_COMPANY.contact.phones[0]}`}
          onPress={() => void Linking.openURL(`tel:${NNACT_COMPANY.contact.phones[0].replace(/\s/g, "")}`)}
          variant="secondary"
          size="md"
        />
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.lg },
    logoRow: { alignItems: "center", paddingTop: spacing.xl, paddingBottom: spacing.xs },
    heroActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
    highlights: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    highlightRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
    highlightIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    highlightCopy: { flex: 1, gap: 4 },
    highlightTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, lineHeight: 20 },
    highlightDescription: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular, lineHeight: 19 },
    contactCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      backgroundColor: colors.primaryMuted,
      borderRadius: 16,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    contactTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold },
    contactCopy: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular, lineHeight: 19 },
  });
