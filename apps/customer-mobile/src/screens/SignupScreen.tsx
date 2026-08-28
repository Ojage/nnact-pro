import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { getPasswordStrength, PasswordInput, BrandLogo, BackButton } from "@nnact/mobile-ui";
import { PASSWORD_MIN_LENGTH } from "@nnact/shared";
import { customerRegister } from "../auth-api";
import type { StoredCustomerSession } from "../auth-storage";
import { Card, HeroBanner, PrimaryButton, TextField } from "../components/ui";
import { formatNetworkError, getApiUrl } from "../env";
import { fonts, spacing, type Palette } from "../theme";

export function SignupScreen({
  colors,
  onBack,
  onSignedIn,
}: {
  colors: Palette;
  onBack: () => void;
  onSignedIn: (session: StoredCustomerSession) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const styles = createStyles();

  async function submit() {
    const strength = getPasswordStrength(password);
    if (!strength.isValid) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters with letters and numbers.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      onSignedIn(
        await customerRegister({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
        }),
      );
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
        eyebrow="JOIN NNACT"
        title="Create your account"
        subtitle={`Choose a strong password (at least ${PASSWORD_MIN_LENGTH} characters with letters and numbers).`}
      />
      <View style={styles.form}>
        <Card colors={colors} elevated>
          <TextField colors={colors} label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
          <TextField
            colors={colors}
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextField
            colors={colors}
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            placeholder="+237 …"
            keyboardType="phone-pad"
          />
          <PasswordInput
            colors={colors}
            fonts={{ medium: fonts.medium, semibold: fonts.semibold, bold: fonts.bold }}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Create a password"
            autoComplete="new-password"
            showStrength
            error={error ?? undefined}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        </Card>
        <PrimaryButton colors={colors} label="Create account" onPress={() => void submit()} disabled={submitting} loading={submitting} />
        <BackButton colors={colors} onPress={onBack} variant="surface" label="Back to sign in" />
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
  });
