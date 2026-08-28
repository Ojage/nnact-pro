import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildGoogleMapsDirectionsUrl, NNACT_COMPANY } from "@nnact/shared";
import type { StoredStaffSession } from "../auth-storage";
import { Card, HeroBanner, LocationCard, PrimaryButton, SectionHeader, StatCard } from "../components/ui";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import { fonts, spacing, type Palette } from "../theme";

function humanizeRole(role: string) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AccountScreen({
  colors,
  session,
  offline,
  lastSync,
  queuedWrites,
  onSignOut,
  signingOut,
  onOpenNotifications,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  session: StoredStaffSession;
  offline: boolean;
  lastSync: string | null;
  queuedWrites: number;
  onSignOut: () => void;
  signingOut?: boolean;
  onOpenNotifications?: () => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <HeroBanner
        colors={colors}
        eyebrow="Account"
        title={session.user.name}
        subtitle={session.user.email}
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      />

      <View style={styles.statsRow}>
        <StatCard colors={colors} label="Status" value={offline ? "Offline" : "Online"} accent={offline ? "warning" : "success"} />
        <StatCard colors={colors} label="Queued" value={String(queuedWrites)} hint="Pending sync" accent={queuedWrites ? "warning" : undefined} />
      </View>

      <View style={styles.section}>
        <SectionHeader colors={colors} title="Profile" />
        <Card colors={colors} elevated>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="construct" size={26} color={colors.primary} />
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{session.user.name}</Text>
              <Text style={styles.profileEmail}>{session.user.email}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{humanizeRole(session.user.role)}</Text>
              </View>
            </View>
          </View>
        </Card>

        <SectionHeader colors={colors} title="Inbox" />
        <Card colors={colors} elevated>
          <PrimaryButton
            colors={colors}
            label="Notifications & assignments"
            onPress={() => onOpenNotifications?.()}
            variant="secondary"
            size="sm"
            fullWidth={false}
          />
        </Card>

        <SectionHeader colors={colors} title="Organization" />
        <Card colors={colors} elevated>
          <Text style={styles.label}>Organization</Text>
          <Text style={styles.value}>{session.orgId}</Text>
          {lastSync ? (
            <>
              <Text style={[styles.label, { marginTop: spacing.md }]}>Last sync</Text>
              <Text style={styles.value}>{lastSync}</Text>
            </>
          ) : null}
        </Card>

        <SectionHeader colors={colors} title="Support" />
        <LocationCard
          colors={colors}
          title="Visit our workshop"
          streetAddress={NNACT_COMPANY.location.streetAddress}
          locality={NNACT_COMPANY.location.addressLocality}
          region={NNACT_COMPANY.location.addressRegion}
          actionLabel="Get directions"
          onPress={() => void Linking.openURL(buildGoogleMapsDirectionsUrl())}
        />
        <Card colors={colors}>
          <Text style={styles.label}>Dispatch</Text>
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
    statsRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: -spacing.md, marginBottom: spacing.lg },
    section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    profileCopy: { flex: 1, gap: 4 },
    profileName: { color: colors.foreground, fontSize: 17, fontFamily: fonts.bold },
    profileEmail: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.regular },
    roleBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.primaryMuted,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 2,
    },
    roleText: { color: colors.primary, fontSize: 11, fontFamily: fonts.bold, textTransform: "capitalize" },
    label: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.bold, textTransform: "uppercase" },
    value: { color: colors.foreground, fontSize: 14, fontFamily: fonts.regular, marginTop: 4, lineHeight: 20 },
  });
