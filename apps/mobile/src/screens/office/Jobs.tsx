import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, type CustomerDTO, type JobDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import { createAppointment, createJob, listCustomers, listJobs } from "../../office-api";
import { DateField, TimeField } from "../../components/DateTimeFields";
import { ActionButton, InlineError, OfficeHeader, Row, SectionLabel, Sheet, StatusTag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

const DEFAULT_DURATION_MIN = 90;
const STATUS_FILTERS = ["all", "lead", "scheduled", "in_progress", "completed", "canceled"] as const;

export function JobsScreen({
  colors,
  session,
  onOpenJob,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  onOpenJob: (jobId: string) => void;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [rows, customerRows] = await Promise.all([listJobs(session), listCustomers(session)]);
        setJobs(rows);
        setCustomers(customerRows);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const customerName = useCallback(
    (id: string) => customers.find((c) => c.id === id)?.name ?? "Customer",
    [customers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (filter !== "all" && job.status !== filter) return false;
      if (q && !job.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [jobs, filter, query]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: jobs.length };
    for (const key of ["lead", "scheduled", "in_progress", "completed", "canceled"]) {
      out[key] = jobs.filter((j) => j.status === key).length;
    }
    return out;
  }, [jobs]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <OfficeHeader
        colors={colors}
        eyebrow="Jobs"
        title="Job board"
        subtitle="Every work order across the org — create, chase and open full records."
        onBack={nav.pop}
      />

      <InlineError colors={colors} message={error} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.dimForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search job title"
          placeholderTextColor={colors.dimForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {STATUS_FILTERS.map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, filter === key && { backgroundColor: colors.primary }]}
            onPress={() => setFilter(key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, { color: filter === key ? colors.onEmphasis : colors.mutedForeground }]}>
              {key === "all" ? "All" : key.replaceAll("_", " ")} · {counts[key] ?? 0}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.newBtn} activeOpacity={0.85} onPress={() => setShowNew(true)}>
        <Ionicons name="add-circle" size={17} color={colors.primary} />
        <Text style={[styles.newBtnText, { color: colors.primary }]}>New job</Text>
      </TouchableOpacity>

      <SectionLabel colors={colors}>Showing {filtered.length} job{filtered.length === 1 ? "" : "s"}</SectionLabel>
      {loading ? (
        <Text style={styles.mutedNote}>Loading jobs…</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.mutedNote}>No jobs match this filter.</Text>
      ) : (
        filtered.map((job) => (
          <Row
            key={job.id}
            colors={colors}
            icon="briefcase-outline"
            title={job.title}
            subtitle={`${customerName(job.customerId)} · ${formatMoney(job.total)}${job.scheduledAt ? ` · ${fmtWhen(job.scheduledAt)}` : ""}`}
            right={<StatusTag colors={colors} status={job.status} />}
            onPress={() => onOpenJob(job.id)}
          />
        ))
      )}

      {showNew ? (
        <NewJobSheet
          colors={colors}
          session={session}
          customers={customers}
          onCancel={() => setShowNew(false)}
          onDone={() => {
            setShowNew(false);
            void load(true);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso.slice(0, 10)
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function NewJobSheet({
  colors,
  session,
  customers,
  presetCustomer,
  onCancel,
  onDone,
}: {
  colors: Palette;
  session: StoredStaffSession;
  customers: CustomerDTO[];
  presetCustomer?: CustomerDTO;
  onCancel: () => void;
  onDone: () => void;
}) {
  const styles = createStyles(colors);
  const [customerFilter, setCustomerFilter] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(presetCustomer?.id ?? null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customerOptions = useMemo(() => {
    const q = customerFilter.trim().toLowerCase();
    const rows = q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
    return rows.slice(0, 40);
  }, [customers, customerFilter]);

  const valid = customerId !== null && title.trim().length > 0;

  async function submit() {
    if (!valid || !customerId) {
      setError("Choose a customer and add a title.");
      return;
    }
    setBusy(true);
    try {
      const scheduledAt = startAt ? startAt.toISOString() : undefined;
      const job = await createJob(session, {
        customerId,
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt,
      });
      if (startAt) {
        const endsAt = new Date(startAt.getTime() + DEFAULT_DURATION_MIN * 60_000);
        await createAppointment(session, {
          jobId: job.id,
          startsAt: startAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
      }
      setError(null);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet colors={colors} visible title="New job" onClose={onCancel}>
      {presetCustomer ? (
        <>
          <Text style={styles.fieldLabel}>Customer</Text>
          <View style={[styles.customerRow, { borderColor: colors.primary, backgroundColor: colors.primaryAlpha }]}>
            <Ionicons name="checkbox" size={18} color={colors.primary} />
            <Text style={styles.customerName} numberOfLines={1}>{presetCustomer.name}</Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Customer</Text>
          <TextInput
            value={customerFilter}
            onChangeText={setCustomerFilter}
            placeholder="Search customers…"
            placeholderTextColor={colors.dimForeground}
            style={[styles.input, { color: colors.foreground }]}
          />
          {customerOptions.length === 0 ? (
            <Text style={styles.mutedNote}>No customers found.</Text>
          ) : (
            customerOptions.map((customer) => {
              const selected = customer.id === customerId;
              return (
                <TouchableOpacity
                  key={customer.id}
                  style={[styles.customerRow, selected && { borderColor: colors.primary, backgroundColor: colors.primaryAlpha }]}
                  onPress={() => setCustomerId(customer.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={selected ? "checkbox" : "square-outline"} size={18} color={selected ? colors.primary : colors.dimForeground} />
                  <Text style={styles.customerName} numberOfLines={1}>{customer.name}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </>
      )}

      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="e.g. AC no cooling at AfriCare" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />

      <Text style={styles.fieldLabel}>Description</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What did they report?"
        placeholderTextColor={colors.dimForeground}
        multiline
        style={[styles.input, styles.multiline, { color: colors.foreground }]}
      />

      <Text style={styles.fieldLabel}>Start date & time (optional)</Text>
      <View style={styles.scheduleRow}>
        <View style={styles.scheduleField}>
          <DateField colors={colors} label="" value={startAt} onChange={setStartAt} placeholder="Pick date" />
        </View>
        <View style={styles.scheduleField}>
          {startAt ? (
            <View style={styles.timeWrap}>
              <TimeField colors={colors} label="" value={startAt} onChange={setStartAt} />
              <TouchableOpacity onPress={() => setStartAt(null)} hitSlop={8} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={colors.dimForeground} />
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.mutedNote}>No start set — job stays unassigned until dispatch gives it a slot.</Text>
          )}
        </View>
      </View>

      <InlineError colors={colors} message={error} />
      <ActionButton colors={colors} label={busy ? "Creating…" : "Create job"} icon="briefcase-outline" tone="primary" onPress={() => void submit()} />
    </Sheet>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 14,
      paddingHorizontal: spacing.sm,
    },
    searchInput: { flex: 1, paddingVertical: 11, fontFamily: fonts.regular, fontSize: 15 },
    chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.sm },
    chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface },
    chipText: { fontSize: 12, fontFamily: fonts.bold },
    newBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.primaryAlpha,
      borderRadius: 12,
      paddingVertical: 11,
    },
    newBtnText: { fontSize: 14, fontFamily: fonts.bold },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    fieldLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.semibold, marginTop: spacing.sm, marginBottom: 6 },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      fontFamily: fonts.regular,
      fontSize: 15,
      marginBottom: spacing.sm,
    },
    multiline: { minHeight: 64, textAlignVertical: "top" },
    customerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
      marginBottom: spacing.xs,
    },
    customerName: { flex: 1, color: colors.foreground, fontSize: 14, fontFamily: fonts.medium },
    scheduleRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
    scheduleField: { flex: 1 },
    timeWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    clearBtn: { marginLeft: "auto", padding: 4 },
  });