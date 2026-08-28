import { useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getPasswordStrength, type PasswordStrength } from "./password-strength";

/** Minimal color contract — satisfied by both mobile app palettes. */
export type PasswordInputColors = {
  foreground: string;
  mutedForeground: string;
  dimForeground: string;
  border: string;
  primary: string;
  primaryMuted: string;
  focus: string;
  success: string;
  warning: string;
  danger: string;
  surfaceMuted: string;
  onEmphasis: string;
  borderLight: string;
};

export type PasswordInputProps = {
  colors: PasswordInputColors;
  fonts?: { medium: string; semibold: string; bold: string };
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  /** Login: password. Signup: new-password */
  autoComplete?: "password" | "new-password" | "off";
  /** Show strength meter + requirement checklist (signup flows). */
  showStrength?: boolean;
  disabled?: boolean;
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
  returnKeyType?: TextInputProps["returnKeyType"];
  testID?: string;
};

const STRENGTH_COLORS = (colors: PasswordInputColors, score: PasswordStrength["score"]) => {
  if (score <= 1) return colors.danger;
  if (score === 2) return colors.warning;
  if (score === 3) return colors.primary;
  return colors.success;
};

export function PasswordInput({
  colors,
  fonts,
  label,
  value,
  onChangeText,
  placeholder = "Password",
  error,
  hint,
  autoComplete = "password",
  showStrength = false,
  disabled,
  onSubmitEditing,
  returnKeyType,
  testID,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const styles = useMemo(() => createStyles(colors, fonts), [colors, fonts]);
  const strength = useMemo(() => getPasswordStrength(value), [value]);
  const showMeter = showStrength && (focused || value.length > 0);

  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          error ? styles.inputWrapError : null,
          disabled ? styles.inputWrapDisabled : null,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.dimForeground}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={autoComplete === "new-password" ? "newPassword" : "password"}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          style={styles.input}
          accessibilityLabel={label}
        />
        <TouchableOpacity
          onPress={() => setVisible((current: boolean) => !current)}
          style={styles.toggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          accessibilityState={{ checked: visible }}
          disabled={disabled}
        >
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {showMeter ? (
        <View style={styles.strengthBlock}>
          <View style={styles.strengthHeader}>
            <Text style={styles.strengthLabel}>Password strength</Text>
            <Text style={[styles.strengthValue, { color: STRENGTH_COLORS(colors, strength.score) }]}>
              {strength.label}
            </Text>
          </View>
          <View style={styles.strengthBars} accessibilityRole="progressbar">
            {[1, 2, 3, 4].map((segment) => (
              <View
                key={segment}
                style={[
                  styles.strengthBar,
                  segment <= strength.score
                    ? { backgroundColor: STRENGTH_COLORS(colors, strength.score) }
                    : { backgroundColor: colors.borderLight },
                ]}
              />
            ))}
          </View>
          <View style={styles.requirements}>
            {strength.requirements.map((req: (typeof strength.requirements)[number]) => (
              <View key={req.id} style={styles.requirementRow}>
                <Ionicons
                  name={req.met ? "checkmark-circle" : "ellipse-outline"}
                  size={14}
                  color={req.met ? colors.success : colors.dimForeground}
                />
                <Text style={[styles.requirementText, req.met && styles.requirementMet]}>{req.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const createStyles = (
  colors: PasswordInputColors,
  fonts?: { medium: string; semibold: string; bold: string },
) =>
  StyleSheet.create({
    field: { gap: 6, marginBottom: 12 },
    label: {
      color: colors.mutedForeground,
      fontSize: 12,
      fontFamily: fonts?.semibold,
      fontWeight: fonts ? undefined : "600",
    },
    hint: { color: colors.dimForeground, fontSize: 12, lineHeight: 17, marginBottom: 2 },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      minHeight: 48,
    },
    inputWrapFocused: { borderColor: colors.focus, borderWidth: 2 },
    inputWrapError: { borderColor: colors.danger },
    inputWrapDisabled: { opacity: 0.6 },
    input: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      color: colors.foreground,
      fontSize: 15,
      fontFamily: fonts?.medium,
    },
    toggle: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    strengthBlock: { marginTop: 4, gap: 8 },
    strengthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    strengthLabel: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts?.semibold, fontWeight: fonts ? undefined : "600" },
    strengthValue: { fontSize: 11, fontFamily: fonts?.bold, fontWeight: fonts ? undefined : "700" },
    strengthBars: { flexDirection: "row", gap: 6 },
    strengthBar: { flex: 1, height: 4, borderRadius: 999 },
    requirements: { gap: 6 },
    requirementRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    requirementText: { color: colors.mutedForeground, fontSize: 12, flex: 1, fontFamily: fonts?.medium },
    requirementMet: { color: colors.foreground },
    error: { color: colors.danger, fontSize: 12, marginTop: 2 },
  });
