import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PASSWORD_MIN_LENGTH } from "@nnact/shared";
import { customerRegister } from "../auth-api";
import type { StoredCustomerSession } from "../auth-storage";
import { Card, PrimaryButton, ScreenHeader } from "../components/ui";
import { fonts, type Palette } from "../theme";

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
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <ScreenHeader
        colors={colors}
        eyebrow="NEW CUSTOMER"
        title="Create account"
        subtitle={`Choose a strong password (at least ${PASSWORD_MIN_LENGTH} characters with letters and numbers).`}
        onBack={onBack}
      />
      <View style={styles.form}>
        <Card colors={colors}>
          <Text style={styles.label}>Full name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.dimForeground} style={styles.input} />
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.dimForeground}
            style={styles.input}
          />
          <Text style={styles.label}>Phone (optional)</Text>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+237 …" placeholderTextColor={colors.dimForeground} style={styles.input} />
          <Text style={styles.label}>Password</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor={colors.dimForeground} style={styles.input} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>
        <PrimaryButton colors={colors} label={submitting ? "Creating account…" : "Create account"} onPress={() => void submit()} disabled={submitting} />
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
