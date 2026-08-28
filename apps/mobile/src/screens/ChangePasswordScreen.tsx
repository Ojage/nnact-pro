import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { PasswordInput, getPasswordStrength } from "@nnact/mobile-ui";
import { PASSWORD_MIN_LENGTH, validatePasswordStrength } from "@nnact/shared";
import { staffChangePassword } from "../auth-api";
import type { StoredStaffSession } from "../auth-storage";
import { Card, PrimaryButton } from "../components/ui";
import { formatNetworkError, getApiUrl } from "../env";
import { fonts, spacing, type Palette } from "../theme";

export function ChangePasswordScreen({
  colors,
  session,
  onComplete,
}: {
  colors: Palette;
  session: StoredStaffSession;
  onComplete: (next: StoredStaffSession) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = createStyles(colors);
  const strength = getPasswordStrength(newPassword);

  async function submit() {
    setError(null);
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    setSubmitting(true);
    try {
      onComplete(await staffChangePassword(session, currentPassword, newPassword));
    } catch (err) {
      setError(formatNetworkError(err, getApiUrl()));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Set your password</Text>
        <Text style={styles.subtitle}>
          Your owner shared a temporary password. Choose a new one before using the field app.
        </Text>
        <Card colors={colors} elevated>
          <PasswordInput
            colors={colors}
            fonts={{ medium: fonts.medium, semibold: fonts.semibold, bold: fonts.bold }}
            label="Temporary password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            autoComplete="password"
          />
          <PasswordInput
            colors={colors}
            fonts={{ medium: fonts.medium, semibold: fonts.semibold, bold: fonts.bold }}
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            autoComplete="new-password"
            showStrength
          />
          {newPassword.length > 0 && strength.score < 2 ? (
            <Text style={styles.hint}>Use at least {PASSWORD_MIN_LENGTH} characters with letters and numbers.</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>
        <PrimaryButton
          colors={colors}
          label={submitting ? "Saving…" : "Save and continue"}
          onPress={() => void submit()}
          disabled={submitting}
          variant="accent"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingTop: spacing.xl },
    title: { color: colors.foreground, fontSize: 24, fontFamily: fonts.extraBold, marginBottom: spacing.sm },
    subtitle: { color: colors.mutedForeground, fontSize: 14, marginBottom: spacing.lg, fontFamily: fonts.regular },
    hint: { color: colors.mutedForeground, fontSize: 12, marginTop: spacing.xs, fontFamily: fonts.regular },
    error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm, fontFamily: fonts.medium },
  });
