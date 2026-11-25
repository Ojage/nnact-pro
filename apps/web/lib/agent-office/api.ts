"use client";

import {
  AGENT_OFFICE_UI_THROTTLE_MS,
  agentDetailSchema,
  agentLogsResponseSchema,
  agentOfficeOverviewSchema,
  agentRunDetailSchema,
  agentRunsPageSchema,
  type AgentDetailDTO,
  type AgentLogLineDTO,
  type AgentOfficeOverviewDTO,
  type AgentRunDetailDTO,
  type AgentRunsPageDTO,
  type AgentRunStepDTO,
} from "@nnact/shared";
import { apiSlice } from "@/lib/redux/api";
import {
  appendCapped,
  applyOverviewBatch,
  applyRunUpdates,
  createLineBuffer,
  createOverviewBuffer,
  startThrottledFlush,
} from "./buffer";
import { agentOfficeStream } from "./stream";

const BASE = "/api/agent-office";

export interface AgentControlArgs {
  agentId: string;
  reason: string;
}

export interface AgentProcessResult {
  ok: true;
  pid?: number;
  started?: boolean;
  /** True when workers run as a server service (production): the action resumed the agent. */
  managed?: boolean;
}

export interface RevealedRunContent {
  input: unknown;
  output: unknown;
  revealedAt: string;
}

const officeApi = apiSlice.enhanceEndpoints({ addTagTypes: ["AgentOffice", "AgentOfficeRuns"] }).injectEndpoints({
  endpoints: (builder) => ({
    agentOfficeOverview: builder.query<AgentOfficeOverviewDTO, void>({
      query: () => `${BASE}/overview`,
      transformResponse: (raw: unknown) => agentOfficeOverviewSchema.parse(raw),
      providesTags: ["AgentOffice"],
      async onCacheEntryAdded(_arg, { updateCachedData, cacheDataLoaded, cacheEntryRemoved, dispatch }) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }
        const buffer = createOverviewBuffer();
        const unsubscribe = agentOfficeStream.subscribe((event) => {
          buffer.push(event);
        });
        // After a gap in the stream, resync once rather than trust partial history.
        const unwatch = agentOfficeStream.watch((state, previous) => {
          if (state === "live" && (previous === "reconnecting" || previous === "polling")) {
            dispatch(officeApi.util.invalidateTags(["AgentOffice"]));
          }
        });
        const stop = startThrottledFlush(() => {
          const batch = buffer.drain();
          if (batch) updateCachedData((draft) => applyOverviewBatch(draft, batch));
        }, AGENT_OFFICE_UI_THROTTLE_MS);
        await cacheEntryRemoved;
        stop();
        unwatch();
        unsubscribe();
      },
    }),

    agentOfficeAgent: builder.query<AgentDetailDTO, string>({
      query: (agentId) => `${BASE}/agents/${encodeURIComponent(agentId)}`,
      transformResponse: (raw: unknown) => agentDetailSchema.parse(raw),
      providesTags: ["AgentOffice"],
    }),

    agentOfficeRuns: builder.infiniteQuery<AgentRunsPageDTO, string, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
      query: ({ queryArg, pageParam }) => {
        const cursor = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : "";
        return `${BASE}/agents/${encodeURIComponent(queryArg)}/runs${cursor}`;
      },
      transformResponse: (raw: unknown) => agentRunsPageSchema.parse(raw),
      providesTags: ["AgentOfficeRuns"],
    }),

    agentOfficeRun: builder.query<AgentRunDetailDTO, string>({
      query: (runId) => `${BASE}/runs/${encodeURIComponent(runId)}`,
      transformResponse: (raw: unknown) => agentRunDetailSchema.parse(raw),
      providesTags: ["AgentOfficeRuns"],
      async onCacheEntryAdded(runId, { updateCachedData, cacheDataLoaded, cacheEntryRemoved }) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }
        const steps = createLineBuffer<AgentRunStepDTO>();
        const logs = createLineBuffer<AgentLogLineDTO>();
        const unsubscribe = agentOfficeStream.subscribe((event) => {
          if (event.type === "step" && event.step.runId === runId) steps.push(event.step);
          if (event.type === "log" && event.line.runId === runId) logs.push(event.line);
        });
        const stop = startThrottledFlush(() => {
          const nextSteps = steps.drain();
          const nextLogs = logs.drain();
          if (nextSteps.length || nextLogs.length) {
            updateCachedData((draft) => applyRunUpdates(draft, nextSteps, nextLogs));
          }
        }, AGENT_OFFICE_UI_THROTTLE_MS);
        await cacheEntryRemoved;
        stop();
        unsubscribe();
      },
    }),

    agentOfficeLogs: builder.query<AgentLogLineDTO[], string>({
      query: (agentId) => `${BASE}/agents/${encodeURIComponent(agentId)}/logs?limit=500`,
      transformResponse: (raw: unknown) => agentLogsResponseSchema.parse(raw).lines,
      async onCacheEntryAdded(agentId, { updateCachedData, cacheDataLoaded, cacheEntryRemoved }) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }
        const lines = createLineBuffer<AgentLogLineDTO>();
        const unsubscribe = agentOfficeStream.subscribe((event) => {
          if (event.type === "log" && event.line.agentId === agentId) lines.push(event.line);
        });
        const stop = startThrottledFlush(() => {
          const next = lines.drain();
          if (next.length) updateCachedData((draft) => appendCapped(draft, next));
        }, AGENT_OFFICE_UI_THROTTLE_MS);
        await cacheEntryRemoved;
        stop();
        unsubscribe();
      },
    }),

    pauseAgent: builder.mutation<{ ok: true }, AgentControlArgs>({
      query: ({ agentId, reason }) => ({
        url: `${BASE}/agents/${encodeURIComponent(agentId)}/pause`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["AgentOffice"],
    }),

    resumeAgent: builder.mutation<{ ok: true }, AgentControlArgs>({
      query: ({ agentId, reason }) => ({
        url: `${BASE}/agents/${encodeURIComponent(agentId)}/resume`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["AgentOffice"],
    }),

    startAgent: builder.mutation<AgentProcessResult, string>({
      query: (agentId) => ({
        url: `${BASE}/agents/${encodeURIComponent(agentId)}/start`,
        method: "POST",
      }),
      invalidatesTags: ["AgentOffice"],
    }),

    restartAgent: builder.mutation<AgentProcessResult, string>({
      query: (agentId) => ({
        url: `${BASE}/agents/${encodeURIComponent(agentId)}/restart`,
        method: "POST",
      }),
      invalidatesTags: ["AgentOffice"],
    }),

    retryAgentRun: builder.mutation<{ ok: true; runId: string }, string>({
      query: (runId) => ({ url: `${BASE}/runs/${encodeURIComponent(runId)}/retry`, method: "POST" }),
      invalidatesTags: ["AgentOfficeRuns"],
    }),

    /** Owner-only and audit-logged on the server. Never cached. */
    revealAgentRun: builder.mutation<RevealedRunContent, string>({
      query: (runId) => ({ url: `${BASE}/runs/${encodeURIComponent(runId)}/reveal`, method: "POST" }),
    }),
  }),
});

export const {
  useAgentOfficeOverviewQuery,
  useAgentOfficeAgentQuery,
  useAgentOfficeRunsInfiniteQuery,
  useAgentOfficeRunQuery,
  useAgentOfficeLogsQuery,
  usePauseAgentMutation,
  useResumeAgentMutation,
  useStartAgentMutation,
  useRestartAgentMutation,
  useRetryAgentRunMutation,
  useRevealAgentRunMutation,
} = officeApi;
