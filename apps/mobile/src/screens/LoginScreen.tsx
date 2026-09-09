import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { PasswordInput, BrandLogo, BackButton } from "@nnact/mobile-ui";
import { NNACT_PRODUCT } from "@nnact/shared";
import { staffLogin, staffLoginWithPhone, staffRequestOtp, staffVerifyOtp } from "../auth-api";
import type { StoredStaffSession } from "../auth-storage";
import { Card, LoadingScreen, PrimaryButton, TextField } from "../components/ui";
import { HeroCarousel } from "../components/HeroCarousel";
import { NNACT_BUEA_SLIDES } from "../content/field-carousels";
import { formatNetworkError, getApiUrl } from "../env";
import { fonts, radius, spacing, type Palette } from "../theme";

const HERO_IMAGE = require("../../assets/photos/nnact-protech-app-hero.png");

const HERO_RAMP_ALPHAS = [
  0.501, 0.491, 0.482, 0.474, 0.466, 0.463, 0.459, 0.453, 0.445, 0.437, 0.425,
  0.411, 0.398, 0.384, 0.37, 0.356, 0.347, 0.337, 0.321, 0.292, 0.262, 0.235,
  0.209, 0.184, 0.165, 0.149, 0.134, 0.118,
];

const RAMP_CONTAINER = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "flex-end",
  },
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function BottomRamp() {
  return (
    <View style={RAMP_CONTAINER.container} pointerEvents="none">
      {HERO_RAMP_ALPHAS.map((alpha, index) => (
        <View
          key={index}
          style={{
            height: `${100 / HERO_RAMP_ALPHAS.length}%`,
            backgroundColor: `rgba(20, 13, 8, ${alpha})`,
          }}
        />
      ))}
    </View>
  );
}

export function LoginScreen({
  colors,
  onBack,
  onSignedIn,
}: {
  colors: Palette;
  onBack?: () => void;
  onSignedIn: (session: StoredStaffSession) => void;
}) {
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = createStyles(colors);
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = clamp(Math.round(windowHeight * 0.42), 300, 340);
  const kenBurns = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const phase = (toValue: number) =>
      Animated.timing(kenBurns, {
        toValue,
        duration: 16000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([phase(1), phase(0)]));
    loop.start();
    return () => loop.stop();
  }, [kenBurns]);

  const heroScale = kenBurns.interpolate({ inputRange: [0, 1], outputRange: [1, 1.24] });
  const heroTranslateX = kenBurns.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 8] });
  const heroTranslateY = kenBurns.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, -6] });

  async function sendCode() {
    if (!phone.trim()) {
      setError("Enter your phone number first.");
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const result = await staffRequestOtp(phone.trim());
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
        onSignedIn(await staffVerifyOtp(phone.trim(), code.trim()));
      } else if (email.includes("@")) {
        onSignedIn(await staffLogin(email.trim(), password));
      } else if (email.trim()) {
        onSignedIn(await staffLoginWithPhone(email.trim(), password));
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { height: heroHeight }]}>
          <Animated.Image
            source={HERO_IMAGE}
            resizeMode="cover"
            accessible={false}
            style={[styles.image, { transform: [{ scale: heroScale }, { translateX: heroTranslateX }, { translateY: heroTranslateY }] }]}
          />
          <BottomRamp />

          <View style={styles.heroBody}>
            <View style={styles.headerRow}>
              <View style={styles.brandBlock}>
                <BrandLogo size={40} />
                <View style={styles.wordmark}>
                  <Text style={styles.brandName}>NNACT PRO</Text>
                  <Text style={styles.brandRole}>TECHNICIAN</Text>
                </View>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>FIELD OPS</Text>
              </View>
            </View>

            <View style={styles.spacer} />

            <View style={styles.heroText}>
              <Text style={styles.eyebrow}>STAFF ACCESS</Text>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.subtitle}>
                Use your technician or dispatcher credentials to sync today's route and diagnostic workflows.
              </Text>
            </View>
          </View>
        </View>

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
                  placeholder="you@nnact.com or 6XX XX XX XX"
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
          <PrimaryButton
            colors={colors}
            label={mode === "otp" ? "Sign in with code" : "Sign in"}
            onPress={() => void submit()}
            disabled={submitting}
            loading={submitting}
            variant="accent"
          />
          {onBack ? <BackButton colors={colors} onPress={onBack} variant="surface" /> : null}
        </View>

        <View style={styles.carouselHeading}>
          <Text style={styles.carouselEyebrow}>FIELD WORK</Text>
          <Text style={styles.carouselTitle}>From the field</Text>
        </View>
        <HeroCarousel colors={colors} slides={NNACT_BUEA_SLIDES} />

        <View style={styles.footer}>
          <Text style={styles.footLine}>
            {NNACT_PRODUCT.name} — {NNACT_PRODUCT.subtitle}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthBootScreen({ colors }: { colors: Palette }) {
  return <LoadingScreen colors={colors} message="Loading session…" />;
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    hero: {
      overflow: "hidden",
      borderBottomLeftRadius: radius.xl,
      backgroundColor: colors.brandCharcoal,
    },
    image: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: "100%",
      height: "100%",
    },
    heroBody: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: Platform.select({ ios: 58, android: 42, default: 36 }),
      paddingBottom: spacing.lg,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brandBlock: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    wordmark: { gap: 0 },
    brandName: {
      color: colors.brandWarmWhite,
      fontSize: 17,
      fontFamily: fonts.bold,
      letterSpacing: 0.6,
    },
    brandRole: {
      color: colors.brandOrangeBright,
      fontSize: 10.5,
      fontFamily: fonts.bold,
      letterSpacing: 2.4,
    },
    badge: {
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.36)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
      backgroundColor: "rgba(255,255,255,0.10)",
    },
    badgeText: {
      color: colors.brandWarmWhite,
      fontSize: 10,
      fontFamily: fonts.bold,
      letterSpacing: 1.2,
    },
    spacer: { flex: 1 },
    heroText: { marginTop: spacing.md },
    eyebrow: {
      color: colors.brandOrangeBright,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 1.6,
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.brandWarmWhite,
      fontSize: 30,
      fontFamily: fonts.extraBold,
      lineHeight: 34,
      letterSpacing: -0.6,
    },
    subtitle: {
      color: "rgba(250, 245, 238, 0.9)",
      fontSize: 14,
      fontFamily: fonts.regular,
      lineHeight: 21,
      marginTop: spacing.sm,
    },
    form: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.md },
    modeRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    modeTab: {
      flex: 1,
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: "center",
    },
    modeTabActive: {
      borderColor: colors.accent,
      backgroundColor: "transparent",
    },
    modeTabText: {
      color: colors.dimForeground,
      fontSize: 13,
      fontFamily: fonts.semibold,
    },
    modeTabTextActive: {
      color: colors.accent,
    },
    codeRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
    },
    codeField: { flex: 1 },
    sendCodeButton: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: 2,
    },
    sendCodeText: {
      fontSize: 13,
      fontFamily: fonts.semibold,
    },
    devHint: {
      fontSize: 12,
      fontFamily: fonts.regular,
      marginTop: 4,
    },
    formError: { fontSize: 13, marginTop: 4, fontFamily: fonts.regular },
    carouselHeading: {
      marginTop: spacing.xl,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    carouselEyebrow: {
      color: colors.brandOrange,
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