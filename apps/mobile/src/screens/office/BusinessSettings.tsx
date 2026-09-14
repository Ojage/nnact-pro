import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CURRENCY_CATALOG, CURRENCY_CODES, type BusinessSettings, type CurrencyCode, type DepositMode, type EstimateApprovalMode, type InvoiceDueTerm } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import { orgSettings, updateOrgSettings, type OfficeOrgSettings } from "../../office-api";
import { ActionButton, InlineError, OfficeHeader, SectionLabel, Sheet, Tag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

const DEPOSIT_MODES: { value: DepositMode; label: string }[] = [
  { value: "none", label: "No deposit" },
  { value: "fixed", label: "Fixed amount" },
  { value: "percent", label: "Percent" },
];

const APPROVAL_MODES: { value: EstimateApprovalMode; label: string }[] = [
  { value: "single_option", label: "Single option" },
  { value: "multiple_options", label: "Multiple options" },
];

const DUE_TERMS: { value: InvoiceDueTerm; label: string }[] = [
  { value: "on_receipt", label: "On receipt" },
  { value: "work_start", label: "On work start" },
  { value: "work_completion", label: "On completion" },
  { value: "net_days", label: "Net days" },
];

type Editor = "company" | "currency" | "estimate" | "invoice" | "numbering" | null;

export function BusinessSettingsScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [settings, setSettings] = useState<OfficeOrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [newArea, setNewArea] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        setSettings(await orgSettings(session));
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

  const business = useMemo(() => (settings?.businessSettings ?? {}) as unknown as BusinessSettings | undefined, [settings]);

  async function saveOrg(patch: Parameters<typeof updateOrgSettings>[1]) {
    try {
      const updated = await updateOrgSettings(session, patch);
      setSettings(updated);
      setError(null);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  }

  async function saveBusinessSettings(next: Partial<BusinessSettings>) {
    if (!business) return false;
    return (await saveOrg({ businessSettings: { ...business, ...next } as Record<string, unknown> })) ?? false;
  }

  async function addArea() {
    const area = newArea.trim();
    if (!area) return;
    const ok = await saveBusinessSettings({ serviceAreas: [...business!.serviceAreas.filter((a) => a.toLowerCase() !== area.toLowerCase()), area] });
    if (ok) setNewArea("");
  }

  async function removeArea(area: string) {
    await saveBusinessSettings({ serviceAreas: business!.serviceAreas.filter((a) => a !== area) });
  }

  const companyFields = settings
    ? [
        { label: "Business name", value: settings.name, icon: "business-outline" as const },
        { label: "Public email", value: settings.publicEmail, icon: "mail-outline" as const },
        { label: "Public phone", value: settings.publicPhone, icon: "call-outline" as const },
        { label: "Public address", value: settings.publicAddress, icon: "location-outline" as const },
      ]
    : [];

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
        eyebrow="Owner · Settings"
        title="Business settings"
        subtitle="Company profile, currency, document defaults and service areas. Changes apply to new estimates and invoices."
        onBack={nav.pop}
      />

      <InlineError colors={colors} message={error} />

      {loading ? (
        <Text style={styles.mutedNote}>Loading settings…</Text>
      ) : !settings ? (
        <Text style={styles.mutedNote}>Couldn't load settings.</Text>
      ) : (
        <>
          <SectionLabel colors={colors}>Company</SectionLabel>
          <View style={styles.editCard}>
            {companyFields.map((field, index) => (
              <View key={field.label} style={[styles.editRow, index > 0 && styles.editRowBorder]}>
                <View style={styles.editRowIcon}>
                  <Ionicons name={field.icon} size={16} color={colors.primary} />
                </View>
                <View style={styles.editRowBody}>
                  <Text style={styles.editRowLabel}>{field.label}</Text>
                  <Text style={styles.editRowValue}>{field.value || "Not set"}</Text>
                </View>
                <TouchableOpacity onPress={() => setEditor("company")} hitSlop={8}>
                  <Ionicons name="create-outline" size={17} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <SectionLabel colors={colors}>Money & documents</SectionLabel>
          <View style={styles.editCard}>
            <EditRow
              colors={colors}
              label="Currency"
              value={business ? `${CURRENCY_CATALOG[business.currency].symbol} · ${business.currency}` : ""}
              onEdit={() => setEditor("currency")}
            />
            <EditRow
              colors={colors}
              label="Quote defaults"
              value={business ? `${humanize(business.estimate.approvalMode)} · ${depositLabel(business.estimate.depositMode, business.estimate.depositValue)}` : ""}
              onEdit={() => setEditor("estimate")}
            />
            <EditRow
              colors={colors}
              label="Invoice defaults"
              value={business ? dueTermLabel(business.invoice.dueTerm, business.invoice.netDays) : ""}
              onEdit={() => setEditor("invoice")}
            />
            <EditRow
              colors={colors}
              label="Numbering"
              value={business ? `Invoice ${business.numbering.invoicePrefix} · Quote ${business.numbering.estimatePrefix}` : ""}
              onEdit={() => setEditor("numbering")}
            />
          </View>

          <SectionLabel colors={colors}>Service areas</SectionLabel>
          {business && business.serviceAreas.length > 0 ? (
            <View style={styles.areaWrap}>
              {business.serviceAreas.map((area) => (
                <TouchableOpacity key={area} style={[styles.areaChip, { backgroundColor: colors.primaryAlpha }]} activeOpacity={0.8} onPress={() => void removeArea(area)}>
                  <Text style={[styles.areaChipText, { color: colors.primary }]}>{area}</Text>
                  <Ionicons name="close" size={14} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.mutedNote}>No service areas configured yet.</Text>
          )}
          <View style={styles.areaAdd}>
            <TextInput
              value={newArea}
              onChangeText={setNewArea}
              placeholder="e.g. Douala 1er, Yaoundé centre"
              placeholderTextColor={colors.dimForeground}
              style={[styles.input, { flex: 1, color: colors.foreground }]}
            />
            <TouchableOpacity
              style={[styles.areaAddBtn, { backgroundColor: colors.primary }, !newArea.trim() && { opacity: 0.45 }]}
              onPress={() => void addArea()}
              disabled={!newArea.trim()}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color={colors.onEmphasis} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {settings ? (
        <>
          {editor === "company" ? (
            <CompanySheet colors={colors} settings={settings} onClose={() => setEditor(null)} onSave={saveOrg} />
          ) : null}
          {editor === "currency" && business ? (
            <CurrencySheet colors={colors} business={business} onClose={() => setEditor(null)} onSave={saveBusinessSettings} />
          ) : null}
          {editor === "estimate" && business ? (
            <EstimateDefaultsSheet colors={colors} business={business} onClose={() => setEditor(null)} onSave={saveBusinessSettings} />
          ) : null}
          {editor === "invoice" && business ? (
            <InvoiceDefaultsSheet colors={colors} business={business} onClose={() => setEditor(null)} onSave={saveBusinessSettings} />
          ) : null}
          {editor === "numbering" && business ? (
            <NumberingSheet colors={colors} business={business} onClose={() => setEditor(null)} onSave={saveBusinessSettings} />
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function EditRow({
  colors,
  label,
  value,
  onEdit,
}: {
  colors: Palette;
  label: string;
  value: string;
  onEdit: () => void;
}) {
  const styles = createStyles(colors);
  return (
    <View style={[styles.editRow]}>
      <View style={styles.editRowIcon}>
        <Ionicons name="settings-outline" size={16} color={colors.primary} />
      </View>
      <View style={styles.editRowBody}>
        <Text style={styles.editRowLabel}>{label}</Text>
        <Text style={styles.editRowValue}>{value || "Not set"}</Text>
      </View>
      <TouchableOpacity onPress={onEdit} hitSlop={8}>
        <Ionicons name="create-outline" size={17} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

function CompanySheet({
  colors,
  settings,
  onClose,
  onSave,
}: {
  colors: Palette;
  settings: OfficeOrgSettings;
  onClose: () => void;
  onSave: (patch: Parameters<typeof updateOrgSettings>[1]) => Promise<boolean>;
}) {
  const styles = createStyles(colors);
  const [name, setName] = useState(settings.name);
  const [publicEmail, setPublicEmail] = useState(settings.publicEmail ?? "");
  const [publicPhone, setPublicPhone] = useState(settings.publicPhone ?? "");
  const [publicAddress, setPublicAddress] = useState(settings.publicAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== settings.name || publicEmail.trim() !== (settings.publicEmail ?? "") || publicPhone.trim() !== (settings.publicPhone ?? "") || publicAddress.trim() !== (settings.publicAddress ?? "");

  async function submit() {
    if (!name.trim()) {
      setError("Business name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSave({
      name: name.trim(),
      publicEmail: publicEmail.trim() || null,
      publicPhone: publicPhone.trim() || null,
      publicAddress: publicAddress.trim() || null,
    });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet colors={colors} visible title="Company" onClose={onClose}>
      <Text style={styles.fieldLabel}>Business name</Text>
      <TextInput
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(null);
        }}
        placeholder="Your business name"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>Public email</Text>
      <TextInput
        value={publicEmail}
        onChangeText={setPublicEmail}
        placeholder="contact@yourbusiness.com"
        placeholderTextColor={colors.dimForeground}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>Public phone</Text>
      <TextInput
        value={publicPhone}
        onChangeText={setPublicPhone}
        placeholder="+237 6XX XXX XXX"
        placeholderTextColor={colors.dimForeground}
        keyboardType="phone-pad"
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>Public address</Text>
      <TextInput
        value={publicAddress}
        onChangeText={setPublicAddress}
        placeholder="Akwa, Douala"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, { color: colors.foreground }]}
      />
      <InlineError colors={colors} message={error} />
      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onClose} activeOpacity={0.8} disabled={busy}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, (busy || !dirty) && { opacity: 0.45 }]}
          disabled={busy || !dirty}
          onPress={() => void submit()}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>{busy ? "Saving…" : "Save company"}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

function CurrencySheet({
  colors,
  business,
  onClose,
  onSave,
}: {
  colors: Palette;
  business: BusinessSettings;
  onClose: () => void;
  onSave: (next: Partial<BusinessSettings>) => Promise<boolean>;
}) {
  const styles = createStyles(colors);
  const [currency, setCurrency] = useState<CurrencyCode>(business.currency);
  const [busy, setBusy] = useState(false);
  const dirty = currency !== business.currency;

  async function submit() {
    setBusy(true);
    const ok = await onSave({ currency });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet colors={colors} visible title="Currency" onClose={onClose}>
      <Text style={styles.fieldLabel}>Billing currency</Text>
      <View style={styles.currencyRow}>
        {CURRENCY_CODES.map((code) => {
          const active = currency === code;
          return (
            <TouchableOpacity
              key={code}
              style={[styles.currencyChip, active && { backgroundColor: colors.primaryAlpha, borderColor: colors.primary }]}
              onPress={() => setCurrency(code)}
              activeOpacity={0.8}
            >
              <Text style={[styles.currencyCode, active && { color: colors.primary }]}>{code}</Text>
              <Text style={styles.currencyName}>{CURRENCY_CATALOG[code].name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onClose} activeOpacity={0.8} disabled={busy}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, (busy || !dirty) && { opacity: 0.45 }]}
          disabled={busy || !dirty}
          onPress={() => void submit()}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>{busy ? "Saving…" : "Set currency"}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

function EstimateDefaultsSheet({
  colors,
  business,
  onClose,
  onSave,
}: {
  colors: Palette;
  business: BusinessSettings;
  onClose: () => void;
  onSave: (next: Partial<BusinessSettings>) => Promise<boolean>;
}) {
  const styles = createStyles(colors);
  const [approvalMode, setApprovalMode] = useState<EstimateApprovalMode>(business.estimate.approvalMode);
  const [depositMode, setDepositMode] = useState<DepositMode>(business.estimate.depositMode);
  const [depositValue, setDepositValue] = useState(String(business.estimate.depositValue));
  const [expirationDays, setExpirationDays] = useState(String(business.estimate.expirationDays));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    approvalMode !== business.estimate.approvalMode ||
    depositMode !== business.estimate.depositMode ||
    Number(depositValue) !== business.estimate.depositValue ||
    Number(expirationDays) !== business.estimate.expirationDays;

  async function submit() {
    const deposit = Number(depositValue);
    const expiry = Number(expirationDays);
    if (!Number.isFinite(deposit) || deposit < 0) {
      setError("Deposit must be a positive number.");
      return;
    }
    if (!Number.isInteger(expiry) || expiry < 0 || expiry > 365) {
      setError("Expiration must be between 0 and 365 days.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSave({
      estimate: {
        ...business.estimate,
        approvalMode,
        depositMode,
        depositValue: Math.round(deposit),
        expirationDays: expiry,
      },
    });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet colors={colors} visible title="Quote defaults" onClose={onClose}>
      <Text style={styles.fieldLabel}>Approval mode</Text>
      <View style={styles.optionRow}>
        {APPROVAL_MODES.map((option) => {
          const active = approvalMode === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionChip, active && { backgroundColor: colors.primaryAlpha, borderColor: colors.primary }]}
              onPress={() => setApprovalMode(option.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.optionChipText, active && { color: colors.primary }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>Deposit mode</Text>
      <View style={styles.optionRow}>
        {DEPOSIT_MODES.map((option) => {
          const active = depositMode === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionChip, active && { backgroundColor: colors.primaryAlpha, borderColor: colors.primary }]}
              onPress={() => {
                setDepositMode(option.value);
                setDepositValue(option.value === "percent" ? "20" : "0");
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.optionChipText, active && { color: colors.primary }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {depositMode !== "none" ? (
        <>
          <Text style={styles.fieldLabel}>{depositMode === "fixed" ? "Deposit amount (cents)" : "Deposit percent"}</Text>
          <TextInput
            value={depositValue}
            onChangeText={(v) => {
              setDepositValue(v);
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder={depositMode === "fixed" ? "e.g. 50000" : "e.g. 20"}
            placeholderTextColor={colors.dimForeground}
            style={[styles.input, { color: colors.foreground }]}
          />
        </>
      ) : null}
      <Text style={styles.fieldLabel}>Valid for (days)</Text>
      <TextInput
        value={expirationDays}
        onChangeText={(v) => {
          setExpirationDays(v);
          setError(null);
        }}
        keyboardType="number-pad"
        placeholder="30"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, { color: colors.foreground }]}
      />
      <InlineError colors={colors} message={error} />
      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onClose} activeOpacity={0.8} disabled={busy}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, (busy || !dirty) && { opacity: 0.45 }]}
          disabled={busy || !dirty}
          onPress={() => void submit()}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>{busy ? "Saving…" : "Save quote defaults"}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

function InvoiceDefaultsSheet({
  colors,
  business,
  onClose,
  onSave,
}: {
  colors: Palette;
  business: BusinessSettings;
  onClose: () => void;
  onSave: (next: Partial<BusinessSettings>) => Promise<boolean>;
}) {
  const styles = createStyles(colors);
  const [dueTerm, setDueTerm] = useState<InvoiceDueTerm>(business.invoice.dueTerm);
  const [netDays, setNetDays] = useState(String(business.invoice.netDays));
  const [defaultMessage, setDefaultMessage] = useState(business.invoice.defaultMessage);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    dueTerm !== business.invoice.dueTerm ||
    Number(netDays) !== business.invoice.netDays ||
    defaultMessage !== business.invoice.defaultMessage;

  async function submit() {
    const days = Number(netDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      setError("Net days must be between 0 and 365.");
      return;
    }
    if (!defaultMessage.trim()) {
      setError("A default message is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSave({
      invoice: {
        ...business.invoice,
        dueTerm,
        netDays: days,
        defaultMessage: defaultMessage.trim(),
      },
    });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet colors={colors} visible title="Invoice defaults" onClose={onClose}>
      <Text style={styles.fieldLabel}>Payment due</Text>
      <View style={styles.optionRow}>
        {DUE_TERMS.map((option) => {
          const active = dueTerm === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionChip, active && { backgroundColor: colors.primaryAlpha, borderColor: colors.primary }]}
              onPress={() => setDueTerm(option.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.optionChipText, active && { color: colors.primary }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {dueTerm === "net_days" ? (
        <>
          <Text style={styles.fieldLabel}>Net days</Text>
          <TextInput
            value={netDays}
            onChangeText={(v) => {
              setNetDays(v);
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder="14"
            placeholderTextColor={colors.dimForeground}
            style={[styles.input, { color: colors.foreground }]}
          />
        </>
      ) : null}
      <Text style={styles.fieldLabel}>Default message</Text>
      <TextInput
        value={defaultMessage}
        onChangeText={(v) => {
          setDefaultMessage(v);
          setError(null);
        }}
        multiline
        placeholder="Thank you for your business…"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, styles.multiline, { color: colors.foreground }]}
      />
      <InlineError colors={colors} message={error} />
      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onClose} activeOpacity={0.8} disabled={busy}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, (busy || !dirty) && { opacity: 0.45 }]}
          disabled={busy || !dirty}
          onPress={() => void submit()}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>{busy ? "Saving…" : "Save invoice defaults"}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

function NumberingSheet({
  colors,
  business,
  onClose,
  onSave,
}: {
  colors: Palette;
  business: BusinessSettings;
  onClose: () => void;
  onSave: (next: Partial<BusinessSettings>) => Promise<boolean>;
}) {
  const styles = createStyles(colors);
  const [invoicePrefix, setInvoicePrefix] = useState(business.numbering.invoicePrefix);
  const [estimatePrefix, setEstimatePrefix] = useState(business.numbering.estimatePrefix);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = invoicePrefix !== business.numbering.invoicePrefix || estimatePrefix !== business.numbering.estimatePrefix;

  async function submit() {
    const clean = (value: string) => value.trim().toUpperCase().replace(/[^A-Za-z0-9-]/g, "");
    const nextInvoice = clean(invoicePrefix);
    const nextEstimate = clean(estimatePrefix);
    if (!nextInvoice || !nextEstimate) {
      setError("Prefixes can only use letters, digits and dashes.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSave({
      numbering: { ...business.numbering, invoicePrefix: nextInvoice, estimatePrefix: nextEstimate },
    });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet colors={colors} visible title="Numbering" onClose={onClose}>
      <Text style={styles.fieldLabel}>Invoice prefix</Text>
      <TextInput
        value={invoicePrefix}
        onChangeText={(v) => {
          setInvoicePrefix(v);
          setError(null);
        }}
        autoCapitalize="characters"
        placeholder="INV"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>Estimate prefix</Text>
      <TextInput
        value={estimatePrefix}
        onChangeText={(v) => {
          setEstimatePrefix(v);
          setError(null);
        }}
        autoCapitalize="characters"
        placeholder="EST"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.hintText}>Numbers keep counting from their current value. Changing a prefix doesn't restart numbering.</Text>
      <InlineError colors={colors} message={error} />
      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onClose} activeOpacity={0.8} disabled={busy}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, (busy || !dirty) && { opacity: 0.45 }]}
          disabled={busy || !dirty}
          onPress={() => void submit()}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>{busy ? "Saving…" : "Save numbering"}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function depositLabel(mode: DepositMode, value: number): string {
  if (mode === "none") return "No deposit";
  if (mode === "percent") return `${value}% deposit`;
  return `${value} cents deposit`;
}

function dueTermLabel(term: InvoiceDueTerm, netDays: number): string {
  const label = DUE_TERMS.find((t) => t.value === term)?.label ?? term;
  return term === "net_days" ? `${label} · ${netDays}d` : label;
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    editCard: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.card,
      overflow: "hidden",
    },
    editRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm },
    editRowBorder: { borderTopWidth: 1, borderTopColor: colors.borderLight },
    editRowIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primaryMuted,
    },
    editRowBody: { flex: 1, minWidth: 0 },
    editRowLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.semibold, textTransform: "uppercase", letterSpacing: 0.4 },
    editRowValue: { color: colors.foreground, fontSize: 14, fontFamily: fonts.medium, marginTop: 2 },
    areaWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    areaChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    areaChipText: { fontSize: 12.5, fontFamily: fonts.semibold },
    areaAdd: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
    areaAddBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
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
    multiline: { minHeight: 88, textAlignVertical: "top" },
    hintText: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.regular, marginTop: spacing.sm, lineHeight: 17 },
    optionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    optionChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    optionChipText: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.semibold },
    currencyRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    currencyChip: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 9,
      minWidth: 86,
    },
    currencyCode: { color: colors.foreground, fontSize: 13, fontFamily: fonts.bold },
    currencyName: { color: colors.dimForeground, fontSize: 10.5, fontFamily: fonts.regular, marginTop: 1 },
    sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    sheetActionBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12 },
    sheetActionText: { fontSize: 14, fontFamily: fonts.bold },
  });