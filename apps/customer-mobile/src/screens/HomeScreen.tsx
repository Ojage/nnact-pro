import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { NNACT_COMPANY } from "@nnact/shared";
import { HeroCarousel } from "../components/HeroCarousel";
import { HeroBanner, PrimaryButton, SectionHeader, StatCard } from "../components/ui";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import { buildActionCarouselSlides, SERVICE_CAROUSEL_SLIDES } from "../content/home-carousels";
import { fonts, spacing, type Palette } from "../theme";

export function HomeScreen({
  colors,
  accountName,
  pendingEstimates,
  outstandingBalance,
  onOpenActivity,
  onBook,
  onBrowseServices,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  accountName?: string;
  pendingEstimates?: number;
  outstandingBalance?: string;
  onOpenActivity: () => void;
  onBook: () => void;
  onBrowseServices: () => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);
  const firstName = accountName?.split(" ")[0] ?? "there";
  const actionSlides = buildActionCarouselSlides(pendingEstimates);

  function onActionSlidePress(slideId: string) {
    if (slideId === "booking") {
      onBook();
      return;
    }
    onOpenActivity();
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <HeroBanner
        colors={colors}
        eyebrow={NNACT_COMPANY.shortName}
        title={`Welcome back, ${firstName}`}
        subtitle="Your estimates, invoices, and service history — all in one place."
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      >
        <View style={styles.heroActions}>
          <PrimaryButton colors={colors} label="Request service" onPress={onBook} variant="accent" size="md" />
          <PrimaryButton colors={colors} label="View activity" onPress={onOpenActivity} variant="ghost" size="md" />
        </View>
      </HeroBanner>

      {pendingEstimates || outstandingBalance ? (
        <View style={styles.statsRow}>
          {pendingEstimates ? (
            <StatCard colors={colors} label="Estimates" value={String(pendingEstimates)} hint="Awaiting review" accent="warning" />
          ) : null}
          {outstandingBalance ? (
            <StatCard colors={colors} label="Balance" value={outstandingBalance} hint="Outstanding" accent="primary" />
          ) : null}
        </View>
      ) : null}

      <SectionHeader colors={colors} title="Explore services" action="View all" onAction={onBrowseServices} />
      <HeroCarousel colors={colors} slides={SERVICE_CAROUSEL_SLIDES} onSlidePress={() => onBrowseServices()} />

      <SectionHeader colors={colors} title="Quick actions" />
      <HeroCarousel colors={colors} slides={actionSlides} onSlidePress={(slide) => onActionSlidePress(slide.id)} />

      <View style={styles.contactCard}>
        <Text style={styles.contactTitle}>Need help now?</Text>
        <Text style={styles.contactCopy}>Our team serves {NNACT_COMPANY.serviceAreas.join(", ")}.</Text>
        <PrimaryButton
          colors={colors}
          label={`Call ${NNACT_COMPANY.contact.phones[0]}`}
          onPress={() => void Linking.openURL(`tel:${NNACT_COMPANY.contact.phones[0].replace(/\s/g, "")}`)}
          variant="secondary"
          size="md"
        />
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.lg },
    heroActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
    statsRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
    },
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
