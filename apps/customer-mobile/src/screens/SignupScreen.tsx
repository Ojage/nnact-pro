import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getPasswordStrength, PasswordInput, BackButton } from "@nnact/mobile-ui";
import { NNACT_PRODUCT, PASSWORD_MIN_LENGTH } from "@nnact/shared";
import { customerRegister } from "../auth-api";
import type { StoredCustomerSession } from "../auth-storage";
import { Card, PrimaryButton, TextField } from "../components/ui";
import { ImageHero } from "../components/ImageHero";
import { HeroCarousel } from "../components/HeroCarousel";
import { SERVICE_CAROUSEL_SLIDES } from "../content/home-carousels";
import { formatNetworkError } from "../env";
import { fonts, spacing, type Palette } from "../theme";

const HERO_IMAGE = require("../../assets/photos/nnact-protech-app-hero.png");

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
  const styles = createStyles(colors);

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
      setError(formatNetworkError(err));
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
        <ImageHero
          colors={colors}
          image={HERO_IMAGE}
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