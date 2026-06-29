// The event contract shared by the OFP server (emitter) and plugins (receivers).
// `PLUGIN_EVENTS` is the canonical list a manifest may subscribe to; the server
// imports it too so the two never drift.

export const PLUGIN_EVENTS = [
  "job.created",
  "job.updated",
  "invoice.created",
  "invoice.paid",
  "payment.received",
  "customer.created",
  "estimate.accepted",
] as const;
export type PluginEventKind = (typeof PLUGIN_EVENTS)[number];

// Per-event payload shapes. These mirror exactly what the server emits; keep in
// sync with the `safeEmitEvent(...)` call sites in the API. Events without a
// strongly-typed payload yet fall back to a generic record.
export interface JobCreatedPayload {
  id: string;
  title: string;
  customerId: string;
  status: string;
}
export interface InvoiceCreatedPayload {
  id: string;
  number: string;
  jobId: string;
  total: number; // cents
}
export interface PaymentReceivedPayload {
  invoiceId: string;
  number: string;
  amount: number; // cents
  method: string;
  status: string;
}
export interface InvoicePaidPayload {
  invoiceId: string;
  number: string;
  total: number; // cents
  jobId: string;
}

export interface EventPayloads {
  "job.created": JobCreatedPayload;
  "job.updated": Record<string, unknown>;
  "invoice.created": InvoiceCreatedPayload;
  "invoice.paid": InvoicePaidPayload;
  "payment.received": PaymentReceivedPayload;
  "customer.created": Record<string, unknown>;
  "estimate.accepted": Record<string, unknown>;
}

/** The JSON body the server POSTs to a plugin's webhook. */
export interface PluginEventEnvelope<K extends PluginEventKind = PluginEventKind> {
  kind: K;
  orgId: string;
  data: EventPayloads[K];
  ts: number;
}
