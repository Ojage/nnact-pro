"use client";

import { useSyncExternalStore } from "react";
import { parseAgentOfficeEvent, type AgentOfficeEvent } from "@nnact/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";
export const AGENT_OFFICE_STREAM_URL = `${API_BASE}/api/agent-office/stream`;

/** How long to stay on polling before trying the live stream again. */
export const STREAM_RETRY_FROM_POLLING_MS = 60_000;
/** Consecutive stream errors before falling back to polling. */
export const STREAM_ERRORS_BEFORE_POLLING = 3;
/** Polling interval used while the live stream is unavailable. */
export const AGENT_OFFICE_POLL_MS = 15_000;

export type AgentOfficeConnection = "idle" | "connecting" | "live" | "reconnecting" | "polling";

type EventListener = (event: AgentOfficeEvent) => void;
type StateListener = (state: AgentOfficeConnection, previous: AgentOfficeConnection) => void;

/**
 * One EventSource for the whole page, shared by every cache entry that wants
 * live updates. It opens with the first subscriber and closes with the last.
 *
 * Auth rides on the httpOnly session cookie (`withCredentials`), so no token
 * ever appears in the URL. The browser reconnects on its own and resends
 * `Last-Event-ID`; after repeated failures we close it, report `polling`, and
 * try the stream again later.
 */
class AgentOfficeStream {
  private readonly listeners = new Set<EventListener>();
  private readonly stateListeners = new Set<StateListener>();
  private source: EventSource | null = null;
  private errors = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private state: AgentOfficeConnection = "idle";

  constructor(private readonly url: string) {}

  getState = (): AgentOfficeConnection => this.state;

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.open();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.close();
    };
  }

  watch = (listener: StateListener): (() => void) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };

  private setState(next: AgentOfficeConnection) {
    if (next === this.state) return;
    const previous = this.state;
    this.state = next;
    for (const listener of this.stateListeners) listener(next, previous);
  }

  private open() {
    this.clearRetry();
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      this.setState("polling");
      return;
    }
    const source = new EventSource(this.url, { withCredentials: true });
    this.source = source;
    this.setState(this.errors > 0 ? "reconnecting" : "connecting");
    source.onopen = () => {
      this.errors = 0;
      this.setState("live");
    };
    source.onmessage = (message) => {
      const event = parseAgentOfficeEvent(message.data);
      if (!event) return;
      for (const listener of this.listeners) listener(event);
    };
    source.onerror = () => {
      this.errors += 1;
      if (source.readyState === EventSource.CLOSED || this.errors >= STREAM_ERRORS_BEFORE_POLLING) {
        this.fallBackToPolling();
      } else {
        this.setState("reconnecting");
      }
    };
  }

  private fallBackToPolling() {
    this.source?.close();
    this.source = null;
    this.setState("polling");
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      if (this.listeners.size > 0) this.open();
    }, STREAM_RETRY_FROM_POLLING_MS);
  }

  private close() {
    this.clearRetry();
    this.source?.close();
    this.source = null;
    this.errors = 0;
    this.setState("idle");
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

export const agentOfficeStream = new AgentOfficeStream(AGENT_OFFICE_STREAM_URL);

const subscribeState = (onChange: () => void) => agentOfficeStream.watch(() => onChange());
const serverState = (): AgentOfficeConnection => "idle";

/** Current live-connection state, for the top bar and for polling decisions. */
export function useAgentOfficeConnection(): AgentOfficeConnection {
  return useSyncExternalStore(subscribeState, agentOfficeStream.getState, serverState);
}
