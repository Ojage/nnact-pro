import { AGENT_REGISTRY, type AgentId, type AgentScope } from "@nnact/shared";
import type { AgentCostGuard, AgentCostDecision } from "./cost-guard.js";
import type { AgentKillSwitch } from "./kill-switch.js";
import type { AgentLease, AgentLeaseStore } from "./lease.js";
import { createNoopAgentRunLogger, type AgentRunLogger, type AgentRunLogFields } from "./logger.js";
import { toErrorMessage } from "./util.js";

export interface AgentWorkResult {
  model?: string | null;
  promptVersion?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  output?: Record<string, unknown>;
}

export interface AgentWorkContext {
  lease: AgentLease;
  agentId: AgentId;
  orgId: string;
  task: string;
  scopes: readonly AgentScope[];
  attempt: number;
  maxAttempts: number;
  signal: AbortSignal;
}

export type AgentLoopErrorPhase = "tick" | "work" | "renew" | "logger";

export interface AgentLoopErrorContext {
  agentId: AgentId;
  phase: AgentLoopErrorPhase;
  leaseKey?: string;
}

export interface AgentLoopOptions {
  agentId: AgentId;
  store: AgentLeaseStore;
  work: (context: AgentWorkContext) => Promise<AgentWorkResult | undefined>;
  logger?: AgentRunLogger;
  killSwitch?: AgentKillSwitch;
  costGuard?: AgentCostGuard;
  pollIntervalMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  leaseTtlMs?: number;
  renewEveryMs?: number;
  renewTtlMs?: number;
  now?: () => Date;
  onError?: (error: unknown, context: AgentLoopErrorContext) => void;
}

export interface AgentLoopTickResult {
  due: number;
  acquired: number;
  completed: number;
  retried: number;
  deadLettered: number;
  denied: number;
  failed: number;
}

export interface AgentLoop {
  readonly running: boolean;
  start(): void;
  stop(): void;
  tick(): Promise<AgentLoopTickResult>;
}

function emptyTick(): AgentLoopTickResult {
  return { due: 0, acquired: 0, completed: 0, retried: 0, deadLettered: 0, denied: 0, failed: 0 };
}

export function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const boundedBase = Math.min(Math.max(0, baseDelayMs), Math.max(0, maxDelayMs));
  const shift = Math.max(0, attempt - 1);
  return Math.min(Math.max(0, maxDelayMs), boundedBase * 2 ** shift);
}

export function createAgentLoop(options: AgentLoopOptions): AgentLoop {
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? createNoopAgentRunLogger();
  const pollIntervalMs = options.pollIntervalMs ?? 15_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const leaseTtlMs = options.leaseTtlMs ?? 60_000;
  const renewEveryMs = options.renewEveryMs ?? 0;
  const renewTtlMs = options.renewTtlMs ?? leaseTtlMs;
  const scopes: readonly AgentScope[] = AGENT_REGISTRY[options.agentId].scopes;
  const activeKeys = new Set<string>();
  let ticking = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function report(error: unknown, phase: AgentLoopErrorPhase, leaseKey?: string): void {
    options.onError?.(error, { agentId: options.agentId, phase, leaseKey });
  }

  async function logStart(fields: AgentRunLogFields): Promise<void> {
    try {
      await logger.start(fields);
    } catch (error) {
      report(error, "logger", fields.leaseId ?? undefined);
    }
  }

  async function logFinish(fields: AgentRunLogFields): Promise<void> {
    try {
      await logger.finish(fields);
    } catch (error) {
      report(error, "logger", fields.leaseId ?? undefined);
    }
  }

  async function execute(lease: AgentLease, result: AgentLoopTickResult): Promise<void> {
    const startedAt = now();
    const attempt = lease.attempts;
    const fields: AgentRunLogFields = {
      agentId: options.agentId,
      orgId: lease.orgId,
      task: lease.task,
      promptVersion: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      costCents: null,
      outcome: null,
      error: null,
      latencyMs: null,
      leaseId: lease.id,
      attempt,
    };
    await logStart(fields);

    async function finish(patch: Partial<AgentRunLogFields>): Promise<void> {
      await logFinish({ ...fields, ...patch, latencyMs: now().getTime() - startedAt.getTime() });
    }

    if (options.costGuard) {
      let decision: AgentCostDecision;
      if (!lease.orgId) {
        decision = { allowed: false, spendCents: null, capCents: null, reason: "missing org id" };
      } else {
        try {
          decision = await options.costGuard.check({ agentId: options.agentId, orgId: lease.orgId });
        } catch (error) {
          decision = { allowed: false, spendCents: null, capCents: null, reason: toErrorMessage(error) };
        }
      }
      if (!decision.allowed) {
        result.denied += 1;
        try {
          await options.store.retry({
            lease,
            error: decision.reason ?? "cost cap denied",
            delayMs: Math.max(0, pollIntervalMs),
            now: now(),
          });
        } catch (error) {
          report(error, "tick", lease.leaseKey);
        }
        await finish({ outcome: "cost_cap_denied", error: decision.reason });
        return;
      }
    }

    const controller = new AbortController();
    let renewalTimer: ReturnType<typeof setInterval> | null = null;
    if (renewEveryMs > 0) {
      renewalTimer = setInterval(() => {
        void options.store
          .renew({ lease, ttlMs: renewTtlMs, now: now() })
          .then((renewed) => {
            if (!renewed) controller.abort(new Error("agent lease lost"));
          })
          .catch((error) => {
            report(error, "renew", lease.leaseKey);
            controller.abort(new Error("agent lease lost"));
          });
      }, renewEveryMs);
      renewalTimer.unref?.();
    }

    try {
      let workResult: AgentWorkResult | undefined;
      try {
        workResult = await options.work({
          lease,
          agentId: options.agentId,
          orgId: lease.orgId ?? "",
          task: lease.task,
          scopes,
          attempt,
          maxAttempts,
          signal: controller.signal,
        });
        if (controller.signal.aborted) throw controller.signal.reason ?? new Error("agent lease lost");
      } catch (error) {
        const message = toErrorMessage(error);
        result.failed += 1;
        if (attempt >= maxAttempts) {
          await options.store.deadLetter({ lease, error: message, now: now() });
          result.deadLettered += 1;
          await finish({ outcome: "dead_letter", error: message });
        } else {
          const delayMs = backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
          await options.store.retry({ lease, error: message, delayMs, now: now() });
          result.retried += 1;
          await finish({ outcome: "failure", error: message });
        }
        return;
      }

      try {
        await options.store.release({ lease, now: now() });
        result.completed += 1;
        await finish({
          outcome: "success",
          model: workResult?.model ?? null,
          promptVersion: workResult?.promptVersion ?? null,
          inputTokens: workResult?.inputTokens ?? null,
          outputTokens: workResult?.outputTokens ?? null,
          costCents: workResult?.costCents ?? null,
        });
      } catch (error) {
        report(error, "tick", lease.leaseKey);
        await finish({ outcome: "failure", error: toErrorMessage(error) });
      }
    } finally {
      if (renewalTimer) clearInterval(renewalTimer);
    }
  }

  async function tick(): Promise<AgentLoopTickResult> {
    const result = emptyTick();
    if (ticking) return result;
    ticking = true;
    try {
      if (options.killSwitch && (await options.killSwitch(options.agentId))) return result;
      const leases = await options.store.due({ agentId: options.agentId, now: now(), limit: 10 });
      result.due = leases.length;
      for (const lease of leases) {
        if (activeKeys.has(lease.leaseKey)) continue;
        const acquired = await options.store.acquire({
          agentId: options.agentId,
          leaseKey: lease.leaseKey,
          ttlMs: leaseTtlMs,
          now: now(),
        });
        if (!acquired) continue;
        activeKeys.add(acquired.leaseKey);
        result.acquired += 1;
        try {
          await execute(acquired, result);
        } catch (error) {
          report(error, "tick", acquired.leaseKey);
        } finally {
          activeKeys.delete(acquired.leaseKey);
        }
      }
      return result;
    } finally {
      ticking = false;
    }
  }

  return {
    get running() {
      return timer !== null;
    },
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void tick().catch((error) => report(error, "tick"));
      }, Math.max(1, pollIntervalMs));
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick,
  };
}
