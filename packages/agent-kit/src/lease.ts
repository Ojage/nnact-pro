import type { AgentId } from "@nnact/shared";
import { parseDate } from "./util.js";

export type AgentLeaseState = "pending" | "leased" | "completed" | "dead";

export interface AgentLease {
  id: string;
  agentId: AgentId;
  orgId: string | null;
  leaseKey: string;
  task: string;
  payload: Record<string, unknown>;
  state: AgentLeaseState;
  attempts: number;
  maxAttempts: number;
  claimedAt: string | null;
  expiresAt: string | null;
  nextAttemptAt: string;
  completedAt: string | null;
  lastError: string | null;
}

export interface AgentDeadLetter {
  id: string;
  leaseId: string;
  agentId: AgentId;
  orgId: string | null;
  leaseKey: string;
  task: string;
  attempts: number;
  error: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AgentLeaseEnqueueInput {
  agentId: AgentId;
  orgId?: string | null;
  leaseKey: string;
  task: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  nextAttemptAt?: Date | string;
}

export interface AgentLeaseAcquireInput {
  agentId: AgentId;
  leaseKey: string;
  ttlMs: number;
  now?: Date;
}

export interface AgentLeaseRenewInput {
  lease: AgentLease;
  ttlMs: number;
  now?: Date;
}

export interface AgentLeaseReleaseInput {
  lease: AgentLease;
  now?: Date;
}

export interface AgentLeaseRetryInput {
  lease: AgentLease;
  error: string;
  delayMs: number;
  now?: Date;
}

export interface AgentLeaseDeadLetterInput {
  lease: AgentLease;
  error: string;
  now?: Date;
}

export interface AgentLeaseDueInput {
  agentId: AgentId;
  limit?: number;
  now?: Date;
}

export interface AgentLeaseStore {
  enqueue(input: AgentLeaseEnqueueInput): Promise<AgentLease>;
  due(input: AgentLeaseDueInput): Promise<AgentLease[]>;
  acquire(input: AgentLeaseAcquireInput): Promise<AgentLease | null>;
  renew(input: AgentLeaseRenewInput): Promise<AgentLease | null>;
  release(input: AgentLeaseReleaseInput): Promise<AgentLease>;
  retry(input: AgentLeaseRetryInput): Promise<AgentLease>;
  deadLetter(input: AgentLeaseDeadLetterInput): Promise<AgentDeadLetter>;
}

export interface InMemoryAgentLeaseStore extends AgentLeaseStore {
  get(agentId: AgentId, leaseKey: string): Promise<AgentLease | null>;
  list(): Promise<AgentLease[]>;
  listDeadLetters(): Promise<AgentDeadLetter[]>;
}

function leaseKeyFor(agentId: AgentId, leaseKey: string): string {
  return `${agentId}\u0000${leaseKey}`;
}

function cloneLease(lease: AgentLease): AgentLease {
  return { ...lease, payload: structuredClone(lease.payload) };
}

function cloneDeadLetter(letter: AgentDeadLetter): AgentDeadLetter {
  return { ...letter, payload: structuredClone(letter.payload) };
}

export function createInMemoryAgentLeaseStore(): InMemoryAgentLeaseStore {
  const leases = new Map<string, AgentLease>();
  const deadLetters: AgentDeadLetter[] = [];
  let sequence = 0;

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function resolveNow(value: Date | undefined): Date {
    return value ?? new Date();
  }

  return {
    async enqueue(input) {
      const key = leaseKeyFor(input.agentId, input.leaseKey);
      const current = resolveNow(undefined);
      const existing = leases.get(key);
      if (existing && existing.state !== "completed" && existing.state !== "dead") return cloneLease(existing);
      const lease: AgentLease = {
        id: nextId("lease"),
        agentId: input.agentId,
        orgId: input.orgId ?? null,
        leaseKey: input.leaseKey,
        task: input.task,
        payload: structuredClone(input.payload ?? {}),
        state: "pending",
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        claimedAt: null,
        expiresAt: null,
        nextAttemptAt: parseDate(input.nextAttemptAt, current),
        completedAt: null,
        lastError: null,
      };
      leases.set(key, lease);
      return cloneLease(lease);
    },

    async due(input) {
      const now = resolveNow(input.now).getTime();
      const limit = input.limit ?? 10;
      return [...leases.values()]
        .filter((lease) => lease.agentId === input.agentId && lease.state === "pending" && Date.parse(lease.nextAttemptAt) <= now)
        .sort((left, right) => Date.parse(left.nextAttemptAt) - Date.parse(right.nextAttemptAt) || left.id.localeCompare(right.id))
        .slice(0, Math.max(0, limit))
        .map(cloneLease);
    },

    async acquire(input) {
      const now = resolveNow(input.now);
      const lease = leases.get(leaseKeyFor(input.agentId, input.leaseKey));
      if (!lease) return null;
      if (lease.state !== "pending" && lease.state !== "leased") return null;
      if (lease.state === "leased" && lease.expiresAt && Date.parse(lease.expiresAt) > now.getTime()) return null;
      if (Date.parse(lease.nextAttemptAt) > now.getTime()) return null;
      lease.state = "leased";
      lease.attempts += 1;
      lease.claimedAt = now.toISOString();
      lease.expiresAt = new Date(now.getTime() + Math.max(0, input.ttlMs)).toISOString();
      return cloneLease(lease);
    },

    async renew(input) {
      const now = resolveNow(input.now);
      const lease = leases.get(leaseKeyFor(input.lease.agentId, input.lease.leaseKey));
      if (!lease || lease.id !== input.lease.id || lease.state !== "leased") return null;
      if (!lease.expiresAt || Date.parse(lease.expiresAt) <= now.getTime()) return null;
      lease.expiresAt = new Date(now.getTime() + Math.max(0, input.ttlMs)).toISOString();
      return cloneLease(lease);
    },

    async release(input) {
      const now = resolveNow(input.now);
      const lease = leases.get(leaseKeyFor(input.lease.agentId, input.lease.leaseKey));
      if (!lease || lease.id !== input.lease.id) return cloneLease(input.lease);
      lease.state = "completed";
      lease.expiresAt = null;
      lease.completedAt = now.toISOString();
      lease.lastError = null;
      return cloneLease(lease);
    },

    async retry(input) {
      const now = resolveNow(input.now);
      const lease = leases.get(leaseKeyFor(input.lease.agentId, input.lease.leaseKey));
      if (!lease || lease.id !== input.lease.id) return cloneLease(input.lease);
      lease.state = "pending";
      lease.claimedAt = null;
      lease.expiresAt = null;
      lease.nextAttemptAt = new Date(now.getTime() + Math.max(0, input.delayMs)).toISOString();
      lease.lastError = input.error;
      return cloneLease(lease);
    },

    async deadLetter(input) {
      const now = resolveNow(input.now);
      const lease = leases.get(leaseKeyFor(input.lease.agentId, input.lease.leaseKey));
      if (!lease || lease.id !== input.lease.id) {
        return cloneDeadLetter({
          id: nextId("dead"),
          leaseId: input.lease.id,
          agentId: input.lease.agentId,
          orgId: input.lease.orgId,
          leaseKey: input.lease.leaseKey,
          task: input.lease.task,
          attempts: input.lease.attempts,
          error: input.error,
          payload: structuredClone(input.lease.payload),
          createdAt: now.toISOString(),
        });
      }
      lease.state = "dead";
      lease.expiresAt = null;
      lease.completedAt = now.toISOString();
      lease.lastError = input.error;
      const letter: AgentDeadLetter = {
        id: nextId("dead"),
        leaseId: lease.id,
        agentId: lease.agentId,
        orgId: lease.orgId,
        leaseKey: lease.leaseKey,
        task: lease.task,
        attempts: lease.attempts,
        error: input.error,
        payload: structuredClone(lease.payload),
        createdAt: now.toISOString(),
      };
      deadLetters.push(letter);
      return cloneDeadLetter(letter);
    },

    async get(agentId, leaseKey) {
      const lease = leases.get(leaseKeyFor(agentId, leaseKey));
      return lease ? cloneLease(lease) : null;
    },

    async list() {
      return [...leases.values()].map(cloneLease);
    },

    async listDeadLetters() {
      return deadLetters.map(cloneDeadLetter);
    },
  };
}
