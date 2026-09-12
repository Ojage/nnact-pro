import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { PasswordInput, BackButton } from "@nnact/mobile-ui";
import {
  NNACT_PRODUCT,
  cameroonCarrierLabel,
  isValidCameroonMobile,
  normalizePhone,
} from "@nnact/shared";
import { customerLogin, customerLoginWithPhone, customerRequestOtp, customerRequestPasswordReset, customerResetPassword, customerVerifyOtp } from "../auth-api";
import type { StoredCustomerSession } from "../auth-storage";
import { Card, PrimaryButton, TextField } from "../components/ui";
import { ImageHero } from "../components/ImageHero";
import { HeroCarousel } from "../components/HeroCarousel";
import { SERVICE_CAROUSEL_SLIDES } from "../content/home-carousels";
import { formatNetworkError } from "../env";
import { fonts, radius, spacing, type Palette } from "../theme";

const HERO_IMAGE = require("../../assets/photos/nnact-protech-app-hero.png");

const OTP_DIGITS = 6;
const RESEND_COOLDOWN_SECONDS = 60;

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
  const [otpStage, setOtpStage] = useState<"phone" | "code">("phone");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedPhone, setRequestedPhone] = useState("");
  const [password, setPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_DIGITS).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const styles = createStyles(colors);
  const otpRefs = useRef<Array<TextInput | null>>([]);
  const resetCodeRef = useRef<TextInput>(null);

  const [showReset, setShowReset] = useState(false);
  const [resetStage, setResetStage] = useState<"identifier" | "code">("identifier");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [requestingReset, setRequestingReset] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetResendIn, setResetResendIn] = useState(0);
  const [resetSent, setResetSent] = useState(false);

  const isPhoneValid = isValidCameroonMobile(phone);
  const resetLooksLikeEmail = /@/.test(resetIdentifier.trim());

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [resendIn > 0]);

  useEffect(() => {
    if (resetResendIn <= 0) return;
    const timer = setInterval(() => setResetResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [resetResendIn > 0]);

  async function sendCode() {
    if (!isPhoneValid) {
      setError("Enter a valid MTN, Orange, or Camtel number.");
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const target = normalizePhone(phone);
      const result = await customerRequestOtp(target);
      if (!result.sent) {
        setError("Could not send a code right now. Try again in a minute.");
        return;
      }
      setRequestedPhone(target);
      setDigits(Array(OTP_DIGITS).fill(""));
      setOtpStage("code");
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch (err) {
      setError(formatNetworkError(err));
    } finally {
      setSendingCode(false);
    }
  }

  function handleOtpChange(index: number, text: string) {
    const cleaned = text.replace(/\D+/g, "");
    if (!cleaned) {
      setDigits((d) => {
        const next = [...d];
        next[index] = "";
        return next;
      });
      if (index > 0) otpRefs.current[index - 1]?.focus();
      return;
    }
    const next = [...digits];
    let caret = index;
    for (const char of cleaned) {
      if (caret >= OTP_DIGITS) break;
      next[caret] = char;
      caret += 1;
    }
    setDigits(next);
    if (cleaned.length > 1 || caret < OTP_DIGITS) {
      otpRefs.current[Math.min(caret, OTP_DIGITS - 1)]?.focus();
    } else {
      void verifyCode(next.join(""));
    }
  }

  async function verifyCode(code: string) {
    if (verifying || code.length !== OTP_DIGITS) return;
    setVerifying(true);
    setError(null);
    try {
      onSignedIn(await customerVerifyOtp(requestedPhone, code));
    } catch (err) {
      setError(formatNetworkError(err));
      setDigits(Array(OTP_DIGITS).fill(""));
      otpRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  function resetOtp() {
    setDigits(Array(OTP_DIGITS).fill(""));
    setOtpStage("phone");
    setRequestedPhone("");
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (email.includes("@")) {
        onSignedIn(await customerLogin(email.trim(), password));
      } else if (email.trim()) {
        onSignedIn(await customerLoginWithPhone(email.trim(), password));
      } else {
        setError("Enter your email or phone number.");
      }
    } catch (err) {
      setError(formatNetworkError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function requestResetCode() {
    const value = resetIdentifier.trim();
    if (!value) {
      setError("Enter the email or phone on your account.");
      return;
    }
    setRequestingReset(true);
    setError(null);
    try {
      const result = await customerRequestPasswordReset(resetLooksLikeEmail ? { email: value } : { phone: value });
      setResetSent(true);
      setResetStage("code");
      setResetCode("");
      setResetResendIn(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => resetCodeRef.current?.focus(), 150);
    } catch (err) {
      setError(formatNetworkError(err));
    } finally {
      setRequestingReset(false);
    }
  }

  async function submitReset() {
    if (resetCode.trim().length !== OTP_DIGITS) {
      setError("Enter the 6-digit code.");
      return;
    }
    setResettingPassword(true);
    setError(null);
    try {
      const payload = resetLooksLikeEmail
        ? { email: resetIdentifier.trim(), code: resetCode.trim(), newPassword: resetNewPassword }
        : { phone: resetIdentifier.trim(), code: resetCode.trim(), newPassword: resetNewPassword };
      onSignedIn(await customerResetPassword(payload));
    } catch (err) {
      setError(formatNetworkError(err));
    } finally {
      setResettingPassword(false);
    }
  }

  function exitReset() {
    setShowReset(false);
    setResetStage("identifier");
    setResetIdentifier("");
    setResetCode("");
    setResetNewPassword("");
    setResetSent(false);
    setError(null);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ImageHero
          colors={colors}
          image={HERO_IMAGE}
          eyebrow="WELCOME BACK"
          title="Sign in"
          subtitle="Access estimates, invoices, and service history across all your NNACT properties."
        />

        <View style={styles.form}>
          <Card colors={colors} elevated>
            {showReset ? (
              <>
                <Text style={styles.codeTitle}>Reset your password</Text>
                <Text style={styles.codeSub}>
                  Enter the email or phone linked to your account and we&apos;ll send a one-time code.
                </Text>
                {resetStage === "identifier" ? (
                  <>
                    <TextField
                      colors={colors}
                      label="Email or phone"
                      value={resetIdentifier}
                      onChangeText={setResetIdentifier}
                      placeholder="you@example.com or 6XX XX XX XX"
                      autoCapitalize="none"
                      autoComplete="email"
                    />
                    <PrimaryButton
                      colors={colors}
                      label={requestingReset ? "Sending…" : "Send code"}
                      onPress={() => void requestResetCode()}
                      loading={requestingReset}
                      variant="accent"
                      size="md"
                    />
                  </>
                ) : (
                  <>
                    <TextField
                      colors={colors}
                      label="Verification code"
                      value={resetCode}
                      onChangeText={(text) => setResetCode(text.replace(/\D+/g, "").slice(0, OTP_DIGITS))}
                      placeholder="000000"
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      inputRef={resetCodeRef}
                    />
                    <PasswordInput
                      colors={colors}
                      fonts={{ medium: fonts.medium, semibold: fonts.semibold, bold: fonts.bold }}
                      label="New password"
                      value={resetNewPassword}
                      onChangeText={setResetNewPassword}
                      placeholder="At least 12 characters"
                      autoComplete="new-password"
                      returnKeyType="go"
                      onSubmitEditing={() => void submitReset()}
                    />
                    <PrimaryButton
                      colors={colors}
                      label={resettingPassword ? "Resetting…" : "Reset password"}
                      onPress={() => void submitReset()}
                      loading={resettingPassword}
                      variant="accent"
                      size="md"
                    />
                    <View style={styles.otpMeta}>
                      <Pressable
                        onPress={() => { setResetStage("identifier"); setResetSent(false); setError(null); }}
                        disabled={resettingPassword}
                        hitSlop={8}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.otpLink, { color: colors.dimForeground }]}>Change email / phone</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void requestResetCode()}
                        disabled={resetResendIn > 0 || requestingReset}
                        hitSlop={8}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.otpLink,
                            { color: resetResendIn > 0 || requestingReset ? colors.dimForeground : colors.accent },
                          ]}
                        >
                          {resetResendIn > 0 ? `Resend code in ${resetResendIn}s` : requestingReset ? "Sending…" : "Resend code"}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
                {error ? <Text style={styles.formError}>{error}</Text> : null}
                <Pressable onPress={exitReset} disabled={requestingReset || resettingPassword} hitSlop={8} accessibilityRole="button" style={{ marginTop: spacing.sm }}>
                  <Text style={[styles.otpLink, { color: colors.dimForeground }]}>Back to sign in</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.modeRow}>
                  {(["password", "otp"] as const).map((tab) => (
                    <Pressable
                      key={tab}
                      onPress={() => {
                        setMode(tab);
                        setError(null);
                        if (tab === "otp") setOtpStage("phone");
                      }}
                      style={[styles.modeTab, mode === tab && styles.modeTabActive]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: mode === tab }}
                      accessibilityLabel={tab === "password" ? "Sign in with password" : "Sign in with code"}
                    >
                      <Text style={[styles.modeTabText, mode === tab && styles.modeTabTextActive]}>
                        {tab === "password" ? "Password" : "Code (OTP)"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {mode === "otp" ? (
              otpStage === "phone" ? (
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
                  <Text style={styles.phoneHint}>
                    {phone.trim()
                      ? isPhoneValid
                        ? `${cameroonCarrierLabel(phone)} · we'll text you a 6-digit code`
                        : "Enter a valid MTN, Orange, or Camtel number."
                      : "We'll text you a 6-digit sign-in code."}
                  </Text>
                  <PrimaryButton
                    colors={colors}
                    label={sendingCode ? "Requesting…" : "Request Short Code"}
                    onPress={() => void sendCode()}
                    disabled={!isPhoneValid}
                    loading={sendingCode}
                    variant="accent"
                    size="md"
                  />
                  {error ? <Text style={styles.formError}>{error}</Text> : null}
                </>
              ) : (
                <>
                  <Text style={styles.codeTitle}>Enter the 6-digit code</Text>
                  <Text style={styles.codeSub}>Sent to {requestedPhone}</Text>
                  <View style={styles.otpRow}>
                    {digits.map((digit, index) => (
                      <TextInput
                        key={index}
                        ref={(el) => {
                          otpRefs.current[index] = el;
                        }}
                        value={digit}
                        onChangeText={(text) => handleOtpChange(index, text)}
                        onKeyPress={({ nativeEvent }) => {
                          if (nativeEvent.key === "Backspace" && !digit && index > 0) {
                            otpRefs.current[index - 1]?.focus();
                          }
                        }}
                        keyboardType="number-pad"
                        maxLength={6}
                        editable={!verifying}
                        selectTextOnFocus
                        selectionColor={colors.accent}
                        placeholderTextColor={colors.dimForeground}
                        accessibilityLabel={`Digit ${index + 1} of ${OTP_DIGITS}`}
                        style={[styles.otpBox, digit ? styles.otpBoxFilled : null, verifying && styles.otpBoxDim]}
                      />
                    ))}
                  </View>
                  <View style={styles.otpMeta}>
                    <Pressable onPress={resetOtp} hitSlop={8} accessibilityRole="button">
                      <Text style={[styles.otpLink, { color: colors.dimForeground }]}>Change number</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void sendCode()}
                      disabled={resendIn > 0 || sendingCode}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.otpLink,
                          { color: resendIn > 0 || sendingCode ? colors.dimForeground : colors.accent },
                        ]}
                      >
                        {resendIn > 0 ? `Resend code in ${resendIn}s` : sendingCode ? "Sending…" : "Resend code"}
                      </Text>
                    </Pressable>
                  </View>
                  {verifying ? (
                    <Text style={[styles.codeSub, { color: colors.accent }]}>Signing you in…</Text>
                  ) : null}
                  {error ? <Text style={styles.formError}>{error}</Text> : null}
                </>
              )
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
                <Pressable
                  onPress={() => { setShowReset(true); setError(null); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={{ alignSelf: "flex-end", marginTop: 4 }}
                >
                  <Text style={[styles.otpLink, { color: colors.dimForeground }]}>Forgot password?</Text>
                </Pressable>
              </>
            )}
            {error ? <Text style={[styles.formError, { color: colors.danger }]}>{error}</Text> : null}
            </>
            )}
          </Card>
          {mode === "password" ? (
            <PrimaryButton
              colors={colors}
              label="Sign in"
              onPress={() => void submit()}
              disabled={submitting}
              loading={submitting}
              variant="accent"
            />
          ) : null}
          <PrimaryButton colors={colors} label="Create an account" onPress={onCreateAccount} variant="secondary" />
          <BackButton colors={colors} onPress={onBack} variant="surface" />
        </View>

        <View style={styles.carouselHeading}>
          <Text style={styles.carouselEyebrow}>OUR SERVICE AREAS</Text>
          <Text style={styles.carouselTitle}>Explore our services</Text>
        </View>
        <HeroCarousel colors={colors} slides={SERVICE_CAROUSEL_SLIDES} />

        <View style={styles.footer}>
          <Text style={styles.footLine}>
            {NNACT_PRODUCT.name} — {NNACT_PRODUCT.subtitle}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    form: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
    formError: { fontSize: 13, marginTop: 4, fontFamily: fonts.regular },
    modeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    modeTab: {
      flex: 1,
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: "center",
    },
    modeTabActive: { borderColor: colors.accent, backgroundColor: "transparent" },
    modeTabText: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.semibold },
    modeTabTextActive: { color: colors.accent },
    phoneHint: {
      fontSize: 12,
      fontFamily: fonts.regular,
      lineHeight: 17,
      marginTop: 2,
      color: colors.dimForeground,
    },
    codeTitle: {
      fontSize: 15,
      fontFamily: fonts.semibold,
      color: colors.foreground,
    },
    codeSub: {
      fontSize: 12,
      fontFamily: fonts.regular,
      color: colors.dimForeground,
      marginTop: 2,
    },
    otpRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    otpBox: {
      flex: 1,
      height: 54,
      borderWidth: 1.5,
      borderColor: colors.borderLight,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
      textAlign: "center",
      fontSize: 20,
      fontFamily: fonts.semibold,
      color: colors.foreground,
      paddingVertical: 0,
    },
    otpBoxFilled: {
      borderColor: colors.accent,
    },
    otpBoxDim: {
      opacity: 0.4,
    },
    otpMeta: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.sm,
    },
    otpLink: {
      fontSize: 13,
      fontFamily: fonts.semibold,
    },
    carouselHeading: {
      marginTop: spacing.xl,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    carouselEyebrow: {
      color: colors.accent,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 1.8,
      textTransform: "uppercase",
    },
    carouselTitle: {
      color: colors.foreground,
      fontSize: 22,
      fontFamily: fonts.extraBold,
      letterSpacing: -0.3,
      marginTop: 2,
    },
    footer: {
      alignItems: "center",
      paddingTop: spacing.lg,
    },
    footLine: {
      color: colors.dimForeground,
      fontSize: 11,
      fontFamily: fonts.regular,
      textAlign: "center",
    },
  });