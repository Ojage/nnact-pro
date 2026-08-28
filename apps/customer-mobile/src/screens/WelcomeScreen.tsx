import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NNACT_COMPANY } from "@nnact/shared";
import { HeroCarousel } from "../components/HeroCarousel";
import { Card, HeroBanner, PrimaryButton, SectionHeader } from "../components/ui";
import { BrandLogo, type AppSearchFonts } from "@nnact/mobile-ui";
import { SERVICE_CAROUSEL_SLIDES } from "../content/home-carousels";
import { fonts, spacing, type Palette } from "../theme";

const HIGHLIGHTS = [
  {
    icon: "calendar-outline" as const,
    title: "Book service visits",
    description: "Schedule HVAC, electrical, and appliance repairs in a few taps.",
  },
  {
    icon: "document-text-outline" as const,
    title: "Review estimates",
    description: "Approve or decline repair quotes from your technician.",
  },
  {
    icon: "card-outline" as const,
    title: "Pay invoices",
    description: "View balances and pay securely when checkout is enabled.",
  },
];

export function WelcomeScreen({
  colors,
  onSignIn,
  onSignUp,
  onBook,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  onSignIn: () => void;
  onSignUp: () => void;
  onBook: () => void;
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
        eyebrow={NNACT_COMPANY.shortName}
        title="Professional service, simplified"
        subtitle={NNACT_COMPANY.customerPromise}
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      >
        <View style={styles.heroActions}>
          <PrimaryButton colors={colors} label="Sign in" onPress={onSignIn} variant="accent" size="md" />
          <PrimaryButton colors={colors} label="Create account" onPress={onSignUp} variant="secondary" size="md" />
        </View>
      </HeroBanner>

      <SectionHeader colors={colors} title="What you can do with NNACT" />
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

      <SectionHeader colors={colors} title="Our service areas" />
      <HeroCarousel colors={colors} slides={SERVICE_CAROUSEL_SLIDES} />

      <View style={styles.ctaCard}>
        <Text style={styles.ctaTitle}>Need service today?</Text>
        <Text style={styles.ctaCopy}>
          Request a visit without signing in — our team will confirm your appointment.
        </Text>
        <PrimaryButton colors={colors} label="Request service" onPress={onBook} variant="accent" size="md" />
      </View>

      <View style={styles.contactCard}>
        <Text style={styles.contactTitle}>Questions? We are here to help.</Text>
        <Text style={styles.contactCopy}>Serving {NNACT_COMPANY.serviceAreas.join(", ")}.</Text>
        <PrimaryButton
          colors={colors}
          label={`Call ${NNACT_COMPANY.contact.phones[0]}`}
          onPress={() => void Linking.openURL(`tel:${NNACT_COMPANY.contact.phones[0].replace(/\s/g, "")}`)}
          variant="ghost"
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
    ctaCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    ctaTitle: { color: colors.foreground, fontSize: 17, fontFamily: fonts.bold, lineHeight: 24 },
    ctaCopy: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.regular, lineHeight: 21 },
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
