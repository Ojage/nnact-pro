import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildGoogleMapsDirectionsUrl, NNACT_COMPANY } from "@nnact/shared";
import { Card, HeroBanner, LocationCard, PrimaryButton, SectionHeader } from "../components/ui";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import { fonts, spacing, type Palette } from "../theme";

export function AccountScreen({
  colors,
  accountName,
  accountEmail,
  onSignIn,
  onSignUp,
  onSignOut,
  signingOut,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  accountName?: string;
  accountEmail?: string;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  signingOut?: boolean;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);
  const signedIn = Boolean(accountName);

  if (!signedIn) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <HeroBanner
          colors={colors}
          eyebrow="Account"
          title="Sign in to NNACT"
          subtitle="Access estimates, invoices, maintenance plans, and service history for your properties."
          searchPlaceholder={searchPlaceholder}
          onSearchPress={onOpenSearch}
          searchFonts={searchFonts}
        />
        <View style={styles.section}>
          <PrimaryButton colors={colors} label="Sign in" onPress={onSignIn} />
          <PrimaryButton colors={colors} label="Create account" onPress={onSignUp} variant="secondary" />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <HeroBanner
        colors={colors}
        eyebrow="Account"
        title={accountName ?? "Your account"}
        subtitle={accountEmail}
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      />

      <View style={styles.section}>
        <SectionHeader colors={colors} title="Profile" />
        <Card colors={colors} elevated>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color={colors.primary} />
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{accountName}</Text>
              <Text style={styles.profileEmail}>{accountEmail}</Text>
            </View>
          </View>
        </Card>

        <SectionHeader colors={colors} title="Support" />
        <Card colors={colors}>
          <Text style={styles.supportLabel}>Email</Text>
          <Text style={styles.supportValue}>{NNACT_COMPANY.contact.email}</Text>
          <Text style={[styles.supportLabel, { marginTop: spacing.md }]}>Phone</Text>
          {NNACT_COMPANY.contact.phones.map((phone) => (
            <PrimaryButton
              key={phone}
              colors={colors}
              label={phone}
              onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, "")}`)}
              variant="ghost"
              size="sm"
              fullWidth={false}
            />
          ))}
        </Card>

        <LocationCard
          colors={colors}
          title="Visit our workshop"
          streetAddress={NNACT_COMPANY.location.streetAddress}
          locality={NNACT_COMPANY.location.addressLocality}
          region={NNACT_COMPANY.location.addressRegion}
          actionLabel="Get directions"
          onPress={() => void Linking.openURL(buildGoogleMapsDirectionsUrl())}
        />

        <SectionHeader colors={colors} title="Session" />
        <PrimaryButton
          colors={colors}
          label="Sign out"
          onPress={onSignOut}
          variant="danger"
          loading={signingOut}
          disabled={signingOut}
        />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.lg },
    section: { paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
    profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    profileCopy: { flex: 1, gap: 2 },
    profileName: { color: colors.foreground, fontSize: 17, fontFamily: fonts.bold },
    profileEmail: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.regular },
    supportLabel: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.bold, textTransform: "uppercase" },
    supportValue: { color: colors.foreground, fontSize: 15, fontFamily: fonts.regular, marginTop: 4 },
  });
