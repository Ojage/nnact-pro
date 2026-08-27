import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fonts, type Palette } from "../theme";
import { staffLogin } from "../auth-api";
import type { StoredStaffSession } from "../auth-storage";

export function LoginScreen({
  colors,
  onSignedIn,
}: {
  colors: Palette;
  onSignedIn: (session: StoredStaffSession) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      onSignedIn(await staffLogin(email.trim(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>NNACT PRO TECH</Text>
        <Text style={styles.title}>Field sign in</Text>
        <Text style={styles.subtitle}>Use your technician or dispatcher credentials to sync today&apos;s route.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@nnact.com"
          placeholderTextColor={colors.dimForeground}
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.dimForeground}
          style={styles.input}
        />

        <View style={styles.buttonWrap}>
          <Text onPress={submitting ? undefined : () => void submit()} style={[styles.button, submitting && styles.buttonDisabled]}>
            {submitting ? "Signing in…" : "Sign in"}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 },
    eyebrow: { color: colors.primary, fontSize: 10, fontFamily: fonts.extraBold, letterSpacing: 2 },
    title: { color: colors.foreground, fontSize: 30, fontFamily: fonts.extraBold, marginTop: 8 },
    subtitle: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 24, fontFamily: fonts.regular },
    label: { color: colors.mutedForeground, fontSize: 12, marginBottom: 6, fontFamily: fonts.bold },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.foreground,
      fontSize: 15,
      marginBottom: 14,
      fontFamily: fonts.regular,
    },
    buttonWrap: { marginTop: 8 },
    button: {
      borderRadius: 999,
      backgroundColor: colors.primary,
      color: colors.onEmphasis,
      textAlign: "center",
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: fonts.bold,
      overflow: "hidden",
    },
    buttonDisabled: { opacity: 0.6 },
    error: { color: colors.danger, fontSize: 12, marginTop: 14, fontFamily: fonts.regular },
  });

export function AuthBootScreen({ colors }: { colors: Palette }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
