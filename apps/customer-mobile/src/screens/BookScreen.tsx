import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BackButton } from "@nnact/mobile-ui";
import type { PublicBookingConfigDTO, PublicBookingResultDTO } from "@nnact/shared";
import { customerApi } from "../api";
import { getDefaultOrgId } from "../env";
import { Chip, HeroBanner, LoadingScreen, PrimaryButton, TextField } from "../components/ui";
import { fonts, spacing, type Palette } from "../theme";

const DEFAULT_ORG_ID = getDefaultOrgId() || undefined;

export function BookScreen({
  colors,
  onBack,
  initialService,
  initialCategory,
}: {
  colors: Palette;
  onBack: () => void;
  initialService?: string;
  initialCategory?: string;
}) {
  const [config, setConfig] = useState<PublicBookingConfigDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicBookingResultDTO | null>(null);
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [service, setService] = useState(initialService ?? "");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const styles = createStyles(colors);

  useEffect(() => {
    void (async () => {
      try {
        const booking = await customerApi.bookingConfig(DEFAULT_ORG_ID);
        setConfig(booking);
        const matchedCategory = initialCategory
          ? booking.serviceCategories.find((c) => c.label === initialCategory || c.id === initialCategory)
          : booking.serviceCategories[0];
        setCategoryId(matchedCategory?.id ?? booking.serviceCategories[0]?.id ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Booking unavailable");
      } finally {
        setLoading(false);
      }
    })();
  }, [initialCategory]);

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
      const res = await customerApi.bookService(config.org.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        title: service,
        serviceCategory: config.serviceCategories.find((item) => item.id === categoryId)?.label,
        address: address.trim(),
        description: notes.trim() || undefined,
      });
      setResult(res);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Unable to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <View style={styles.topBar}>
          <BackButton colors={colors} onPress={onBack} variant="surface" />
        </View>
        <LoadingScreen colors={colors} message="Loading services…" />
      </View>
    );
  }

  if (done && result) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.topBarInset}>
          <BackButton colors={colors} onPress={onBack} variant="surface" />
        </View>
        <HeroBanner
          colors={colors}
          eyebrow="REQUEST RECEIVED"
          title="We received your request"
          subtitle={`Thanks, ${name}. NNACT will contact you about ${service}.`}
        />
        <View style={styles.form}>
          <View style={styles.confirmationBox}>
            <Text style={styles.confirmationLabel}>Reference number</Text>
            <Text style={styles.confirmationValue} numberOfLines={1}>{result.requestId}</Text>
            {result.trackingUrl && (
              <Text style={styles.trackingUrl} numberOfLines={1}>
                {result.trackingUrl}
              </Text>
            )}
          </View>
          <PrimaryButton colors={colors} label="Back to home" onPress={onBack} variant="accent" />
        </View>
      </ScrollView>
    );
  }

  const steps = ["Service", "Details", "Confirm"];
  const canNext =
    step === 0
      ? Boolean(categoryId && service)
      : step === 1
        ? Boolean(name.trim() && phone.trim() && address.trim())
        : true;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topBarInset}>
        <BackButton colors={colors} onPress={onBack} variant="surface" />
      </View>
      <HeroBanner
        colors={colors}
        eyebrow="BOOK A VISIT"
        title="Request NNACT service"
        subtitle="HVAC, refrigeration, electrical, solar, appliances, and preventive maintenance."
      />

      <View style={styles.stepper}>
        {steps.map((label, i) => (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
              <Text style={[styles.stepNum, i <= step && styles.stepNumActive]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.form}>
        {step === 0 && config ? (
          <>
            <Text style={styles.label}>Category</Text>
            <View style={styles.chips}>
              {config.serviceCategories.map((category) => (
                <Chip
                  key={category.id}
                  colors={colors}
                  label={category.label}
                  selected={categoryId === category.id}
                  onPress={() => setCategoryId(category.id)}
                />
              ))}
            </View>
            <Text style={styles.label}>Service</Text>
            <View style={styles.chips}>
              {services.map((item) => (
                <Chip key={item} colors={colors} label={item} selected={service === item} onPress={() => setService(item)} />
              ))}
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <TextField colors={colors} label="Full name *" value={name} onChangeText={setName} placeholder="Your name" />
            <TextField colors={colors} label="Phone *" value={phone} onChangeText={setPhone} placeholder="+237 …" keyboardType="phone-pad" />
            <TextField
              colors={colors}
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextField colors={colors} label="Service address *" value={address} onChangeText={setAddress} placeholder="Street, area, city" multiline />
            <TextField colors={colors} label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Describe the issue…" multiline />
          </>
        ) : null}

        {step === 2 ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Review your request</Text>
            <SummaryRow colors={colors} label="Service" value={service} />
            <SummaryRow colors={colors} label="Name" value={name} />
            <SummaryRow colors={colors} label="Phone" value={phone} />
            {email ? <SummaryRow colors={colors} label="Email" value={email} /> : null}
            <SummaryRow colors={colors} label="Address" value={address} />
            {notes ? <SummaryRow colors={colors} label="Notes" value={notes} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : null}

        <View style={styles.navRow}>
          {step > 0 ? (
            <View style={styles.navBtn}>
              <PrimaryButton colors={colors} label="Back" onPress={() => setStep((s) => s - 1)} variant="secondary" size="md" />
            </View>
          ) : null}
          <View style={styles.navBtn}>
            {step < 2 ? (
              <PrimaryButton colors={colors} label="Continue" onPress={() => setStep((s) => s + 1)} disabled={!canNext} size="md" />
            ) : (
              <PrimaryButton
                colors={colors}
                label="Submit request"
                onPress={() => void submit()}
                disabled={submitting || !config}
                loading={submitting}
                variant="accent"
                size="md"
              />
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryRow({ colors, label, value }: { colors: Palette; label: string; value: string }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    loadingRoot: { flex: 1, backgroundColor: colors.background },
    topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    topBarInset: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, marginBottom: spacing.sm },
    stepper: { flexDirection: "row", justifyContent: "center", gap: spacing.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg },
    stepItem: { alignItems: "center", gap: 4 },
    stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.borderLight, alignItems: "center", justifyContent: "center" },
    stepDotActive: { backgroundColor: colors.primary },
    stepNum: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.bold },
    stepNumActive: { color: colors.onEmphasis },
    stepLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.medium },
    stepLabelActive: { color: colors.primary, fontFamily: fonts.bold },
    form: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    label: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.semibold, marginBottom: 4 },
    chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md },
    summary: { backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
    summaryTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold, marginBottom: spacing.sm },
    summaryRow: { gap: 2 },
    summaryLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.semibold, textTransform: "uppercase" },
    summaryValue: { color: colors.foreground, fontSize: 14, fontFamily: fonts.regular },
    navRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    navBtn: { flex: 1 },
    error: { color: colors.danger, fontSize: 13, fontFamily: fonts.regular },
    confirmationBox: { backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
    confirmationLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.semibold, textTransform: "uppercase" },
    confirmationValue: { color: colors.foreground, fontSize: 16, fontFamily: fonts.regular },
    trackingUrl: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.regular, marginTop: spacing.xs },
  });
