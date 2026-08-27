import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { NNACT_COMPANY } from "@nnact/shared";
import { Card, PrimaryButton, ScreenHeader } from "../components/ui";
import { fonts, type Palette } from "../theme";

export function HomeScreen({
  colors,
  hasPortalToken,
  hasAccount,
  accountName,
  onOpenPortal,
  onEnterLink,
  onBook,
  onSignIn,
  onSignUp,
  onSignOutAccount,
}: {
  colors: Palette;
  hasPortalToken: boolean;
  hasAccount: boolean;
  accountName?: string;
  onOpenPortal: () => void;
  onEnterLink: () => void;
  onBook: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOutAccount: () => void;
}) {
  const styles = createStyles(colors);
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        colors={colors}
        eyebrow={NNACT_COMPANY.tagline.toUpperCase()}
        title="Your service hub"
        subtitle={NNACT_COMPANY.customerPromise}
      />

      <View style={styles.actions}>
        {hasAccount ? (
          <>
            <PrimaryButton colors={colors} label={`Open ${accountName?.split(" ")[0] ?? "my"} portal`} onPress={onOpenPortal} />
            <PrimaryButton colors={colors} label="Sign out" onPress={onSignOutAccount} variant="secondary" />
          </>
        ) : (
          <>
            <PrimaryButton colors={colors} label="Sign in" onPress={onSignIn} />
            <PrimaryButton colors={colors} label="Create account" onPress={onSignUp} variant="secondary" />
          </>
        )}
        {hasPortalToken && !hasAccount ? (
          <PrimaryButton colors={colors} label="Open portal link" onPress={onOpenPortal} variant="secondary" />
        ) : null}
        <PrimaryButton colors={colors} label="Request service" onPress={onBook} variant={hasAccount ? "secondary" : "primary"} />
        <PrimaryButton colors={colors} label="Enter portal link" onPress={onEnterLink} variant="secondary" />
        <PrimaryButton
          colors={colors}
          label={`Call ${NNACT_COMPANY.contact.phones[0]}`}
          onPress={() => void Linking.openURL(`tel:${NNACT_COMPANY.contact.phones[0].replace(/\s/g, "")}`)}
          variant="secondary"
        />
      </View>

      <Text style={styles.sectionTitle}>What you can do here</Text>
      {[
        ["Approve estimates", "Review and accept repair quotes sent by NNACT."],
        ["Pay invoices", "Pay your balance securely when online checkout is enabled."],
        ["Track maintenance", "See service history and active maintenance plans."],
        ["Request visits", "Book HVAC, refrigeration, electrical, or appliance service."],
      ].map(([title, copy]) => (
        <Card key={title} colors={colors}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardCopy}>{copy}</Text>
        </Card>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: 58, paddingBottom: 24 },
    actions: { paddingHorizontal: 20, gap: 10, marginBottom: 24 },
    sectionTitle: {
      paddingHorizontal: 20,
      color: colors.foreground,
      fontSize: 16,
      fontFamily: fonts.bold,
      marginBottom: 10,
    },
    cardTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold },
    cardCopy: { color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 6, fontFamily: fonts.regular },
  });
