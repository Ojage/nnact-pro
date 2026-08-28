import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { NNACT_COMPANY } from "@nnact/shared";
import { Card, FeatureCard, HeroBanner, PrimaryButton, SectionHeader } from "../components/ui";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import { fonts, spacing, type Palette } from "../theme";

const DIVISION_COLORS = ["#e8f1fc", "#fef8e7", "#f0fdf4"];

export function ServicesScreen({
  colors,
  onBook,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  onBook: (service?: string, category?: string) => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <HeroBanner
        colors={colors}
        eyebrow="Services"
        title="Request technical service"
        subtitle="HVAC, refrigeration, electrical, solar, appliances, and preventive maintenance across Southwest Cameroon."
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      />

      <View style={styles.section}>
        <SectionHeader colors={colors} title="Our divisions" />
        {NNACT_COMPANY.divisions.map((division, i) => (
          <Card key={division.name} colors={colors} elevated>
            <View style={styles.divisionHeader}>
              <View style={[styles.divisionIcon, { backgroundColor: DIVISION_COLORS[i] ?? colors.primaryMuted }]}>
                <Text style={styles.divisionIconText}>{String(i + 1)}</Text>
              </View>
              <View style={styles.divisionMeta}>
                <Text style={styles.divisionName}>{division.name}</Text>
                <Text style={styles.divisionCount}>{division.services.length} services available</Text>
              </View>
            </View>
            {division.services.map((service) => (
              <TouchableServiceRow
                key={service}
                colors={colors}
                label={service}
                onPress={() => onBook(service, division.name)}
              />
            ))}
          </Card>
        ))}

        <View style={styles.areasCard}>
          <Text style={styles.areasTitle}>Service areas</Text>
          <View style={styles.areasRow}>
            {NNACT_COMPANY.serviceAreas.map((area) => (
              <View key={area} style={styles.areaChip}>
                <Text style={styles.areaChipText}>{area}</Text>
              </View>
            ))}
          </View>
        </View>

        <FeatureCard
          colors={colors}
          title="Not sure what you need?"
          description="Call our team and we'll help diagnose the issue and schedule the right technician."
        />
        <PrimaryButton
          colors={colors}
          label={`Call ${NNACT_COMPANY.contact.phones[0]}`}
          onPress={() => void Linking.openURL(`tel:${NNACT_COMPANY.contact.phones[0].replace(/\s/g, "")}`)}
          variant="secondary"
        />
        <PrimaryButton colors={colors} label="Request a service visit" onPress={() => onBook()} variant="primary" />
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function TouchableServiceRow({
  colors,
  label,
  onPress,
}: {
  colors: Palette;
  label: string;
  onPress: () => void;
}) {
  const styles = createStyles(colors);
  return (
    <PrimaryButton
      colors={colors}
      label={label}
      onPress={onPress}
      variant="ghost"
      size="sm"
      fullWidth={false}
    />
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.lg },
    section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
    divisionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
    divisionIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    divisionIconText: { fontSize: 22 },
    divisionMeta: { flex: 1 },
    divisionName: { color: colors.foreground, fontSize: 17, fontFamily: fonts.bold },
    divisionCount: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
    areasCard: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 16,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    areasTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold, marginBottom: spacing.sm },
    areasRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    areaChip: {
      backgroundColor: colors.primaryMuted,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    areaChipText: { color: colors.primary, fontSize: 12, fontFamily: fonts.semibold },
  });
