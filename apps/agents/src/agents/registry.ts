// Handlers for the agents beyond intake, quoting and dispatch. Each entry
// pairs with a work source registered in its own module.
import type { AgentId } from "@nnact/shared";
import type { AgentHandler } from "../index.js";

export const extraHandlers: Partial<Record<AgentId, AgentHandler>> = {};
