import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { fonts, spacing, type Palette } from "../theme";

export function DateField({
  colors,
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder,
}: {
  colors: Palette;
  label: string;
  value?: Date | null;
  onChange: (next: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
}) {
  const styles = createStyles(colors);
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.field} onPress={() => setShow(true)} activeOpacity={0.8}>
        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
        <Text style={[styles.fieldValue, { color: value ? colors.foreground : colors.dimForeground }]}>
          {value
            ? value.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
            : (placeholder ?? "Set date")}
        </Text>
        <Ionicons name="chevron-down" size={15} color={colors.dimForeground} />
      </TouchableOpacity>
      {show ? (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(event: DateTimePickerEvent, date?: Date) => {
            if (Platform.OS === "android") setShow(false);
            if (event.type === "set" && date) onChange(date);
          }}
        />
      ) : null}
    </View>
  );
}

export function TimeField({
  colors,
  label,
  value,
  onChange,
  minuteInterval,
}: {
  colors: Palette;
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  minuteInterval?: number;
}) {
  const styles = createStyles(colors);
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.field} onPress={() => setShow(true)} activeOpacity={0.8}>
        <Ionicons name="time-outline" size={16} color={colors.primary} />
        <Text style={[styles.fieldValue, { color: colors.foreground }]}>
          {value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </Text>
        <Ionicons name="chevron-down" size={15} color={colors.dimForeground} />
      </TouchableOpacity>
      {show ? (
        <DateTimePicker
          value={value}
          mode="time"
          is24Hour
          minuteInterval={minuteInterval}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event: DateTimePickerEvent, date?: Date) => {
            if (Platform.OS === "android") setShow(false);
            if (event.type === "set" && date) onChange(date);
          }}
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    fieldWrap: { gap: 6, marginBottom: spacing.sm },
    fieldLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.semibold },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.md,
    },
    fieldValue: { flex: 1, fontSize: 15, fontFamily: fonts.medium },
  });