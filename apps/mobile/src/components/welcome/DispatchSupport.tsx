import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NNACT_COMPANY } from "@nnact/shared";
import { fonts, radius, spacing, type Palette } from "../../theme";

const WORKSHOP_PHONE = NNACT_COMPANY.contact.phones[0];

export function DispatchSupport({ colors }: { colors: Palette }) {
  const styles = createStyles(colors);
  const phoneHref = `tel:${WORKSHOP_PHONE.replace(/\s/g, "")}`;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Call the NNACT workshop for dispatch support on ${WORKSHOP_PHONE}.`}
        onPress={() => void Linking.openURL(phoneHref)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="call-outline" size={22} color={colors.brandOrange} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Need dispatch support?</Text>
          <Text style={styles.subtitle}>Routing help or urgent escalation</Text>
          <Text style={styles.phone}>{WORKSHOP_PHONE}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.dimForeground} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    rowPressed: { opacity: 0.75 },
    iconWrap: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: colors.brandOrangeMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    copy: { flex: 1, gap: 1 },
    title: {
      color: colors.foreground,
      fontSize: 15,
      fontFamily: fonts.bold,
      lineHeight: 20,
    },
    subtitle: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontFamily: fonts.regular,
      lineHeight: 18,
    },
    phone: {
      color: colors.dimForeground,
      fontSize: 12,
      fontFamily: fonts.semibold,
      marginTop: 2,
    },
  });