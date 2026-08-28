import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PasswordInput, BrandLogo, BackButton } from "@nnact/mobile-ui";
import { customerLogin } from "../auth-api";
import type { StoredCustomerSession } from "../auth-storage";
import { Card, HeroBanner, PrimaryButton, TextField } from "../components/ui";
import { formatNetworkError, getApiUrl } from "../env";
import { fonts, spacing, type Palette } from "../theme";

export function LoginScreen({
  colors,
  onBack,
  onSignedIn,
  onCreateAccount,
}: {
  colors: Palette;
  onBack: () => void;
  onSignedIn: (session: StoredCustomerSession) => void;
  onCreateAccount: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const styles = createStyles();

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      onSignedIn(await customerLogin(email.trim(), password));
    } catch (err) {
      setError(formatNetworkError(err, getApiUrl()));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.logoRow}>
        <BrandLogo size={56} />
      </View>
      <HeroBanner
        colors={colors}
        eyebrow="WELCOME BACK"
        title="Sign in"
        subtitle="Access estimates, invoices, and service history across all your NNACT properties."
      />
      <View style={styles.form}>
        <Card colors={colors} elevated>
          <TextField
            colors={colors}
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <PasswordInput
            colors={colors}
            fonts={{ medium: fonts.medium, semibold: fonts.semibold, bold: fonts.bold }}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          {error ? <Text style={[styles.formError, { color: colors.danger }]}>{error}</Text> : null}
        </Card>
        <PrimaryButton colors={colors} label="Sign in" onPress={() => void submit()} disabled={submitting} loading={submitting} />
        <PrimaryButton colors={colors} label="Create an account" onPress={onCreateAccount} variant="secondary" />
        <BackButton colors={colors} onPress={onBack} variant="surface" />
      </View>
    </ScrollView>
  );
}

const createStyles = () =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingBottom: spacing.xl },
    logoRow: { alignItems: "center", paddingTop: spacing.xl, paddingBottom: spacing.sm },
    form: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
    formError: { fontSize: 13, marginTop: 4, fontFamily: fonts.regular },
  });
