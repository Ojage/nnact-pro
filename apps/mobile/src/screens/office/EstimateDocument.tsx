import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Share as RNShare,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import * as Clipboard from "expo-clipboard";
import { File } from "expo-file-system";
import { WebView } from "react-native-webview";
import {
  estimateDocumentData,
  invoiceDocumentData,
  renderFieldDocumentHtml,
  type DocumentCustomerLike,
  type DocumentEstimateLike,
  type DocumentJobLike,
  type DocumentOrgLike,
  type FieldDocumentData,
} from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import { getEstimate, getInvoice, listCustomers, orgSettings, type OfficeEstimateDetail, type OfficeInvoiceDetail, type OfficeOrgSettings } from "../../office-api";
import { formatMoney, type CustomerDTO, type JobDTO } from "@nnact/shared";
import { InlineError, OfficeHeader, Row, Sheet } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

export type DocumentKind = "estimate" | "invoice";

function toOrgLike(org: OfficeOrgSettings): DocumentOrgLike {
  return {
    name: org.name,
    logoUrl: org.logoUrl,
    brandColor: org.brandColor,
    documentFooter: org.documentFooter,
    publicEmail: org.publicEmail,
    publicPhone: org.publicPhone,
    publicAddress: org.publicAddress,
    registrationNumber: org.registrationNumber,
    documentCategory: org.documentCategory,
    signatoryName: org.signatoryName,
    signatoryTitle: org.signatoryTitle,
    signatureUrl: org.signatureUrl,
    stampUrl: org.stampUrl,
    documentTerms: org.documentTerms,
    removeOpenFieldProAttribution: org.removeOpenFieldProAttribution,
    businessSettings: org.businessSettings as unknown as DocumentOrgLike["businessSettings"],
  };
}

function customerLike(customer: CustomerDTO | undefined): DocumentCustomerLike | null {
  if (!customer) return null;
  return { name: customer.name, email: customer.email, phone: customer.phone, address: customer.primaryAddress };
}

function jobLike(job: JobDTO | undefined): DocumentJobLike | null {
  if (!job) return null;
  return { title: job.title, description: job.description, serviceAddress: job.serviceAddress };
}

function pricingInput(
  pricing: { subtotal?: number; discount?: number; tax?: number; total?: number; taxLabel?: string; discountLabel?: string } | null | undefined,
) {
  if (!pricing || typeof pricing.total !== "number") return undefined;
  return pricing;
}

function estimateFieldData({
  estimate,
  customer,
  job,
  org,
}: {
  estimate: OfficeEstimateDetail;
  customer: CustomerDTO | undefined;
  job: JobDTO | undefined;
  org: OfficeOrgSettings;
}): FieldDocumentData {
  const estimateLike: DocumentEstimateLike & { total: number } = {
    id: estimate.id,
    number: estimate.number,
    accepted: estimate.accepted,
    expiresAt: estimate.expiresAt,
    acceptedAt: estimate.acceptedAt ?? null,
    acceptedByName: estimate.acceptedByName,
    acceptedMethod: (estimate as { acceptedMethod?: string | null }).acceptedMethod as DocumentEstimateLike["acceptedMethod"] | undefined,
    scope: (estimate as { scope?: string | null }).scope ?? undefined,
    recommendations: (estimate as { recommendations?: string | null }).recommendations ?? undefined,
    exclusions: (estimate as { exclusions?: string | null }).exclusions ?? undefined,
    revision: (estimate as { revision?: number | null }).revision ?? undefined,
    createdAt: estimate.createdAt,
    status: estimate.status,
    selectedOptionId: estimate.selectedOptionId,
    signatureName: estimate.signatureName,
    pricing: pricingInput(estimate.pricing),
    options: estimate.options.map((option) => ({
      id: option.id,
      label: option.label,
      lineItems: option.lineItems,
      pricing: pricingInput(option.pricing) ?? (option.total ? { total: option.total } : undefined),
    })),
    total: estimate.total,
  };
  return estimateDocumentData({
    estimate: estimateLike,
    customer: customerLike(customer),
    job: jobLike(job),
    lineItems: estimate.lineItems ?? [],
    org: toOrgLike(org),
    termsAndConditions: estimate.termsAndConditions,
  });
}

function invoiceFieldData({
  invoice,
  customer,
  job,
  org,
}: {
  invoice: OfficeInvoiceDetail;
  customer: CustomerDTO | undefined;
  job: JobDTO | undefined;
  org: OfficeOrgSettings;
}): FieldDocumentData {
  return invoiceDocumentData({
    invoice: {
      number: invoice.number,
      status: invoice.status,
      dueAt: invoice.dueAt ?? null,
      createdAt: invoice.createdAt ?? undefined,
      payments: invoice.payments ?? [],
      total: invoice.total,
    },
    customer: customerLike(customer),
    job: jobLike(job),
    lineItems: invoice.lineItems ?? [],
    org: toOrgLike(org),
  });
}

function documentHtml(data: FieldDocumentData): string {
  return renderFieldDocumentHtml(data);
}

function whatsappText(kind: DocumentKind, number: string, customer: string, data: FieldDocumentData): string {
  const totals = data.pricing;
  const totalLine = totals ? formatMoney(totals.totalCents, data.currency ?? "XAF") : "";
  const head = kind === "estimate" ? "ESTIMATE" : "INVOICE";
  const lines = [
    `${head} ${number}`,
    `From ${data.branding.companyName}`,
    `For ${customer}`,
    data.jobTitle ? `Job: ${data.jobTitle}` : null,
    data.pricing ? `Total: ${totalLine}` : null,
    data.issuedAt ? `Issued: ${data.issuedAt}` : null,
    kind === "estimate" && data.dueAt ? `Valid until: ${data.dueAt}` : null,
    kind === "invoice" && data.dueAt ? `Due: ${data.dueAt}` : null,
    data.branding.publicPhone ? `Call: ${data.branding.publicPhone}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return lines;
}

export function EstimateDocumentScreen({
  colors,
  session,
  kind,
  documentId,
  jobs,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  kind: DocumentKind;
  documentId: string;
  jobs: JobDTO[];
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [html, setHtml] = useState<string | null>(null);
  const [data, setData] = useState<FieldDocumentData | null>(null);
  const [number, setNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [webReady, setWebReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pdfUri = useRef<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [org, customers] = await Promise.all([orgSettings(session), listCustomers(session)]);
        let customer: CustomerDTO | undefined;
        let job: JobDTO | undefined;
        if (kind === "estimate") {
          const estimate = await getEstimate(session, documentId);
          if (!alive) return;
          job = jobs.find((row) => row.id === estimate.jobId);
          customer = customers.find((row) => row.id === job?.customerId);
          const field = estimateFieldData({ estimate, customer, job, org });
          setData(field);
          setHtml(documentHtml(field));
          setNumber(estimate.number);
          setCustomerName(customer?.name ?? "Customer");
        } else {
          const invoice = await getInvoice(session, documentId);
          if (!alive) return;
          job = jobs.find((row) => row.id === invoice.jobId);
          customer = customers.find((row) => row.id === job?.customerId);
          const field = invoiceFieldData({ invoice, customer, job, org });
          setData(field);
          setHtml(documentHtml(field));
          setNumber(invoice.number);
          setCustomerName(customer?.name ?? "Customer");
        }
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
  }, [session, kind, documentId, jobs]);

  const shareText = useMemo(
    () => (data ? whatsappText(kind, number, customerName, data) : ""),
    [data, kind, number, customerName],
  );

  function flashNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2200);
  }

  async function ensurePdf(): Promise<string | null> {
    if (pdfUri.current) return pdfUri.current;
    if (!html) return null;
    setBusy(true);
    try {
      const file = await Print.printToFileAsync({ html, base64: false });
      const uri = typeof file === "string" ? file : file.uri;
      pdfUri.current = uri;
      return uri;
    } finally {
      setBusy(false);
    }
  }

  /** content:// URI granted to this app, for cross-app intents. */
  function sharedContentUri(filePath: string): string | null {
    try {
      return new File(filePath).uri;
    } catch {
      return filePath;
    }
  }

  async function exportPdf() {
    try {
      const uri = await ensurePdf();
      if (!uri) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Share ${kind} ${number}`,
          UTI: "com.adobe.pdf",
        });
        setError(null);
      } else {
        await RNShare.share({ message: shareText, title: `${kind} ${number}` });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function sharePdfOnWhatsApp() {
    try {
      const uri = await ensurePdf();
      if (!uri) return;
      if (Platform.OS === "android") {
        await IntentLauncher.startActivityAsync("android.intent.action.SEND", {
          type: "application/pdf",
          packageName: "com.whatsapp",
          flags: 1,
          extra: {
            "android.intent.extra.STREAM": sharedContentUri(uri),
            "android.intent.extra.TITLE": `${kind} ${number}`,
          },
        });
      } else {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Share ${kind} ${number}` });
      }
      setError(null);
    } catch (caught) {
      // No WhatsApp on this device or the direct target failed — fall back to
      // the system share sheet, which still lists WhatsApp.
      try {
        const uri = await ensurePdf();
        if (uri) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Share ${kind} ${number}` });
      } catch (fallbackCaught) {
        setError(
          `WhatsApp is not installed or could not receive the file. ${fallbackCaught instanceof Error ? fallbackCaught.message : String(fallbackCaught)}`,
        );
      }
    }
  }

  async function shareTextPlain() {
    if (!shareText) return;
    try {
      await RNShare.share({ message: shareText, title: `${kind} ${number}` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function shareWhatsAppText() {
    if (!shareText) return;
    try {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`);
    } catch (caught) {
      setError(`Could not open WhatsApp. ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }

  async function copySummary() {
    if (!shareText) return;
    try {
      await Clipboard.setStringAsync(shareText);
      flashNotice("Summary copied");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function systemPrint() {
    if (!html) return;
    try {
      await Print.printAsync({ html });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <View style={styles.screen}>
      <OfficeHeader
        colors={colors}
        eyebrow={kind === "estimate" ? "Estimate" : "Invoice"}
        title={`${kind === "estimate" ? "Estimate" : "Invoice"} ${number || ""}`.trim()}
        subtitle="Print-ready document. Export as PDF to share via WhatsApp, email or any other app."
        onBack={nav.pop}
      />

      <InlineError colors={colors} message={error} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerNote}>Building the document…</Text>
        </View>
      ) : html ? (
        <>
          <View style={styles.paper}>
            {webReady ? null : (
              <View style={styles.centerOverlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            <WebView
              source={{ html }}
              originWhitelist={["*"]}
              style={{ flex: 1, backgroundColor: "#ffffff" }}
              javaScriptEnabled={false}
              domStorageEnabled
              setSupportMultipleWindows={false}
              onLoadStart={() => setWebReady(false)}
              onLoad={() => setWebReady(true)}
              onLoadEnd={() => setWebReady(true)}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              activeOpacity={0.85}
              onPress={() => void exportPdf()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.onEmphasis} size="small" />
              ) : (
                <Ionicons name="document-attach-outline" size={18} color={colors.onEmphasis} />
              )}
              <Text style={styles.primaryBtnText}>{busy ? "Preparing PDF…" : "Export PDF & share"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreBtn} activeOpacity={0.7} onPress={() => setMoreOpen(true)}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Sheet colors={colors} visible={moreOpen} title="More share options" onClose={() => setMoreOpen(false)}>
            <Row
              colors={colors}
              icon="logo-whatsapp"
              title="Send PDF on WhatsApp"
              subtitle="Attach the PDF to a WhatsApp chat"
              onPress={() => {
                setMoreOpen(false);
                void sharePdfOnWhatsApp();
              }}
            />
            <Row
              colors={colors}
              icon="share-social-outline"
              title="Export PDF"
              subtitle="System share sheet (any app)"
              onPress={() => {
                setMoreOpen(false);
                void exportPdf();
              }}
            />
            <Row
              colors={colors}
              icon="chatbox-ellipses-outline"
              title="WhatsApp message"
              subtitle="Summary as text (no attachment)"
              onPress={() => {
                setMoreOpen(false);
                void shareWhatsAppText();
              }}
            />
            <Row
              colors={colors}
              icon="text-outline"
              title="Send as text"
              subtitle="Email, SMS and messaging apps"
              onPress={() => {
                setMoreOpen(false);
                void shareTextPlain();
              }}
            />
            <Row
              colors={colors}
              icon="copy-outline"
              title="Copy summary"
              subtitle="Copy the estimate snapshot to the clipboard"
              onPress={() => {
                setMoreOpen(false);
                void copySummary();
              }}
            />
            <Row
              colors={colors}
              icon="print-outline"
              title="Print"
              subtitle="Send to a printer"
              onPress={() => {
                setMoreOpen(false);
                void systemPrint();
              }}
            />
          </Sheet>
        </>
      ) : (
        <View style={styles.center}>
          <Text style={styles.centerNote}>Could not load the document.</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.sm },
    centerNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular },
    centerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
    paper: {
      flex: 1,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: "#ffffff",
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 8,
      overflow: "hidden",
    },
    actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    primaryBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
    },
    primaryBtnText: { color: colors.onEmphasis, fontSize: 15, fontFamily: fonts.bold },
    moreBtn: {
      width: 52,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    notice: { color: colors.success, fontSize: 12, fontFamily: fonts.semibold, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  });