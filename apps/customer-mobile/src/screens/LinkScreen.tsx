import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { parsePortalToken } from "../api";
import { Card, PrimaryButton, ScreenHeader } from "../components/ui";
import { fonts, type Palette } from "../theme";

export function LinkScreen({
  colors,
  onBack,
  onLinked,
}: {
  colors: Palette;
  onBack: () => void;
  onLinked: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const styles = createStyles(colors);

  function submit() {
    const token = parsePortalToken(value);
    if (!token) {
      setError("Paste your full portal link or the token starting with pl_.");
      return;
    }
    setError(null);
    onLinked(token);
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <ScreenHeader
        colors={colors}
        eyebrow="SECURE ACCESS"
        title="Open portal link"
        subtitle="Paste the secure link NNACT emailed you. It opens your balance, estimates, and service history."
        onBack={onBack}
      />

      <View style={styles.form}>
        <Card colors={colors}>
          <Text style={styles.label}>Portal link or token</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="pl_… or https://…/p/pl_…"
            placeholderTextColor={colors.dimForeground}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>
        <PrimaryButton colors={colors} label="Connect portal" onPress={submit} />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: 58, paddingBottom: 24 },
    form: { paddingHorizontal: 20, gap: 12 },
    label: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.bold, marginBottom: 8, textTransform: "uppercase" },
    input: {
      minHeight: 88,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardMuted,
      padding: 12,
      color: colors.foreground,
      fontSize: 13,
      fontFamily: fonts.regular,
      textAlignVertical: "top",
    },
    error: { color: colors.danger, fontSize: 12, marginTop: 10, fontFamily: fonts.regular },
  });
