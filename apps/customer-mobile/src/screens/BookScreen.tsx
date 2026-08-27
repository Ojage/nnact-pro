import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { PublicBookingConfigDTO } from "@nnact/shared";
import { customerApi } from "../api";
import { Card, PrimaryButton, ScreenHeader } from "../components/ui";
import { fonts, type Palette } from "../theme";

const DEFAULT_ORG_ID = process.env.EXPO_PUBLIC_DEFAULT_ORG_ID;

export function BookScreen({
  colors,
  onBack,
}: {
  colors: Palette;
  onBack: () => void;
}) {
  const [config, setConfig] = useState<PublicBookingConfigDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [service, setService] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const styles = createStyles(colors);

  useEffect(() => {
    void (async () => {
      try {
        const booking = await customerApi.bookingConfig(DEFAULT_ORG_ID);
        setConfig(booking);
        setCategoryId(booking.serviceCategories[0]?.id ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Booking unavailable");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const services = useMemo(() => {
    if (!config) return [] as string[];
    const category = config.serviceCategories.find((item) => item.id === categoryId);
    return category ? [...category.services] : [];
  }, [config, categoryId]);

  useEffect(() => {
    if (services.length && !services.includes(service)) setService(services[0] ?? "");
  }, [services, service]);

  async function submit() {
    if (!config || !name.trim() || !phone.trim() || !service || !address.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await customerApi.bookService(config.org.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        title: service,
        serviceCategory: config.serviceCategories.find((item) => item.id === categoryId)?.label,
        address: address.trim(),
        description: notes.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Unable to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ScreenHeader colors={colors} eyebrow="REQUEST SENT" title="We received your request" subtitle={`Thanks, ${name}. NNACT will contact you about ${service}.`} onBack={onBack} />
        <View style={styles.form}>
          <PrimaryButton colors={colors} label="Back to home" onPress={onBack} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <ScreenHeader
        colors={colors}
        eyebrow="SERVICE REQUEST"
        title="Book NNACT service"
        subtitle="HVAC, refrigeration, electrical, solar, appliances, and preventive maintenance."
        onBack={onBack}
      />

      <View style={styles.form}>
        {loading ? (
          <Text style={styles.loading}>Loading services…</Text>
        ) : (
          <>
            <Field colors={colors} label="Full name *" value={name} onChangeText={setName} />
            <Field colors={colors} label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field colors={colors} label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Field colors={colors} label="Service address *" value={address} onChangeText={setAddress} multiline />
            {config ? (
              <>
                <Text style={styles.label}>Category *</Text>
                <View style={styles.chips}>
                  {config.serviceCategories.map((category) => (
                    <PrimaryButton
                      key={category.id}
                      colors={colors}
                      label={category.label}
                      variant={categoryId === category.id ? "primary" : "secondary"}
                      onPress={() => setCategoryId(category.id)}
                    />
                  ))}
                </View>
                <Text style={styles.label}>Service *</Text>
                <View style={styles.chips}>
                  {services.map((item) => (
                    <PrimaryButton
                      key={item}
                      colors={colors}
                      label={item}
                      variant={service === item ? "primary" : "secondary"}
                      onPress={() => setService(item)}
                    />
                  ))}
                </View>
              </>
            ) : null}
            <Field colors={colors} label="Notes" value={notes} onChangeText={setNotes} multiline />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton colors={colors} label={submitting ? "Submitting…" : "Submit request"} onPress={() => void submit()} disabled={submitting || !config} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Field({
  colors,
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
}: {
  colors: Palette;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: 58, paddingBottom: 24 },
    form: { paddingHorizontal: 20, gap: 12 },
    loading: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular },
    field: { gap: 6 },
    label: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.bold, textTransform: "uppercase" },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardMuted,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: fonts.regular,
    },
    inputMultiline: { minHeight: 88, textAlignVertical: "top" },
    chips: { gap: 8 },
    error: { color: colors.danger, fontSize: 12, fontFamily: fonts.regular },
  });
