import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PasswordInput, BrandLogo, BackButton } from "@nnact/mobile-ui";
import { customerLogin, customerLoginWithPhone, customerRequestOtp, customerVerifyOtp } from "../auth-api";
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
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const styles = createStyles(colors);

  async function sendCode() {
    if (!phone.trim()) {
      setError("Enter your phone number first.");
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const result = await customerRequestOtp(phone.trim());
      if (result.devCode) setDevCode(result.devCode);
      if (!result.sent) setError("Could not send a code right now. Try again in a minute.");
    } catch (err) {
      setError(formatNetworkError(err, getApiUrl()));
    } finally {
      setSendingCode(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "otp") {
        onSignedIn(await customerVerifyOtp(phone.trim(), code.trim()));
      } else if (email.includes("@")) {
        onSignedIn(await customerLogin(email.trim(), password));
      } else if (email.trim()) {
        onSignedIn(await customerLoginWithPhone(email.trim(), password));
      } else {
        setError("Enter your email or phone number.");
      }
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
          <View style={styles.modeRow}>
            {(["password", "otp"] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => {
                  setMode(tab);
                  setError(null);
                }}
                style={[styles.modeTab, mode === tab && styles.modeTabActive]}
              >
                <Text style={[styles.modeTabText, mode === tab && styles.modeTabTextActive]}>
                  {tab === "password" ? "Password" : "Code (OTP)"}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "otp" ? (
            <>
              <TextField
                colors={colors}
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                placeholder="6XX XX XX XX"
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              {devCode ? (
                <Text style={[styles.devHint, { color: colors.success }]}>
                  Dev code: {devCode} (SMS provider not configured)
                </Text>
              ) : null}
              <View style={styles.codeRow}>
                <View style={styles.codeField}>
                  <TextField
                    colors={colors}
                    label="6-digit code"
                    value={code}
                    onChangeText={setCode}
                    placeholder="123456"
                    keyboardType="number-pad"
                  />
                </View>
                <Pressable
                  onPress={() => void sendCode()}
                  disabled={sendingCode || !phone.trim()}
                  style={[styles.sendCodeButton, { borderColor: colors.accent }]}
                >
                  <Text style={[styles.sendCodeText, { color: colors.accent }]}>
                    {sendingCode ? "Sending…" : "Send code"}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <TextField
                colors={colors}
                label="Email or phone"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com or 6XX XX XX XX"
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
            </>
          )}
          {error ? <Text style={[styles.formError, { color: colors.danger }]}>{error}</Text> : null}
        </Card>
        <PrimaryButton colors={colors} label={mode === "otp" ? "Sign in with code" : "Sign in"} onPress={() => void submit()} disabled={submitting} loading={submitting} />
        <PrimaryButton colors={colors} label="Create an account" onPress={onCreateAccount} variant="secondary" />
        <BackButton colors={colors} onPress={onBack} variant="surface" />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingBottom: spacing.xl },
    logoRow: { alignItems: "center", paddingTop: spacing.xl, paddingBottom: spacing.sm },
    form: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
    formError: { fontSize: 13, marginTop: 4, fontFamily: fonts.regular },
    modeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    modeTab: {
      flex: 1,
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: 12,
      paddingVertical: spacing.sm,
      alignItems: "center",
    },
    modeTabActive: { borderColor: colors.accent },
    modeTabText: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.semibold },
    modeTabTextActive: { color: colors.accent },
    codeRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
    codeField: { flex: 1 },
    sendCodeButton: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: 2,
    },
    sendCodeText: { fontSize: 13, fontFamily: fonts.semibold },
    devHint: { fontSize: 12, fontFamily: fonts.regular, marginTop: 4 },
  });
