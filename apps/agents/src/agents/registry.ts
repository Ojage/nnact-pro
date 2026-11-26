import { AGENT_ID, type AgentId } from "@nnact/shared";
import type { AgentHandler } from "../index.js";
import { processPricebookScan } from "./pricebook/handler.js";
import { processTriageJob } from "./triage/handler.js";
import { processSourcingJob } from "./sourcing/handler.js";
import { processCopilotJob } from "./copilot/handler.js";
import { processPaymentReminders } from "./payments/handler.js";

export const extraHandlers: Partial<Record<AgentId, AgentHandler>> = {
  [AGENT_ID.pricebook]: (api, office, context) => processPricebookScan(api, office, context.orgId, context.lease.id),
  [AGENT_ID.triage]: (api, office, context) =>
    processTriageJob(api, office, String(context.lease.payload.jobId ?? context.lease.leaseKey), context.lease.id),
  [AGENT_ID.sourcing]: (api, office, context) =>
    processSourcingJob(api, office, String(context.lease.payload.jobId ?? context.lease.leaseKey), context.lease.id),
  [AGENT_ID.copilot]: (api, office, context) =>
    processCopilotJob(
      api,
      office,
      String(context.lease.payload.jobId ?? context.lease.leaseKey),
      context.lease.id,
      typeof context.lease.payload.fingerprint === "string" ? context.lease.payload.fingerprint : undefined,
    ),
  [AGENT_ID.payments]: (api, office, context) =>
    processPaymentReminders(api, office, String(context.lease.payload.invoiceId ?? context.lease.leaseKey), context.lease.id),
};
