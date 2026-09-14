import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, type JobDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import { DateField } from "../../components/DateTimeFields";
import {
  acceptEstimate,
  approveEstimateOption,
  copyApprovedEstimateToJob,
  createEstimate,
  createEstimateInvoice,
  createInvoice,
  declineEstimate,
  getEstimate,
  getInvoice,
  listEstimates,
  listInvoices,
  markEstimateSent,
  patchInvoiceStatus,
  recordInvoicePayment,
  type OfficeEstimate,
  type OfficeEstimateDetail,
  type OfficeInvoice,
  type OfficeInvoiceDetail,
} from "../../office-api";
import { ActionButton, InlineError, OfficeHeader, Row, SectionLabel, Sheet, StatusTag, Tag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

function isApprover(role?: string): boolean {
  return role === "owner" || role === "dispatcher";
}

function pill(raw: number): number {
  return Math.round(raw);
}

export function BillingScreen({
  colors,
  session,
  jobs,
  nav,
  onRefresh,
}: {
  colors: Palette;
  session: StoredStaffSession;
  jobs: JobDTO[];
  nav: {
    pop: () => void;
    push: (route: { name: "estimate"; estimateId: string } | { name: "invoice"; invoiceId: string }) => void;
  };
  onRefresh: () => void;
}) {
  const styles = createStyles(colors);
  const [tab, setTab] = useState<"estimates" | "invoices">("estimates");
  const [estimates, setEstimates] = useState<OfficeEstimate[]>([]);
  const [invoices, setInvoices] = useState<OfficeInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createForJob, setCreateForJob] = useState<"estimate" | "invoice" | null>(null);
  const [invoiceDue, setInvoiceDue] = useState<Date | null>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [e, inv] = await Promise.all([listEstimates(session), listInvoices(session)]);
        setEstimates(e);
        setInvoices(inv);
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

  const openableJobs = useMemo(
    () => jobs.filter((j) => !["completed", "canceled"].includes(j.status)),
    [jobs],
  );

  async function create(kind: "estimate" | "invoice", jobId: string) {
    try {
      if (kind === "estimate") {
        await createEstimate(session, jobId);
      } else {
        await createInvoice(session, { jobId, dueAt: invoiceDue ? invoiceDue.toISOString() : undefined });
      }
      setCreateForJob(null);
      setError(null);
      onRefresh();
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const estimateOpenValue = useMemo(
    () => estimates.filter((e) => ["draft", "sent", "approved"].includes(e.status)).reduce((sum, e) => sum + e.total, 0),
    [estimates],
  );
  const invoiceOutstanding = useMemo(() => invoices.filter((i) => i.status?.toLowerCase() !== "void").reduce((sum, i) => sum + i.total, 0), [invoices]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />
      }
    >
      <OfficeHeader
        colors={colors}
        eyebrow="Billing"
        title="Estimates & invoices"
        subtitle="Draft, send, approve and collect against customer quotes and bills."
        onBack={nav.pop}
      />

      <InlineError colors={colors} message={error} />

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "estimates" && { backgroundColor: colors.primary }]} onPress={() => setTab("estimates")} activeOpacity={0.8}>
          <Text style={[styles.tabText, { color: tab === "estimates" ? colors.onEmphasis : colors.mutedForeground }]}>Estimates · {estimates.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "invoices" && { backgroundColor: colors.primary }]} onPress={() => setTab("invoices")} activeOpacity={0.8}>
          <Text style={[styles.tabText, { color: tab === "invoices" ? colors.onEmphasis : colors.mutedForeground }]}>Invoices · {invoices.length}</Text>
        </TouchableOpacity>
      </View>

      {tab === "estimates" ? (
        <>
          <View style={styles.statStrip}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Open quotes</Text>
              <Text style={styles.statValue}>{formatMoney(estimateOpenValue)}</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setCreateForJob("estimate")} activeOpacity={0.85}>
              <Ionicons name="add" size={17} color={colors.onEmphasis} />
              <Text style={styles.primaryBtnText}>New estimate</Text>
            </TouchableOpacity>
          </View>
          <SectionLabel colors={colors}>Estimates</SectionLabel>
          {loading ? (
            <Text style={styles.mutedNote}>Loading…</Text>
          ) : estimates.length === 0 ? (
            <Text style={styles.mutedNote}>Create an estimate from an open job.</Text>
          ) : (
            estimates.map((estimate) => (
              <Row
                key={estimate.id}
                colors={colors}
                icon="document-text-outline"
                title={estimate.number}
                subtitle={`${jobTitle(jobs, estimate.jobId)} · ${formatMoney(estimate.total)}`}
                right={<StatusTag colors={colors} status={estimate.status} />}
                onPress={() => nav.push({ name: "estimate", estimateId: estimate.id })}
              />
            ))
          )}
        </>
      ) : (
        <>
          <View style={styles.statStrip}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>On the books</Text>
              <Text style={styles.statValue}>{formatMoney(invoiceOutstanding)}</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setCreateForJob("invoice")} activeOpacity={0.85}>
              <Ionicons name="add" size={17} color={colors.onEmphasis} />
              <Text style={styles.primaryBtnText}>New invoice</Text>
            </TouchableOpacity>
          </View>
          <SectionLabel colors={colors}>Invoices</SectionLabel>
          {loading ? (
            <Text style={styles.mutedNote}>Loading…</Text>
          ) : invoices.length === 0 ? (
            <Text style={styles.mutedNote}>Billed work will appear here.</Text>
          ) : (
            invoices.map((invoice) => (
              <Row
                key={invoice.id}
                colors={colors}
                icon="receipt-outline"
                title={invoice.number}
                subtitle={`${jobTitle(jobs, invoice.jobId)} · ${formatMoney(invoice.total)}${invoice.dueAt ? ` · due ${formatDate(invoice.dueAt)}` : ""}`}
                right={<StatusTag colors={colors} status={invoice.status} />}
                onPress={() => nav.push({ name: "invoice", invoiceId: invoice.id })}
              />
            ))
          )}
        </>
      )}

      {createForJob ? (
        <Sheet colors={colors} visible title={`New ${createForJob} — choose job`} onClose={() => setCreateForJob(null)}>
          <Text style={styles.sheetHint}>The {createForJob} is built from the job's line items.</Text>
          {createForJob === "invoice" ? (
            <View style={styles.dueWrap}>
              <DateField colors={colors} label="Payment due by" value={invoiceDue} onChange={setInvoiceDue} placeholder="No due date" />
              <Text style={styles.mutedNote}>Leave unset for the default 30-day term.</Text>
            </View>
          ) : null}
          {openableJobs.length === 0 ? (
            <Text style={styles.mutedNote}>No open jobs to bill.</Text>
          ) : (
            openableJobs.map((job) => (
              <Row
                key={job.id}
                colors={colors}
                icon="briefcase-outline"
                title={job.title}
                subtitle={`${formatMoney(job.total)} · ${humanizeJob(job.status)}`}
                onPress={() => void create(createForJob, job.id)}
              />
            ))
          )}
        </Sheet>
      ) : null}
    </ScrollView>
  );
}

function jobTitle(jobs: JobDTO[], jobId: string): string {
  return jobs.find((j) => j.id === jobId)?.title ?? "Service job";
}

function humanizeJob(status: string): string {
  return status.replaceAll("_", " ");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function EstimateScreen({
  colors,
  session,
  estimateId,
  jobs,
  nav,
  onRefresh,
}: {
  colors: Palette;
  session: StoredStaffSession;
  estimateId: string;
  jobs: JobDTO[];
  nav: {
    pop: () => void;
    push: (route: { name: "document"; kind: "estimate"; documentId: string }) => void;
  };
  onRefresh: () => void;
}) {
  const styles = createStyles(colors);
  const [estimate, setEstimate] = useState<OfficeEstimateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState("");
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getEstimate(session, estimateId);
      setEstimate(next);
      setActiveOptionId((current) => current ?? next.selectedOptionId ?? next.options[0]?.id ?? null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [session, estimateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const approver = isApprover(session.user.role);
  const targetOptionId =
    activeOptionId ?? estimate?.selectedOptionId ?? (estimate?.options && estimate.options.length === 1 ? estimate.options[0].id : null);

  async function act(fn: () => Promise<unknown>, done?: () => void) {
    setBusy(true);
    try {
      await fn();
      setError(null);
      onRefresh();
      await load();
      done?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!estimate) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <OfficeHeader colors={colors} title="Estimate" onBack={nav.pop} />
        <InlineError colors={colors} message={error} />
        <Text style={styles.mutedNote}>{error ? "Could not load estimate." : "Loading…"}</Text>
      </ScrollView>
    );
  }

  const option = estimate.options.find((o) => o.id === activeOptionId) ?? estimate.options[0];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <OfficeHeader
        colors={colors}
        eyebrow="Estimate"
        title={estimate.number}
        subtitle={`${jobTitle(jobs, estimate.jobId)}`}
        onBack={nav.pop}
      />
      <InlineError colors={colors} message={error} />

      <View style={styles.detailCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Status</Text>
          <StatusTag colors={colors} status={estimate.status} />
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Total</Text>
          <Text style={styles.detailMoney}>{formatMoney(estimate.total)}</Text>
        </View>
        {estimate.accepted ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Accepted</Text>
            <Text style={styles.detailValue}>{estimate.acceptedByName ?? "Yes"}</Text>
          </View>
        ) : null}
        {estimate.expiresAt ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={styles.detailValue}>{formatDate(estimate.expiresAt)}</Text>
          </View>
        ) : null}
        {estimate.copiedToJobAt ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Copied to job</Text>
            <Text style={styles.detailValue}>{formatDate(estimate.copiedToJobAt)}</Text>
          </View>
        ) : null}
      </View>

      {estimate.warnings?.identicalOptions ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Options are identical</Text>
          <Text style={styles.warningText}>
            {estimate.warnings.identicalOptionMessage ?? "Differentiate the options or use a single estimate."} Marking this
            estimate sent is blocked while the options match.
          </Text>
        </View>
      ) : null}

      {estimate.warnings && estimate.warnings.scopeGaps.length > 0 ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Scope mentions work without a priced line</Text>
          {estimate.warnings.scopeGaps.map((gap) => (
            <Text key={gap} style={styles.warningText}>
              · {gap}
            </Text>
          ))}
        </View>
      ) : null}

      {estimate.deposit && estimate.deposit.requiredCents > 0 ? (
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Deposit required</Text>
            <Text style={styles.detailValue}>{formatMoney(estimate.deposit.requiredCents)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Collected</Text>
            <Text style={styles.detailValue}>{formatMoney(estimate.deposit.collectedCents)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Remaining</Text>
            <Text style={styles.detailValue}>{formatMoney(estimate.deposit.remainingCents)}</Text>
          </View>
          {estimate.deposit.invoice ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Deposit invoice</Text>
              <Text style={styles.detailValue}>{estimate.deposit.invoice.number}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {estimate.options.length > 1 ? (
        <>
          <SectionLabel colors={colors}>Select option</SectionLabel>
          <View style={styles.optionRow}>
            {estimate.options.map((o) => {
              const selected = option?.id === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => setActiveOptionId(o.id)}
                  style={[styles.optionChip, selected && styles.optionChipActive]}
                >
                  <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      {option ? (
        <>
          <SectionLabel colors={colors}>
            Option — {option.label}
            {option.recommended ? " (recommended)" : ""}
          </SectionLabel>
          {option.lineItems.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <Text style={styles.lineDesc}>{line.description}</Text>
              <Text style={styles.lineQty}>
                {[line.quantity, line.unit].filter(Boolean).join(" ")} × {formatMoney(pill(line.unitPrice))}
              </Text>
            </View>
          ))}
          <Text style={styles.optionTotal}>{formatMoney(pill(option.total))} total</Text>
        </>
      ) : null}

      {option && estimate.scope ? (
        <>
          <SectionLabel colors={colors}>Scope of work</SectionLabel>
          <Text style={styles.narrativeText}>{estimate.scope}</Text>
        </>
      ) : null}
      {option && estimate.recommendations ? (
        <>
          <SectionLabel colors={colors}>Recommendations</SectionLabel>
          <Text style={styles.narrativeText}>{estimate.recommendations}</Text>
        </>
      ) : null}
      {option && estimate.exclusions ? (
        <>
          <SectionLabel colors={colors}>Exclusions</SectionLabel>
          <Text style={styles.narrativeText}>{estimate.exclusions}</Text>
        </>
      ) : null}

      <View style={styles.actionRow}>
        <ActionButton colors={colors} label="Preview & share" icon="document-text-outline" style={styles.actionRowBtn} onPress={() => nav.push({ name: "document", kind: "estimate", documentId: estimate.id })} />
        <ActionButton colors={colors} label="Send to customer" icon="paper-plane-outline" tone="primary" style={styles.actionRowBtn} onPress={() => { setSignature(""); setAction(true); }} />
      </View>

      <Sheet colors={colors} visible={action} title="Estimate actions" onClose={() => setAction(false)}>
        {estimate.status === "draft" ? (
          <ActionButton
            colors={colors}
            label="Mark as sent"
            icon="paper-plane-outline"
            tone="primary"
            onPress={() => void act(() => markEstimateSent(session, estimate.id), () => setAction(false))}
          />
        ) : null}
        {approver && (estimate.status === "draft" || estimate.status === "sent") && targetOptionId ? (
          <>
            <Text style={styles.fieldLabel}>Customer signature / name (required)</Text>
            <TextInput
              value={signature}
              onChangeText={setSignature}
              placeholder="Signed by"
              placeholderTextColor={colors.dimForeground}
              autoCapitalize="words"
              style={[styles.input, { color: colors.foreground }]}
            />
            <ActionButton
              colors={colors}
              label="Approve"
              icon="shield-checkmark-outline"
              onPress={() => void act(() => approveEstimateOption(session, estimate.id, targetOptionId, signature.trim() || undefined), () => setAction(false))}
            />
          </>
        ) : null}
        {approver && estimate.status === "sent" ? (
          <ActionButton
            colors={colors}
            label="Accept & approve"
            icon="checkmark-done-outline"
            tone="success"
            onPress={() => void act(() => acceptEstimate(session, estimate.id, signature.trim() || undefined), () => setAction(false))}
          />
        ) : null}
        {estimate.status === "approved" ? (
          <>
            <ActionButton
              colors={colors}
              label="Create invoice from quote"
              icon="receipt-outline"
              onPress={() => void act(() => createEstimateInvoice(session, estimate.id), () => setAction(false))}
            />
            <ActionButton
              colors={colors}
              label="Copy approved quote to job"
              icon="copy-outline"
              onPress={() => void act(() => copyApprovedEstimateToJob(session, estimate.id), () => setAction(false))}
            />
          </>
        ) : null}
        {estimate.status === "draft" || estimate.status === "sent" ? (
          <ActionButton colors={colors} label="Decline" icon="close-circle-outline" tone="danger" onPress={() => void act(() => declineEstimate(session, estimate.id), () => setAction(false))} />
        ) : null}
        {busy ? <Text style={[styles.mutedNote, { textAlign: "center" }]}>Working…</Text> : null}
      </Sheet>
    </ScrollView>
  );
}

export function InvoiceScreen({
  colors,
  session,
  invoiceId,
  jobs,
  nav,
  onRefresh,
}: {
  colors: Palette;
  session: StoredStaffSession;
  invoiceId: string;
  jobs: JobDTO[];
  nav: {
    pop: () => void;
    push: (route: { name: "document"; kind: "invoice"; documentId: string }) => void;
  };
  onRefresh: () => void;
}) {
  const styles = createStyles(colors);
  const [invoice, setInvoice] = useState<OfficeInvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState(false);
  const [busy, setBusy] = useState(false);
  const approver = isApprover(session.user.role);

  const load = useCallback(async () => {
    try {
      setInvoice(await getInvoice(session, invoiceId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [session, invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, done?: () => void) {
    setBusy(true);
    try {
      await fn();
      setError(null);
      onRefresh();
      await load();
      done?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const totalPaid = useMemo(
    () => (invoice?.payments ?? []).reduce((sum, p) => sum + pill(p.amount), 0),
    [invoice],
  );
  const remaining = invoice ? Math.max(0, pill(invoice.total) - totalPaid) : 0;

  if (!invoice) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <OfficeHeader colors={colors} title="Invoice" onBack={nav.pop} />
        <InlineError colors={colors} message={error} />
        <Text style={styles.mutedNote}>{error ? "Could not load invoice." : "Loading…"}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <OfficeHeader
        colors={colors}
        eyebrow="Invoice"
        title={invoice.number}
        subtitle={`${jobTitle(jobs, invoice.jobId)}`}
        onBack={nav.pop}
      />
      <InlineError colors={colors} message={error} />

      <View style={styles.detailCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Status</Text>
          <StatusTag colors={colors} status={invoice.status} />
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Total</Text>
          <Text style={styles.detailMoney}>{formatMoney(pill(invoice.total))}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Paid</Text>
          <Text style={styles.detailValue}>{formatMoney(totalPaid)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Remaining</Text>
          <Text style={[styles.detailValue, remaining > 0 && { color: colors.warning }]}>{formatMoney(remaining)}</Text>
        </View>
        {invoice.dueAt ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Due</Text>
            <Text style={styles.detailValue}>{formatDate(invoice.dueAt)}</Text>
          </View>
        ) : null}
      </View>

      <SectionLabel colors={colors}>Lines</SectionLabel>
      {invoice.lineItems.map((line) => (
        <View key={line.id} style={styles.lineRow}>
          <Text style={styles.lineDesc}>{line.description}</Text>
          <Text style={styles.lineQty}>{line.quantity} × {formatMoney(pill(line.unitPrice))}</Text>
        </View>
      ))}
      {invoice.payments.length > 0 ? (
        <>
          <SectionLabel colors={colors}>Payments</SectionLabel>
          {invoice.payments.map((p) => (
            <View key={p.id} style={styles.lineRow}>
              <Text style={styles.lineDesc}>{p.method}</Text>
              <Text style={styles.lineQty}>{formatMoney(pill(p.amount))}</Text>
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.actionRow}>
        <ActionButton colors={colors} label="Preview & share" icon="document-text-outline" style={styles.actionRowBtn} onPress={() => nav.push({ name: "document", kind: "invoice", documentId: invoice.id })} />
        <ActionButton colors={colors} label="Invoice actions" icon="settings-outline" tone="primary" style={styles.actionRowBtn} onPress={() => setAction(true)} />
      </View>

      <Sheet colors={colors} visible={action} title="Invoice actions" onClose={() => setAction(false)}>
        <ActionButton
          colors={colors}
          label="Mark as sent"
          icon="paper-plane-outline"
          tone="primary"
          onPress={() => void act(() => patchInvoiceStatus(session, invoice.id, "sent"), () => setAction(false))}
        />
        {approver ? <RecordPayment onClose={() => setAction(false)} colors={colors} session={session} invoice={invoice} remaining={remaining} onDone={(fn) => void act(fn, () => setAction(false))} /> : null}
        {approver ? (
          <ActionButton colors={colors} label="Void invoice" icon="trash-outline" tone="danger" onPress={() => void act(() => patchInvoiceStatus(session, invoice.id, "void"), () => setAction(false))} />
        ) : null}
        {busy ? <Text style={[styles.mutedNote, { textAlign: "center" }]}>Working…</Text> : null}
      </Sheet>
    </ScrollView>
  );
}

function RecordPayment({
  colors,
  session,
  invoice,
  remaining,
  onDone,
  onClose,
}: {
  colors: Palette;
  session: StoredStaffSession;
  invoice: OfficeInvoiceDetail;
  remaining: number;
  onDone: (fn: () => Promise<unknown>) => void;
  onClose: () => void;
}) {
  const styles = createStyles(colors);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(parseFloat(amount || "0") * 100);
  const valid = cents > 0 && cents <= remaining;
  return (
    <View style={styles.payWrap}>
      <Text style={styles.fieldLabel}>Record payment (max {formatMoney(remaining)})</Text>
      <TextInput
        value={amount}
        onChangeText={(v) => setAmount(v)}
        placeholder="0.00"
        placeholderTextColor={colors.dimForeground}
        keyboardType="decimal-pad"
        style={[styles.input, { color: colors.foreground }]}
      />
      <View style={styles.methodRow}>
        {["CASH", "MTN_MOBILE_MONEY", "ORANGE_MONEY", "BANK_TRANSFER", "CARD"].map((m) => (
          <TouchableOpacity key={m} style={[styles.methodChip, method === m && { backgroundColor: colors.primary }]} onPress={() => setMethod(m)} activeOpacity={0.8}>
            <Text style={[styles.methodChipText, { color: method === m ? colors.onEmphasis : colors.mutedForeground }]}>{m.replaceAll("_", " ")}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <InlineError colors={colors} message={error} />
      <TouchableOpacity
        style={[styles.primaryBtn, { alignSelf: "stretch" }, !valid && { opacity: 0.45 }]}
        disabled={!valid}
        onPress={() => {
          if (!valid) {
            setError("Enter an amount up to the remaining balance.");
            return;
          }
          onClose();
          onDone(() => recordInvoicePayment(session, invoice.id, { amount: cents, method }));
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Record payment</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface },
    tabText: { fontSize: 13, fontFamily: fonts.bold },
    statStrip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    statBox: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 14, padding: spacing.sm },
    statLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.medium },
    statValue: { color: colors.foreground, fontSize: 18, fontFamily: fonts.bold, marginTop: 2 },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
    },
    primaryBtnText: { color: colors.onEmphasis, fontSize: 13, fontFamily: fonts.bold },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    detailCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 16, padding: spacing.md },
    detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
    detailLabel: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.medium },
    detailValue: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold },
    detailMoney: { color: colors.primary, fontSize: 20, fontFamily: fonts.extraBold },
    lineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.xs, padding: spacing.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 12 },
    lineDesc: { flex: 1, color: colors.foreground, fontSize: 13, fontFamily: fonts.regular },
    lineQty: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.medium },
    optionTotal: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, paddingHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.md },
    optionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    optionChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderLight },
    optionChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    optionChipText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.mutedForeground },
    optionChipTextActive: { color: colors.onEmphasis },
    warningCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.warningAlpha, borderWidth: 1, borderColor: colors.warning, borderRadius: 16, padding: spacing.md },
    warningTitle: { color: colors.warning, fontSize: 13, fontFamily: fonts.bold, marginBottom: 4 },
    warningText: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.regular, lineHeight: 18 },
    narrativeText: { color: colors.foreground, fontSize: 13, fontFamily: fonts.regular, lineHeight: 20, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    actionRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
    actionRowBtn: { flex: 1 },
    payWrap: { marginTop: spacing.sm, marginBottom: spacing.sm },
    fieldLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.semibold, marginBottom: 6 },
    input: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: 11, fontFamily: fonts.regular, fontSize: 15, marginBottom: spacing.sm },
    methodRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
    methodChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceMuted },
    methodChipText: { fontSize: 11, fontFamily: fonts.semibold },
    sheetHint: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular, marginBottom: spacing.sm },
    dueWrap: { marginBottom: spacing.sm },
  });