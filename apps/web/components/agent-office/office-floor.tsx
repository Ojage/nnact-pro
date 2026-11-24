"use client";

import { memo, useId } from "react";
import Link from "next/link";
import { FileText, Inbox, ReceiptText, Route } from "lucide-react";
import { describeCurrentTask, type AgentApprovalDeskDTO, type AgentRoomDTO } from "@nnact/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_LABEL } from "@/lib/agent-office/format";
import { CostMeter, Sparkline, StatusLamp } from "./office-bits";
import styles from "./office.module.css";

function DeskArt({ occupied }: { occupied: boolean }) {
  return (
    <svg className={styles.desk} viewBox="0 0 68 48" aria-hidden="true">
      <rect className={styles.deskTop} x="6" y="4" width="50" height="22" rx="3" />
      <rect className={styles.screen} x="20" y="8" width="22" height="5" rx="1.5" />
      <circle className={styles.chair} cx="31" cy="38" r="8" />
      {occupied ? <circle className={styles.occupant} cx="31" cy="36" r="5" /> : null}
    </svg>
  );
}

export const OfficeRoom = memo(function OfficeRoom({
  room,
  onOpen,
}: {
  room: AgentRoomDTO;
  onOpen: (agentId: string) => void;
}) {
  const id = useId();
  const nameId = `${id}-name`;
  const detailId = `${id}-detail`;

  if (room.stage !== "live") {
    return (
      <li>
        <button
          type="button"
          className={`${styles.room} ${styles.vacant}`}
          aria-labelledby={nameId}
          aria-describedby={detailId}
          onClick={() => onOpen(room.id)}
        >
          <span className={styles.roomHead}>
            <span>
              <span id={nameId} className={styles.nameplate}>
                {room.displayName}
              </span>
              <span className={styles.tier}>{room.tier}</span>
            </span>
            <DeskArt occupied={false} />
          </span>
          <span id={detailId} className={styles.vacantSign}>
            Vacant · {STAGE_LABEL[room.stage]}
          </span>
        </button>
      </li>
    );
  }

  const task = describeCurrentTask(room.current);
  const occupied = room.status !== "offline" && room.status !== "paused";
  return (
    <li>
      <button
        type="button"
        className={styles.room}
        data-status={room.status}
        aria-labelledby={nameId}
        aria-describedby={detailId}
        onClick={() => onOpen(room.id)}
      >
        <span className={styles.roomHead}>
          <span>
            <span id={nameId} className={styles.nameplate}>
              {room.displayName}
            </span>
            <span className={styles.tier}>{room.tier}</span>
          </span>
          <DeskArt occupied={occupied} />
        </span>
        <span id={detailId} className="grid gap-1">
          <StatusLamp status={room.status} />
          <span className={`${styles.task} ${task ? "" : styles.taskIdle}`}>{task ?? "Nothing in progress"}</span>
        </span>
        <Sparkline values={room.activity} />
        <CostMeter spentCents={room.costTodayCents} capCents={room.costCapCents} />
        <span className={styles.roomFoot}>
          <span className={styles.queue}>{room.queueDepth} queued</span>
          <span>
            {room.runsToday} runs · {room.errorsToday} errors today
          </span>
        </span>
      </button>
    </li>
  );
});

const APPROVALS = [
  { key: "draftJobs", href: "/agent/drafts", label: "Draft jobs to review", icon: Inbox },
  { key: "quoteProposals", href: "/agent/quotes", label: "Quote proposals to approve", icon: ReceiptText },
  { key: "dispatchSuggestions", href: "/dispatch", label: "Dispatch suggestions", icon: Route },
] as const;

export function ApprovalDesk({ approvals }: { approvals: AgentApprovalDeskDTO }) {
  const headingId = useId();
  return (
    <section className={styles.approvalDesk} aria-labelledby={headingId}>
      <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-fg">
        <FileText size={16} aria-hidden="true" />
        Human approval desk
      </h2>
      <ul className={styles.approvalItems}>
        {APPROVALS.map(({ key, href, label, icon: Icon }) => (
          <li key={key}>
            <Link className={styles.approvalLink} href={href}>
              <span className="flex items-center gap-2 text-sm">
                <Icon size={16} aria-hidden="true" />
                {label}
              </span>
              <span className={styles.approvalCount}>{approvals[key]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OfficeFloor({
  rooms,
  approvals,
  onOpen,
}: {
  rooms: readonly AgentRoomDTO[];
  approvals: AgentApprovalDeskDTO;
  onOpen: (agentId: string) => void;
}) {
  return (
    <div className={styles.floor}>
      <ul className={styles.rooms} role="list" aria-label="Agent offices">
        {rooms.map((room) => (
          <OfficeRoom key={room.id} room={room} onOpen={onOpen} />
        ))}
      </ul>
      <ApprovalDesk approvals={approvals} />
    </div>
  );
}

/** Same information as the floor plan, as a table. Default on small screens. */
export function OfficeList({
  rooms,
  approvals,
  onOpen,
}: {
  rooms: readonly AgentRoomDTO[];
  approvals: AgentApprovalDeskDTO;
  onOpen: (agentId: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Agents and what each is doing now</caption>
          <thead className="bg-secondary text-xs text-fg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Agent</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Now</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Queue</th>
              <th scope="col" className="px-3 py-2 font-medium">Cost today</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Runs today</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    className="min-h-6 text-left text-fg underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                    onClick={() => onOpen(room.id)}
                  >
                    {room.displayName}
                  </button>
                  <span className="ml-2 text-xs font-normal text-fg-muted">{room.tier}</span>
                </th>
                <td className="px-3 py-2">
                  {room.stage === "live" ? <StatusLamp status={room.status} /> : <span className="text-fg-muted">Vacant · {STAGE_LABEL[room.stage]}</span>}
                </td>
                <td className="px-3 py-2">{room.stage === "live" ? (describeCurrentTask(room.current) ?? "Nothing in progress") : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{room.queueDepth}</td>
                <td className="px-3 py-2">
                  <CostMeter spentCents={room.costTodayCents} capCents={room.costCapCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{room.runsToday}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ApprovalDesk approvals={approvals} />
    </div>
  );
}

export function OfficeSkeleton() {
  return (
    <div className={styles.floor} aria-hidden="true">
      <div className={styles.rooms}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[13.5rem] rounded-md" />
        ))}
      </div>
    </div>
  );
}
