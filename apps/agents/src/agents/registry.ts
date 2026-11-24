// Handlers for the agents beyond intake, quoting and dispatch. Importing a
// handler module also registers its work source.
import { AGENT_ID, type AgentId } from "@nnact/shared";
import type { AgentHandler } from "../index.js";
import { processPricebookScan } from "./pricebook/handler.js";

export const extraHandlers: Partial<Record<AgentId, AgentHandler>> = {
  [AGENT_ID.pricebook]: (api, office, context) => processPricebookScan(api, office, context.orgId, context.lease.id),
};
