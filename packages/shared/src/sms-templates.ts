// NNACT SMS message catalog. Every use case NNACT can send over SMS is defined
// here as a named template with a declared variable set, so the API, the mobile
// apps, and (later) the staff settings editor agree on the copy and variables.
//
// Templates use the same Mustache-style syntax as the email message templates:
// {{variable}} substitution and {{#name}}…{{/name}} sections that render only
// when the variable is truthy. Unknown variables render empty; the copy is
// plain text destined for SMS, so values are never HTML-escaped.
import { renderMessageTemplate } from "./message-templates.js";

export const SMS_TEMPLATE_SLUGS = [
  // Authentication & onboarding
  "otp_login",
  "otp_signup",
  "account_welcome",
  // Job lifecycle
  "job_assigned",
  "job_scheduled",
  "job_reminder",
  "job_on_the_way",
  "job_started",
  "job_completed",
  // Billing
  "invoice_issued",
  "invoice_reminder",
  "payment_received",
  // Estimates
  "estimate_ready",
  "estimate_approved",
  "estimate_declined",
  "estimate_expiring",
  // Portal & engagement
  "portal_link",
  "service_plan_created",
  "service_plan_due",
  "review_request",
  // Marketing
  "promo_offer",
  // Internal (staff) alerts
  "staff_new_request",
  "staff_payment_notice",
  "staff_report_ready",
] as const;

export type SmsTemplateSlug = (typeof SMS_TEMPLATE_SLUGS)[number];

export interface SmsTemplateDef {
  slug: SmsTemplateSlug;
  label: string;
  audience: "customer" | "staff";
  /** The real-world moment this message is sent. */
  trigger: string;
  /** Variables the template may reference (superset; unused entries are fine). */
  variables: string[];
  /** Variables the template must reference to be operationally useful. */
  requiredVariables: string[];
  template: string;
}

export const SMS_TEMPLATE_CATALOG: SmsTemplateDef[] = [
  {
    slug: "otp_login",
    label: "Login verification code (OTP)",
    audience: "customer",
    trigger: "A customer requests a one-time code to sign in to the customer app with their phone number.",
    variables: ["companyName", "code", "ttlMinutes"],
    requiredVariables: ["code"],
    template:
      "{{code}} is your {{companyName}} verification code. It expires in {{ttlMinutes}} minutes. Never share it with anyone.",
  },
  {
    slug: "otp_signup",
    label: "Sign-up verification code",
    audience: "customer",
    trigger: "A new customer verifies their phone while creating an account.",
    variables: ["companyName", "code", "ttlMinutes"],
    requiredVariables: ["code"],
    template:
      "Welcome to {{companyName}}! Your verification code is {{code}} and expires in {{ttlMinutes}} minutes. Enter it in the app to finish signing up.",
  },
  {
    slug: "account_welcome",
    label: "New account welcome",
    audience: "customer",
    trigger: "A customer account is created and verified.",
    variables: ["companyName", "customerName"],
    requiredVariables: [],
    template:
      "Hi {{customerName}}, welcome to {{companyName}}! You can now book service, track jobs, review estimates and invoices, and pay online. Reply STOP to opt out of SMS.",
  },
  {
    slug: "job_assigned",
    label: "Technician assigned to a job",
    audience: "customer",
    trigger: "A technician is assigned to a customer's job.",
    variables: ["companyName", "customerName", "technicianName", "jobNumber", "jobTitle"],
    requiredVariables: ["jobNumber"],
    template:
      "Hi {{customerName}}, {{technicianName}} from {{companyName}} has been assigned to your job #{{jobNumber}} ({{jobTitle}}). We'll keep you updated.",
  },
  {
    slug: "job_scheduled",
    label: "Job scheduled",
    audience: "customer",
    trigger: "A date and time is confirmed for the job.",
    variables: ["companyName", "customerName", "jobNumber", "date", "time", "contactPhone"],
    requiredVariables: ["jobNumber", "date", "time"],
    template:
      "Great news {{customerName}}! Your {{companyName}} job #{{jobNumber}} is scheduled for {{date}} at {{time}}. Questions? Call {{contactPhone}}.",
  },
  {
    slug: "job_reminder",
    label: "Appointment reminder",
    audience: "customer",
    trigger: "Day-before (or morning-of) reminder for a scheduled visit.",
    variables: ["companyName", "customerName", "jobNumber", "date", "time", "contactPhone"],
    requiredVariables: ["jobNumber", "date", "time"],
    template:
      "Reminder {{customerName}}: your {{companyName}} visit for job #{{jobNumber}} is {{date}} at {{time}}. We'll text you when the technician is on the way.",
  },
  {
    slug: "job_on_the_way",
    label: "Technician on the way",
    audience: "customer",
    trigger: "The technician departs for the customer's address.",
    variables: ["companyName", "customerName", "technicianName", "jobNumber", "time"],
    requiredVariables: ["jobNumber", "time"],
    template:
      "{{technicianName}} from {{companyName}} is on the way to you for job #{{jobNumber}}. Expected arrival around {{time}}.",
  },
  {
    slug: "job_started",
    label: "Job work started",
    audience: "customer",
    trigger: "The technician starts work at the job site.",
    variables: ["companyName", "customerName", "technicianName", "jobNumber"],
    requiredVariables: ["jobNumber"],
    template:
      "{{technicianName}} has started work on your job #{{jobNumber}} at {{companyName}}. We'll let you know when it's complete.",
  },
  {
    slug: "job_completed",
    label: "Job completed",
    audience: "customer",
    trigger: "The job is closed out, inviting the customer to the portal.",
    variables: ["companyName", "customerName", "jobNumber"],
    requiredVariables: ["jobNumber"],
    template:
      "Your job #{{jobNumber}} is complete, {{customerName}}. Thanks for choosing {{companyName}}! You can review the service, invoices, or leave feedback in your portal.",
  },
  {
    slug: "invoice_issued",
    label: "Invoice issued",
    audience: "customer",
    trigger: "An invoice is generated and sent to the customer.",
    variables: ["companyName", "customerName", "invoiceNumber", "invoiceTotal", "dueDate", "portalLink"],
    requiredVariables: ["invoiceNumber"],
    template:
      "Hi {{customerName}}, invoice #{{invoiceNumber}} from {{companyName}} is ready. Balance due: {{invoiceTotal}} ({{#dueDate}}due {{dueDate}}{{/dueDate}}). Pay online: {{portalLink}}",
  },
  {
    slug: "invoice_reminder",
    label: "Invoice balance reminder",
    audience: "customer",
    trigger: "A scheduled reminder fires for an unpaid invoice.",
    variables: ["companyName", "customerName", "invoiceNumber", "invoiceTotal", "portalLink"],
    requiredVariables: ["invoiceNumber"],
    template:
      "Friendly reminder: invoice #{{invoiceNumber}} ({{invoiceTotal}}) from {{companyName}} is due. You can pay online here: {{portalLink}}",
  },
  {
    slug: "payment_received",
    label: "Payment received",
    audience: "customer",
    trigger: "A payment is recorded against an invoice.",
    variables: ["companyName", "customerName", "amount", "portalLink"],
    requiredVariables: ["amount"],
    template:
      "Payment received, {{customerName}}! Thank you for your payment of {{amount}} to {{companyName}}. Your receipt is in the portal: {{portalLink}}",
  },
  {
    slug: "estimate_ready",
    label: "Estimate ready for approval",
    audience: "customer",
    trigger: "An estimate is finalized and sent to the customer.",
    variables: ["companyName", "customerName", "estimateNumber", "estimateTotal", "portalLink"],
    requiredVariables: ["estimateNumber"],
    template:
      "Hi {{customerName}}, your {{companyName}} estimate #{{estimateNumber}} is ready for review ({{estimateTotal}}). View and approve it here: {{portalLink}}",
  },
  {
    slug: "estimate_approved",
    label: "Estimate approved",
    audience: "customer",
    trigger: "The customer approves an estimate option.",
    variables: ["companyName", "customerName", "estimateNumber", "estimateTotal"],
    requiredVariables: ["estimateNumber"],
    template:
      "Thanks {{customerName}}! You approved estimate #{{estimateNumber}} ({{estimateTotal}}) with {{companyName}}. We'll be in touch to schedule.",
  },
  {
    slug: "estimate_declined",
    label: "Estimate declined",
    audience: "customer",
    trigger: "The customer declines an estimate (courtesy follow-up).",
    variables: ["companyName", "customerName", "estimateNumber", "contactPhone"],
    requiredVariables: ["estimateNumber"],
    template:
      "Thanks for your feedback, {{customerName}} — we've noted your decision on estimate #{{estimateNumber}}. Call {{contactPhone}} if another option would work better.",
  },
  {
    slug: "estimate_expiring",
    label: "Estimate about to expire",
    audience: "customer",
    trigger: "An estimate is within its validity window and not yet decided.",
    variables: ["companyName", "customerName", "estimateNumber", "expiresAt", "portalLink"],
    requiredVariables: ["estimateNumber"],
    template:
      "Heads up {{customerName}}: estimate #{{estimateNumber}} from {{companyName}} expires {{expiresAt}}. Approve it before then here: {{portalLink}}",
  },
  {
    slug: "portal_link",
    label: "Secure portal link",
    audience: "customer",
    trigger: "The customer requests (or the office resends) portal access.",
    variables: ["companyName", "customerName", "portalLink", "portalExpiresAt"],
    requiredVariables: ["portalLink"],
    template:
      "Your secure {{companyName}} customer portal: {{portalLink}}. {{#portalExpiresAt}}This link expires {{portalExpiresAt}}.{{/portalExpiresAt}}",
  },
  {
    slug: "service_plan_created",
    label: "Service plan enrolled",
    audience: "customer",
    trigger: "A customer is enrolled in a recurring maintenance plan.",
    variables: ["companyName", "customerName", "planName", "frequency", "contactPhone"],
    requiredVariables: ["planName"],
    template:
      "Welcome to the {{planName}} plan with {{companyName}}, {{customerName}}! You're covered for {{frequency}} care. Questions? {{contactPhone}}",
  },
  {
    slug: "service_plan_due",
    label: "Service plan visit due",
    audience: "customer",
    trigger: "A plan's next visit window opens.",
    variables: ["companyName", "customerName", "planName", "contactPhone"],
    requiredVariables: ["planName"],
    template:
      "It's time for your {{planName}} service with {{companyName}}, {{customerName}}. Call {{contactPhone}} to schedule your visit.",
  },
  {
    slug: "review_request",
    label: "Review request",
    audience: "customer",
    trigger: "After a completed job, asking the customer for a review.",
    variables: ["companyName", "customerName", "reviewLink"],
    requiredVariables: ["reviewLink"],
    template:
      "Thanks for choosing {{companyName}}, {{customerName}}! We'd love your feedback — it takes 30 seconds: {{reviewLink}}",
  },
  {
    slug: "promo_offer",
    label: "Promotional offer",
    audience: "customer",
    trigger: "A marketing campaign or seasonal offer sent to opted-in customers.",
    variables: ["companyName", "customerName", "offerDescription", "offerCode", "contactPhone", "portalLink"],
    requiredVariables: ["offerDescription"],
    template:
      "{{companyName}} special offer for you, {{customerName}}: {{offerDescription}} Book today at {{contactPhone}} or {{portalLink}} and mention offer {{offerCode}}.",
  },
  {
    slug: "staff_new_request",
    label: "Office: new service request",
    audience: "staff",
    trigger: "A public booking or customer request arrives and needs assignment.",
    variables: ["customerName", "jobTitle", "requestId"],
    requiredVariables: ["requestId"],
    template:
      "New service request: {{jobTitle}} from {{customerName}}. Request #{{requestId}}. Open the NNACT Pro app to review and assign.",
  },
  {
    slug: "staff_payment_notice",
    label: "Office: payment received",
    audience: "staff",
    trigger: "A payment is recorded, alerting the office for reconciliation.",
    variables: ["customerName", "amount", "invoiceNumber"],
    requiredVariables: ["amount"],
    template:
      "Payment received: {{amount}} from {{customerName}} on invoice #{{invoiceNumber}}. Confirm in NNACT Pro.",
  },
  {
    slug: "staff_report_ready",
    label: "Office: report ready",
    audience: "staff",
    trigger: "A scheduled report or summary is generated for an operator.",
    variables: ["reportType", "period"],
    requiredVariables: ["reportType", "period"],
    template: "Your {{reportType}} report for {{period}} is ready — view it in NNACT Pro.",
  },
];

export function lookupSmsTemplate(slug: SmsTemplateSlug): SmsTemplateDef {
  const def = SMS_TEMPLATE_CATALOG.find((entry) => entry.slug === slug);
  if (!def) throw new Error(`unknown SMS template: ${slug}`);
  return def;
}

/** Renders a catalog SMS template with the given variables (shared engine). */
export function renderSmsTemplate(slug: SmsTemplateSlug, variables: Record<string, string | number | null | undefined>): string {
  return renderMessageTemplate(lookupSmsTemplate(slug).template, variables);
}