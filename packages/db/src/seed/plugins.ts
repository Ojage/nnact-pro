import { db, plugins } from "../index.js";

const NOTIFY_EVENTS = ["job.created", "invoice.created", "invoice.paid", "payment.received"];
const FIRST_PARTY_PLUGINS = [
  { slug: "slack-notifier", name: "Slack", description: "Post job, invoice, and payment alerts to a Slack channel.", events: NOTIFY_EVENTS, scopes: [], transform: "slack" },
  { slug: "discord-notifier", name: "Discord", description: "Post job, invoice, and payment alerts to a Discord channel.", events: NOTIFY_EVENTS, scopes: [], transform: "discord" },
  { slug: "ntfy-notifier", name: "ntfy", description: "Push job, invoice, and payment alerts to your phone via ntfy.", events: NOTIFY_EVENTS, scopes: [], transform: "ntfy" },
  { slug: "google-maps", name: "Google Maps & Routing", description: "Geocode service addresses and optimize technician routes.", events: [], scopes: ["jobs:read", "customers:read"], transform: "generic" },
  { slug: "twilio-sms", name: "Twilio SMS", description: "Text customers on job and payment events.", events: ["job.created", "invoice.created", "payment.received"], scopes: ["jobs:read", "customers:read"], transform: "generic" },
  { slug: "resend-email", name: "Resend Email", description: "Send transactional email for invoices and estimates.", events: ["invoice.created", "estimate.accepted"], scopes: ["invoices:read", "customers:read"], transform: "generic" },
  { slug: "mailchimp", name: "Mailchimp", description: "Sync customers into a marketing audience.", events: ["customer.created"], scopes: ["customers:read"], transform: "generic" },
  { slug: "quickbooks", name: "QuickBooks Online", description: "Push paid invoices and payments into accounting.", events: ["invoice.paid", "payment.received"], scopes: ["invoices:read"], transform: "generic" },
  { slug: "zapier", name: "Zapier", description: "Fan field-service events out to automation workflows.", events: ["job.created", "job.updated", "invoice.created", "invoice.paid", "payment.received", "customer.created", "estimate.accepted"], scopes: ["*"], transform: "generic" },
] as const;

export async function seedPlugins(): Promise<void> {
  await db
    .insert(plugins)
    .values(
      FIRST_PARTY_PLUGINS.map((plugin) => ({
        ...plugin,
        events: [...plugin.events],
        scopes: [...plugin.scopes],
        firstParty: true,
      })),
    )
    .onConflictDoNothing({ target: plugins.slug });
  console.log(`seed: ${FIRST_PARTY_PLUGINS.length} first-party plugin manifests ensured`);
}
