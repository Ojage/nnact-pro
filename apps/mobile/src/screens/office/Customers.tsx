import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, type CustomerDTO, type JobDTO, type ServiceAgreementDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import {
  createCustomer,
  createEquipment,
  listCustomers,
  listEquipment,
  listJobs,
  listServiceAgreements,
  type OfficeEquipment,
} from "../../office-api";
import { NewJobSheet } from "./Jobs";
import { ActionButton, InlineError, OfficeHeader, Row, SectionLabel, Sheet, StatusTag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

export function CustomersScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void; push: (route: { name: "customer"; customerId: string }) => void };
}) {
  const styles = createStyles(colors);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        setCustomers(await listCustomers(session));
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q) || (c.email ?? "").toLowerCase().includes(q),
    );
  }, [customers, query]);

  async function addCustomer(body: { name: string; email?: string; phone?: string }) {
    try {
      const created = await createCustomer(session, body);
      setShowNew(false);
      setError(null);
      setCustomers((rows) => [created, ...rows]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

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
        eyebrow="Customers"
        title="Customers"
        subtitle="Browse the customer directory and register new accounts."
        onBack={nav.pop}
      />

      <InlineError colors={colors} message={error} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.dimForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, phone or email"
          placeholderTextColor={colors.dimForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
      </View>

      <TouchableOpacity style={styles.newBtn} activeOpacity={0.85} onPress={() => setShowNew(true)}>
        <Ionicons name="add-circle" size={17} color={colors.primary} />
        <Text style={[styles.newBtnText, { color: colors.primary }]}>New customer</Text>
      </TouchableOpacity>

      <SectionLabel colors={colors}>{filtered.length} customer{filtered.length === 1 ? "" : "s"}</SectionLabel>
      {loading ? (
        <Text style={styles.mutedNote}>Loading customers…</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.mutedNote}>No customers match.</Text>
      ) : (
        filtered.map((customer) => (
          <Row
            key={customer.id}
            colors={colors}
            icon="people-outline"
            title={customer.name}
            subtitle={[customer.phone, customer.email].filter(Boolean).join(" · ")}
            onPress={() => nav.push({ name: "customer", customerId: customer.id })}
          />
        ))
      )}

      {showNew ? (
        <NewCustomerSheet colors={colors} onCancel={() => setShowNew(false)} onSubmit={addCustomer} />
      ) : null}
    </ScrollView>
  );
}

function NewCustomerSheet({
  colors,
  onCancel,
  onSubmit,
}: {
  colors: Palette;
  onCancel: () => void;
  onSubmit: (body: { name: string; email?: string; phone?: string }) => void;
}) {
  const styles = createStyles(colors);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const validating = useMemo(() => name.trim().length > 0, [name]);
  return (
    <Sheet colors={colors} visible title="New customer" onClose={onCancel}>
      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(null);
        }}
        placeholder="e.g. AfriCare Clinic"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="billing@customer.com"
        placeholderTextColor={colors.dimForeground}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>Phone</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="+237 6XX XXX XXX"
        placeholderTextColor={colors.dimForeground}
        keyboardType="phone-pad"
        style={[styles.input, { color: colors.foreground }]}
      />
      <InlineError colors={colors} message={error} />
      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onCancel} activeOpacity={0.8}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, !validating && { opacity: 0.45 }]}
          disabled={!validating}
          onPress={() => {
            if (!validating) {
              setError("Name is required.");
              return;
            }
            onSubmit({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined });
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>Create customer</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

export function CustomerDetailScreen({
  colors,
  session,
  customerId,
  nav,
  onOpenJob,
}: {
  colors: Palette;
  session: StoredStaffSession;
  customerId: string;
  nav: { pop: () => void };
  onOpenJob: (jobId: string) => void;
}) {
  const styles = createStyles(colors);
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [equipment, setEquipment] = useState<OfficeEquipment[]>([]);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [agreements, setAgreements] = useState<ServiceAgreementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showJob, setShowJob] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [customerRows, units, jobRows, agreementRows] = await Promise.all([
          listCustomers(session),
          listEquipment(session, customerId),
          listJobs(session),
          listServiceAgreements(session),
        ]);
        if (!alive) return;
        setCustomers(customerRows);
        setCustomer(customerRows.find((c) => c.id === customerId) ?? null);
        setEquipment(units);
        setJobs(jobRows.filter((j) => j.customerId === customerId));
        setAgreements(agreementRows.filter((a) => a.customerId === customerId));
        setError(null);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session, customerId]);

  async function addUnit(body: { type: string; make?: string; model?: string; serialNumber?: string }) {
    try {
      const created = await createEquipment(session, { customerId, ...body });
      setShowAdd(false);
      setError(null);
      setEquipment((rows) => [created, ...rows]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <OfficeHeader
        colors={colors}
        eyebrow="Customer"
        title={customer?.name ?? "Customer"}
        subtitle={[customer?.phone, customer?.email].filter(Boolean).join(" · ") || undefined}
        onBack={nav.pop}
      />
      <InlineError colors={colors} message={error} />

      {loading ? (
        <Text style={styles.mutedNote}>Loading…</Text>
      ) : (
        <>
          <View style={styles.actionRow}>
            <ActionButton colors={colors} label="New job" icon="briefcase-outline" tone="primary" style={styles.actionRowBtn} onPress={() => setShowJob(true)} />
            <ActionButton colors={colors} label="Add equipment" icon="hardware-chip-outline" tone="default" style={styles.actionRowBtn} onPress={() => setShowAdd(true)} />
          </View>

          <SectionLabel colors={colors}>{jobs.length} job{jobs.length === 1 ? "" : "s"}</SectionLabel>
          {jobs.length === 0 ? (
            <Text style={styles.mutedNote}>No jobs for this customer yet.</Text>
          ) : (
            jobs
              .slice(0, 8)
              .map((job) => (
                <Row
                  key={job.id}
                  colors={colors}
                  icon="briefcase-outline"
                  title={job.title}
                  subtitle={`${formatMoney(job.total)}${job.scheduledAt ? ` · ${new Date(job.scheduledAt).toLocaleDateString()}` : ""}`}
                  right={<StatusTag colors={colors} status={job.status} />}
                  onPress={() => onOpenJob(job.id)}
                />
              ))
          )}

          <SectionLabel colors={colors}>{agreements.length} agreement{agreements.length === 1 ? "" : "s"}</SectionLabel>
          {agreements.length === 0 ? (
            <Text style={styles.mutedNote}>No service agreements for this customer.</Text>
          ) : (
            agreements.map((agreement) => (
              <Row
                key={agreement.id}
                colors={colors}
                icon="document-text-outline"
                title={agreement.planName}
                subtitle={[agreement.agreementNumber, formatMoney(agreement.priceCents)].filter(Boolean).join(" · ")}
                right={<StatusTag colors={colors} status={agreement.status} />}
              />
            ))
          )}

          <SectionLabel colors={colors}>{equipment.length} unit{equipment.length === 1 ? "" : "s"} on site</SectionLabel>
          {equipment.length === 0 ? (
            <Text style={styles.mutedNote}>No equipment registered yet.</Text>
          ) : (
            equipment.map((unit) => (
              <Row
                key={unit.id}
                colors={colors}
                icon="hardware-chip-outline"
                title={[unit.type, unit.make, unit.model].filter(Boolean).join(" ")}
                subtitle={[
                  unit.serialNumber ? `Serial ${unit.serialNumber}` : null,
                  unit.warrantyExpiry ? `Warranty to ${new Date(unit.warrantyExpiry).toLocaleDateString()}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))
          )}
        </>
      )}

      {showAdd ? (
        <AddEquipmentSheet
          colors={colors}
          onCancel={() => setShowAdd(false)}
          onSubmit={(body) => void addUnit(body)}
        />
      ) : null}

      {showJob ? (
        <NewJobSheet
          colors={colors}
          session={session}
          customers={customers}
          presetCustomer={customer ?? undefined}
          onCancel={() => setShowJob(false)}
          onDone={() => {
            setShowJob(false);
            void listJobs(session).then((rows) => setJobs(rows.filter((j) => j.customerId === customerId))).catch(() => undefined);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function AddEquipmentSheet({
  colors,
  onCancel,
  onSubmit,
}: {
  colors: Palette;
  onCancel: () => void;
  onSubmit: (body: { type: string; make?: string; model?: string; serialNumber?: string }) => void;
}) {
  const styles = createStyles(colors);
  const [type, setType] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const valid = type.trim().length > 0;
  return (
    <Sheet colors={colors} visible title="Add equipment" onClose={onCancel}>
      <Text style={styles.fieldLabel}>Type</Text>
      <TextInput value={type} onChangeText={(v) => { setType(v); setError(null); }} placeholder="e.g. Washing machine" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Make</Text>
      <TextInput value={make} onChangeText={setMake} placeholder="e.g. Indesit" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Model</Text>
      <TextInput value={model} onChangeText={setModel} placeholder="e.g. IWSC 51052" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Serial number</Text>
      <TextInput value={serial} onChangeText={setSerial} placeholder="Serial on the unit label" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <InlineError colors={colors} message={error} />
      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onCancel} activeOpacity={0.8}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, !valid && { opacity: 0.45 }]}
          disabled={!valid}
          onPress={() => {
            if (!valid) {
              setError("Type is required.");
              return;
            }
            onSubmit({
              type: type.trim(),
              make: make.trim() || undefined,
              model: model.trim() || undefined,
              serialNumber: serial.trim() || undefined,
            });
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>Add unit</Text>
        </TouchableOpacity>
      </View>
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
    },
    sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    sheetActionBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12 },
    sheetActionText: { fontSize: 14, fontFamily: fonts.bold },
    actionRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    actionRowBtn: { flex: 1 },
  });