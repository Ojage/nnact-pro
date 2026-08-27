import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { customerLogin } from "../auth-api";
import type { StoredCustomerSession } from "../auth-storage";
import { Card, PrimaryButton, ScreenHeader } from "../components/ui";
import { fonts, type Palette } from "../theme";

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
  const styles = createStyles(colors);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      onSignedIn(await customerLogin(email.trim(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <ScreenHeader
        colors={colors}
        eyebrow="YOUR ACCOUNT"
        title="Sign in"
        subtitle="Access estimates, invoices, and service history across all your NNACT properties."
        onBack={onBack}
      />
      <View style={styles.form}>
        <Card colors={colors}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor={colors.dimForeground}
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="Password"
            placeholderTextColor={colors.dimForeground}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>
        <PrimaryButton colors={colors} label={submitting ? "Signing in…" : "Sign in"} onPress={() => void submit()} disabled={submitting} />
        <PrimaryButton colors={colors} label="Create an account" onPress={onCreateAccount} variant="secondary" />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: 58, paddingBottom: 24 },
    form: { paddingHorizontal: 20, gap: 12 },
    label: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.bold, marginBottom: 8, marginTop: 8, textTransform: "uppercase" },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardMuted,
      padding: 12,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: fonts.regular,
    },
    error: { color: colors.danger, fontSize: 12, marginTop: 10, fontFamily: fonts.regular },
  });
