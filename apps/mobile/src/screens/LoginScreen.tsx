import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { PasswordInput, BrandLogo, BackButton } from "@nnact/mobile-ui";
import { NNACT_PRODUCT } from "@nnact/shared";
import { staffLogin } from "../auth-api";
import type { StoredStaffSession } from "../auth-storage";
import { Card, HeroBanner, LoadingScreen, PrimaryButton, TextField } from "../components/ui";
import { formatNetworkError, getApiUrl } from "../env";
import { fonts, spacing, type Palette } from "../theme";

export function LoginScreen({
  colors,
  onBack,
  onSignedIn,
}: {
  colors: Palette;
  onBack?: () => void;
  onSignedIn: (session: StoredStaffSession) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = createStyles();

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      onSignedIn(await staffLogin(email.trim(), password));
    } catch (err) {
      setError(formatNetworkError(err, getApiUrl()));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <BrandLogo size={56} />
        </View>
        <HeroBanner
          colors={colors}
          eyebrow={NNACT_PRODUCT.name}
          title="Sign in"
          subtitle="Use your technician or dispatcher credentials to sync today's route and diagnostic workflows."
        />
        <View style={styles.form}>
          <Card colors={colors} elevated>
            <TextField
              colors={colors}
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@nnact.com"
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
          <PrimaryButton
            colors={colors}
            label="Sign in"
            onPress={() => void submit()}
            disabled={submitting}
            loading={submitting}
            variant="accent"
          />
          {onBack ? <BackButton colors={colors} onPress={onBack} variant="surface" /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthBootScreen({ colors }: { colors: Palette }) {
  return <LoadingScreen colors={colors} message="Loading session…" />;
}

const createStyles = () =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingBottom: spacing.xl },
    logoRow: { alignItems: "center", paddingTop: spacing.xl, paddingBottom: spacing.sm },
    form: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
    formError: { fontSize: 13, marginTop: 4, fontFamily: fonts.regular },
  });
