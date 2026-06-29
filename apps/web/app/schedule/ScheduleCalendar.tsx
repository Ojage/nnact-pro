"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api } from "../../lib/api";
import type { JobDTO, CustomerDTO, UserDTO, RecurringJobDTO, JobStatus } from "@ofp/shared";
import { JOB_STATUS, formatMoney } from "@ofp/shared";
import { parseRRule, expandRRule } from "../../lib/rrule";

type ViewMode = "week" | "day" | "month" | "tech" | "workweek";

interface DayJobs {
  date: Date;
  key: string;
  label: string;
  jobs: JobDTO[];
  isToday: boolean;
  isCurrentMonth: boolean;
}

interface DragState {
  job: JobDTO;
  sourceKey: string; /* empty for unscheduled → scheduled */
  pointerId: number;
  offsetX: number;
  offsetY: number;
  clientX: number;
  clientY: number;
  width: number;
}

interface TechColumn {
  userId: string;
  userName: string;
  dayJobMap: Map<string, JobDTO[]>; /* dayKey → jobs */
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayIndex(d: Date): number {
  return d.getDay() === 0 ? 6 : d.getDay() - 1;
}

function changeDate(sourceIso: string | null | undefined, targetDate: Date): string {
  const src = sourceIso ? new Date(sourceIso) : new Date();
  const out = new Date(targetDate);
  out.setHours(src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds());
  return out.toISOString();
}

function keyToDate(key: string): Date {
  return new Date(key + "T12:00:00");
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isActive(j: JobDTO): boolean {
  return j.status === "scheduled" || j.status === "in_progress";
}

const DRAG_THRESHOLD = 5;

/* ponytail: default job duration = 60 min since JobDTO has no duration field.
   Ceiling: all jobs render as 60-min blocks; real durations vary.
   Upgrade: read startsAt/endsAt from the appointments table for true durations. */
const DEFAULT_DURATION_MIN = 60;
const SLOT_HEIGHT_PX = 80;

/* ponytail: tech avatar colors are hardcoded 10-color palette.  Ceiling: >10 techs will
   have duplicate colors.  Upgrade: hash userId to HSL hue for unlimited techs. */
const TECH_COLORS = [
  "#5b76e0", "#e05b76", "#5be0c8", "#e0c85b", "#765be0",
  "#76e05b", "#c85be0", "#e0765b", "#5bc8e0", "#e05bc8",
];

const STATUS_CYCLE: Record<JobStatus, JobStatus> = {
  scheduled: "in_progress",
  in_progress: "completed",
  completed: "scheduled",
  lead: "scheduled",
  canceled: "scheduled",
};

/* ── component ────────────────────────────────────────────────────────────── */
export default function ScheduleCalendar() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [recurringTemplates, setRecurringTemplates] = useState<RecurringJobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(true);

  const [undoToast, setUndoToast] = useState<{ key: string; title: string } | null>(null);

  /* tech assignment dropdown state */
  const [assignMenuJobId, setAssignMenuJobId] = useState<string | null>(null);
  const assignMenuPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /* ── new feature state ───────────────────────────────────────────────── */
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  /* multi-select */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const lastClickJobId = useRef<string | null>(null);

  /* right-click context menu */
  const [ctxMenuJobId, setCtxMenuJobId] = useState<string | null>(null);
  const ctxMenuPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /* filter sidebar */
  const [showFilters, setShowFilters] = useState(false);
  const [filterTechIds, setFilterTechIds] = useState<Set<string>>(new Set());
  const [filterStatuses, setFilterStatuses] = useState<Set<JobStatus>>(new Set());

  /* per-job duration overrides (day view resize) */
  const jobDurations = useRef<Map<string, number>>(new Map());

  /* resize drag state */
  const [resizeDrag, setResizeDrag] = useState<{ jobId: string; startY: number; startDur: number } | null>(null);

  /* ── DnD + hover state ────────────────────────────────────────────────── */
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const updatingJobIds = useRef<Set<string>>(new Set());
  const [updatingFlash, setUpdatingFlash] = useState<string | null>(null);
  const dragMoved = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /* undo stack for drag-and-drop reschedules */
  interface UndoEntry { jobId: string; oldIso: string | null; newIso: string; title: string }
  const undoStack = useRef<UndoEntry[]>([]);
  const MAX_UNDO = 20;

  const searchInputRef = useRef<HTMLInputElement>(null);

  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const hoverPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* close assign menu on outside click */
  useEffect(() => {
    if (!assignMenuJobId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".sched-assign-menu")) setAssignMenuJobId(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [assignMenuJobId]);

  /* close context menu on outside click */
  useEffect(() => {
    if (!ctxMenuJobId) return;
    const onDown = () => setCtxMenuJobId(null);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [ctxMenuJobId]);

  /* close detail modal on Escape */
  useEffect(() => {
    if (!detailJobId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setDetailJobId(null); setEditing(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailJobId]);

  /* resize drag: global move/up listeners */
  useEffect(() => {
    if (!resizeDrag) return;
    const onMove = (e: PointerEvent) => {
      const dy = e.clientY - resizeDrag.startY;
      const newMin = Math.max(15, resizeDrag.startDur + Math.round(dy / SLOT_HEIGHT_PX * 60));
      jobDurations.current.set(resizeDrag.jobId, newMin);
      /* force re-render via a no-op state tick to update block heights */
      setJobs((prev) => [...prev]);
    };
    const onUp = () => setResizeDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizeDrag]);

  /* fetch jobs + customers + users once */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [jobData, custData, userData, recData] = await Promise.all([
          api.jobs(), api.customers(), api.users(), api.recurring(),
        ]);
        if (!cancelled) { setJobs(jobData); setCustomers(custData); setUsers(userData); setRecurringTemplates(recData); }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const customersById = useMemo(() => {
    const map = new Map<string, CustomerDTO>();
    for (const c of customers) map.set(c.id, c);
    return map;
  }, [customers]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserDTO>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  /* active tech users for filter sidebar and assign menu */
  const techUsers = useMemo(
    () => users.filter((u) => u.role === "technician" || u.role === "dispatcher"),
    [users],
  );

  /* recurring instance expansion */
  const isRecurringInstance = useCallback((id: string) => id.startsWith("rec-"), []);

  const jobsByDate = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map = new Map<string, JobDTO[]>();
    const addJobs = (arr: JobDTO[]) => {
      for (const j of arr) {
        if (j.scheduledAt && isActive(j)) {
          /* filter by tech */
          if (filterTechIds.size > 0) {
            if (!j.assignedTo || !filterTechIds.has(j.assignedTo)) continue;
          }
          /* filter by status */
          if (filterStatuses.size > 0) {
            if (!filterStatuses.has(j.status)) continue;
          }
          if (q) {
            const name = customersById.get(j.customerId)?.name?.toLowerCase() ?? "";
            const dk = fmtDateKey(new Date(j.scheduledAt));
            if (!j.title.toLowerCase().includes(q) && !name.includes(q) && !dk.includes(q)) continue;
          }
          const key = fmtDateKey(new Date(j.scheduledAt));
          const list = map.get(key);
          if (list) list.push(j);
          else map.set(key, [j]);
        }
      }
    };
    addJobs(jobs);
    /* expand recurring templates into virtual instances */
    if (recurringTemplates.length > 0) {
      const rangeStart = addDays(cursor, -14);
      const rangeEnd = addDays(cursor, 60);
      let instCounter = 0;
      const virtualJobs: JobDTO[] = [];
      for (const t of recurringTemplates) {
        if (!t.active) continue;
        const parsed = t.rrule ? parseRRule(t.rrule) : null;
        if (!parsed) continue;
        const startDate = new Date(t.nextRunAt);
        const occurrences = expandRRule(parsed, startDate, rangeStart, rangeEnd);
        for (const occ of occurrences) {
          const vId = `rec-${t.id}-${instCounter++}`;
          /* apply scheduledTime if set */
          if (t.scheduledTime) {
            const [h, m] = t.scheduledTime.split(":").map(Number);
            occ.setHours(h, m, 0, 0);
          }
          virtualJobs.push({
            id: vId,
            customerId: t.customerId,
            title: t.title,
            status: "scheduled" as JobStatus,
            scheduledAt: occ.toISOString(),
            assignedTo: null,
            total: 0,
            createdAt: t.createdAt,
          });
        }
      }
      addJobs(virtualJobs);
    }
    return map;
  }, [jobs, recurringTemplates, cursor, searchQuery, customersById, filterTechIds, filterStatuses]);

  /* unscheduled jobs (no date, active only, respecting search + filters) */
  const unscheduledJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((j) => {
      if (j.scheduledAt) return false;
      if (!isActive(j)) return false;
      if (filterTechIds.size > 0) {
        if (!j.assignedTo || !filterTechIds.has(j.assignedTo)) return false;
      }
      if (filterStatuses.size > 0) {
        if (!filterStatuses.has(j.status)) return false;
      }
      if (q) {
        const name = customersById.get(j.customerId)?.name?.toLowerCase() ?? "";
        if (!j.title.toLowerCase().includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, searchQuery, customersById, filterTechIds, filterStatuses]);

  /* tech view: columns grouped by assigned technician */
  const techColumns: TechColumn[] = useMemo(() => {
    if (view !== "tech") return [];
    const mon = startOfWeek(cursor);
    const weekKeys = Array.from({ length: 7 }, (_, i) => fmtDateKey(addDays(mon, i)));

    const techMap = new Map<string, { name: string; dayMap: Map<string, JobDTO[]> }>();
    techMap.set("__unassigned", { name: "Unassigned", dayMap: new Map() });

    for (const key of weekKeys) {
      const dayJobs = jobsByDate.get(key) ?? [];
      for (const j of dayJobs) {
        const tid = j.assignedTo || "__unassigned";
        let entry = techMap.get(tid);
        if (!entry) {
          entry = { name: usersById.get(tid)?.name ?? "Unknown", dayMap: new Map() };
          techMap.set(tid, entry);
        }
        const list = entry.dayMap.get(key) ?? [];
        list.push(j);
        entry.dayMap.set(key, list);
      }
    }

    const result: TechColumn[] = [];
    const unassigned = techMap.get("__unassigned")!;
    result.push({ userId: "__unassigned", userName: "Unassigned", dayJobMap: unassigned.dayMap });
    for (const [uid, entry] of techMap) {
      if (uid === "__unassigned") continue;
      result.push({ userId: uid, userName: entry.name, dayJobMap: entry.dayMap });
    }
    result.sort((a, b) => {
      if (a.userId === "__unassigned") return -1;
      if (b.userId === "__unassigned") return 1;
      return a.userName.localeCompare(b.userName);
    });
    return result;
  }, [view, cursor, jobsByDate, usersById]);

  /* ── shared reschedule logic ──────────────────────────────────────────── */
  const moveJob = useCallback(
    async (jobId: string, sourceKey: string, targetKey: string) => {
      if (sourceKey === targetKey) return;
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;

      const newIso = changeDate(job.scheduledAt, keyToDate(targetKey));

      const idx = undoStack.current.push({
        jobId, oldIso: job.scheduledAt ?? null, newIso, title: job.title || "Untitled",
      }) - 1;
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, scheduledAt: newIso } : j)),
      );
      setUpdatingFlash(targetKey);
      updatingJobIds.current.add(jobId);

      setUndoToast({ key: `move-${Date.now()}`, title: job.title || "Untitled" });

      try {
        await api.patchJob(jobId, { scheduledAt: newIso });
      } catch {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, scheduledAt: job.scheduledAt ?? null } : j,
          ),
        );
        undoStack.current.splice(idx, 1);
      } finally {
        updatingJobIds.current.delete(jobId);
        setTimeout(() => setUpdatingFlash(null), 400);
      }
    },
    [jobs],
  );

  /* assign a tech to a job */
  const assignTech = useCallback(async (jobId: string | null, userId: string | null) => {
    if (!jobId) return;
    const job = jobs.find((j) => j.id === jobId);
    const prevAssignedTo: string | null = job?.assignedTo ?? null;
    setAssignMenuJobId(null);
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, assignedTo: userId } : j)),
    );
    try {
      await api.patchJob(jobId, { assignedTo: userId });
    } catch {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, assignedTo: prevAssignedTo } : j,
        ),
      );
    }
  }, [jobs]);

  /* cycle job status inline */
  const cycleStatus = useCallback(async (jobId: string, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const nextStatus = STATUS_CYCLE[job.status];
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: nextStatus } : j)),
    );
    try {
      await api.patchJob(jobId, { status: nextStatus });
    } catch {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: job.status } : j)),
      );
    }
  }, [jobs]);

  /* update job title */
  const updateTitle = useCallback(async (jobId: string, title: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || title === job.title) return;
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, title } : j)),
    );
    try {
      await api.patchJob(jobId, { title });
    } catch {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, title: job.title } : j)),
      );
    }
  }, [jobs]);

  /* multi-select toggle */
  const toggleSelect = useCallback((jobId: string, shiftKey: boolean) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickJobId.current) {
        /* range select: find all job IDs between last click and this one in the current view */
        const allVisibleIds: string[] = [];
        for (const [, dayJobs] of jobsByDate) {
          for (const j of dayJobs) allVisibleIds.push(j.id);
        }
        for (const j of unscheduledJobs) allVisibleIds.push(j.id);
        const a = allVisibleIds.indexOf(lastClickJobId.current);
        const b = allVisibleIds.indexOf(jobId);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(allVisibleIds[i]);
        }
      } else {
        if (next.has(jobId)) next.delete(jobId);
        else next.add(jobId);
      }
      lastClickJobId.current = jobId;
      return next;
    });
  }, [jobsByDate, unscheduledJobs]);

  /* batch reschedule all selected jobs */
  const batchReschedule = useCallback(async (targetKey: string) => {
    const ids = [...selectedJobIds];
    if (ids.length === 0) return;
    setSelectedJobIds(new Set());
    setSelectMode(false);
    for (const jobId of ids) {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) continue;
      const sourceKey = job.scheduledAt ? fmtDateKey(new Date(job.scheduledAt)) : "";
      await moveJob(jobId, sourceKey, targetKey);
    }
  }, [selectedJobIds, jobs, moveJob]);

  /* batch assign all selected jobs */
  const batchAssign = useCallback(async (userId: string | null) => {
    const ids = [...selectedJobIds];
    if (ids.length === 0) return;
    setSelectedJobIds(new Set());
    setSelectMode(false);
    for (const jobId of ids) await assignTech(jobId, userId);
  }, [selectedJobIds, assignTech]);

  /* undo the most recent move */
  const undoMove = useCallback(async () => {
    const entry = undoStack.current.pop();
    if (!entry) return;

    const { jobId, oldIso } = entry;
    const revertIso = oldIso ?? null;
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, scheduledAt: revertIso } : j)),
    );
    try {
      await api.patchJob(jobId, { scheduledAt: revertIso });
    } catch {
      undoStack.current.push(entry);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, scheduledAt: entry.newIso } : j)),
      );
      return;
    }
    const next = undoStack.current[undoStack.current.length - 1];
    if (next) setUndoToast({ key: `move-${Date.now()}`, title: next.title });
  }, []);

  /* ── pointer event handlers ───────────────────────────────────────────── */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>, job: JobDTO) => {
      if (e.button !== 0) return;
      const sourceKey = job.scheduledAt ? fmtDateKey(new Date(job.scheduledAt)) : "";
      const rect = e.currentTarget.getBoundingClientRect();
      dragMoved.current = false;
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);

      setDrag({
        job,
        sourceKey,
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        clientX: e.clientX,
        clientY: e.clientY,
        width: rect.width,
      });
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      if (!dragMoved.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
        return;
      }
      dragMoved.current = true;

      setDrag((prev) =>
        prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null,
      );

      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      const dayCell = targetEl?.closest("[data-day-key]") as HTMLElement | null;
      setDropTargetKey(dayCell ? dayCell.getAttribute("data-day-key") : null);
    },
    [drag],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return;

      if (dragMoved.current) {
        e.preventDefault();
      }

      e.currentTarget.releasePointerCapture(e.pointerId);

      if (dragMoved.current && dropTargetKey) {
        /* in multi-select mode with the dragged job selected, reschedule all selected */
        if (selectMode && selectedJobIds.has(drag.job.id) && selectedJobIds.size > 1) {
          batchReschedule(dropTargetKey);
        } else {
          moveJob(drag.job.id, drag.sourceKey, dropTargetKey);
        }
      }

      setDrag(null);
      setDropTargetKey(null);
      dragMoved.current = false;
    },
    [drag, dropTargetKey, moveJob, selectMode, selectedJobIds, batchReschedule],
  );

  /* ── hover handlers ──────────────────────────────────────────────────── */
  const onChipMouseEnter = useCallback((e: React.MouseEvent, jobId: string) => {
    if (dragMoved.current) return;
    if (hoverTimeout.current) { clearTimeout(hoverTimeout.current); hoverTimeout.current = null; }
    hoverPos.current = { x: e.clientX, y: e.clientY };
    setHoveredJobId(jobId);
  }, []);

  const onChipMouseLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setHoveredJobId(null), 120);
  }, []);

  useEffect(() => {
    return () => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); };
  }, []);

  /* auto-dismiss undo toast after 7s */
  useEffect(() => {
    if (!undoToast) return;
    const id = setTimeout(() => setUndoToast(null), 7000);
    return () => clearTimeout(id);
  }, [undoToast]);

  /* navigation */
  const goToday = useCallback(() => {
    if (view === "day") setCursor(new Date(today));
    else if (view === "week" || view === "tech" || view === "workweek") setCursor(startOfWeek(today));
    else setCursor(startOfMonth(today));
  }, [today, view]);

  const goPrev = useCallback(() => {
    setCursor((c) => {
      if (view === "day") return addDays(c, -1);
      if (view === "week" || view === "tech" || view === "workweek") return addDays(c, -7);
      return new Date(c.getFullYear(), c.getMonth() - 1, 1);
    });
  }, [view]);

  const goNext = useCallback(() => {
    setCursor((c) => {
      if (view === "day") return addDays(c, 1);
      if (view === "week" || view === "tech" || view === "workweek") return addDays(c, 7);
      return new Date(c.getFullYear(), c.getMonth() + 1, 1);
    });
  }, [view]);

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); goPrev(); break;
        case "ArrowRight": e.preventDefault(); goNext(); break;
        case "t": goToday(); break;
        case "w": setView("week"); setCursor(startOfWeek(today)); break;
        case "d": setView("day"); setCursor(new Date(today)); break;
        case "m": setView("month"); setCursor(startOfMonth(today)); break;
        case "e": setView("tech"); setCursor(startOfWeek(today)); break;
        case "f": setView("workweek"); setCursor(startOfWeek(today)); break;
        case "u": setShowUnscheduled((s) => !s); break;
        case "g": setShowFilters((s) => !s); break;
        case "s": setSelectMode((s) => !s); setSelectedJobIds(new Set()); break;
        case "z": if (e.ctrlKey || e.metaKey) { e.preventDefault(); setUndoToast(null); undoMove(); } break;
        case "k": if (e.ctrlKey || e.metaKey) { e.preventDefault(); searchInputRef.current?.focus(); searchInputRef.current?.select(); } break;
        case "/": e.preventDefault(); searchInputRef.current?.focus(); searchInputRef.current?.select(); break;
        case "?": e.preventDefault(); setShowShortcuts((s) => !s); break;
        case "Escape": setShowShortcuts(false); setSelectedDay(null); setAssignMenuJobId(null); setDetailJobId(null); setCtxMenuJobId(null); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, goToday, today, undoMove]);

  /* build day cells */
  const days: DayJobs[] = useMemo(() => {
    if (view === "day") {
      const date = new Date(cursor);
      date.setHours(0, 0, 0, 0);
      const key = fmtDateKey(date);
      return [{
        date, key,
        label: `${WEEKDAY_LABELS[mondayIndex(date)]} ${date.getDate()}`,
        jobs: jobsByDate.get(key) ?? [],
        isToday: sameDay(date, today),
        isCurrentMonth: true,
      }];
    }
    if (view === "week" || view === "workweek") {
      const mon = startOfWeek(cursor);
      const daysCount = view === "workweek" ? 5 : 7;
      return Array.from({ length: daysCount }, (_, i) => {
        const date = addDays(mon, i);
        const key = fmtDateKey(date);
        return {
          date, key,
          label: `${WEEKDAY_LABELS[i]} ${date.getDate()}`,
          jobs: jobsByDate.get(key) ?? [],
          isToday: sameDay(date, today),
          isCurrentMonth: true,
        };
      });
    }
    const monthStart = startOfMonth(cursor);
    const startDay = monthStart.getDay();
    const gridStart = addDays(monthStart, -(startDay === 0 ? 6 : startDay - 1));
    const result: DayJobs[] = [];
    for (let i = 0; i < 42; i++) {
      const date = addDays(gridStart, i);
      const key = fmtDateKey(date);
      result.push({
        date, key,
        label: String(date.getDate()),
        jobs: jobsByDate.get(key) ?? [],
        isToday: sameDay(date, today),
        isCurrentMonth: date.getMonth() === monthStart.getMonth(),
      });
    }
    return result;
  }, [view, cursor, today, jobsByDate]);

  /* header label */
  const headerLabel = useMemo(() => {
    if (view === "day") {
      return `${WEEKDAY_LABELS[mondayIndex(cursor)]}, ${MONTH_NAMES[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`;
    }
    if (view === "week" || view === "tech") {
      const mon = startOfWeek(cursor);
      const sun = addDays(mon, 6);
      const fmt = (d: Date) => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
      return `${fmt(mon)} – ${fmt(sun)}, ${mon.getFullYear()}`;
    }
    if (view === "workweek") {
      const mon = startOfWeek(cursor);
      const fri = addDays(mon, 4);
      const fmt = (d: Date) => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
      return `${fmt(mon)} – ${fmt(fri)}, ${mon.getFullYear()}`;
    }
    return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }, [view, cursor]);

  const activeCount = jobs.filter(isActive).length;
  const filteredJobCount = useMemo(() => days.reduce((sum, d) => sum + d.jobs.length, 0), [days]);
  const showEmptyResult = !loading && !error && searchQuery.trim().length > 0 && filteredJobCount === 0 && unscheduledJobs.length === 0;

  const selectedDayData = useMemo(
    () => (selectedDay ? days.find((d) => d.key === selectedDay) ?? null : null),
    [selectedDay, days],
  );

  const dayJobsByHour = useMemo(() => {
    if (view !== "day" || days.length === 0) return null;
    const day = days[0];
    const hourMap = new Map<number, JobDTO[]>();
    const untimed: JobDTO[] = [];
    for (const j of day.jobs) {
      if (j.scheduledAt) {
        const h = new Date(j.scheduledAt).getHours();
        if (h >= 6 && h <= 22) {
          const list = hourMap.get(h) ?? [];
          list.push(j);
          hourMap.set(h, list);
        } else untimed.push(j);
      } else untimed.push(j);
    }
    return { hourMap, untimed };
  }, [view, days]);

  /* global lane assignment for day-view horizontal staggering */
  const dayJobLanes = useMemo(() => {
    if (view !== "day" || days.length === 0) return null;
    const day = days[0];
    interface TimedJob { id: string; startAbs: number; endAbs: number; lane: number; totalLanes: number }
    const timed: TimedJob[] = [];
    for (const j of day.jobs) {
      if (!j.scheduledAt) continue;
      const d = new Date(j.scheduledAt);
      const dur = jobDurations.current.get(j.id) ?? DEFAULT_DURATION_MIN;
      timed.push({ id: j.id, startAbs: d.getHours() * 60 + d.getMinutes(), endAbs: d.getHours() * 60 + d.getMinutes() + dur, lane: 0, totalLanes: 1 });
    }
    if (timed.length === 0) return null;
    timed.sort((a, b) => a.startAbs - b.startAbs);

    /* greedy lane assignment */
    const laneEnds: number[] = [];
    for (const t of timed) {
      let assigned = false;
      for (let li = 0; li < laneEnds.length; li++) {
        if (laneEnds[li] <= t.startAbs) { laneEnds[li] = t.endAbs; t.lane = li; assigned = true; break; }
      }
      if (!assigned) { t.lane = laneEnds.length; laneEnds.push(t.endAbs); }
    }

    /* per-cluster totalLanes via connected components */
    const n = timed.length;
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (timed[i].endAbs > timed[j].startAbs && timed[j].endAbs > timed[i].startAbs) {
          adj[i].push(j); adj[j].push(i);
        }
      }
    }
    const visited = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const comp: number[] = [];
      const stack = [i];
      visited[i] = true;
      while (stack.length) { const v = stack.pop()!; comp.push(v); for (const nb of adj[v]) { if (!visited[nb]) { visited[nb] = true; stack.push(nb); } } }
      const maxLane = Math.max(...comp.map((idx) => timed[idx].lane));
      for (const idx of comp) timed[idx].totalLanes = maxLane + 1;
    }

    const map = new Map<string, { lane: number; totalLanes: number }>();
    for (const t of timed) map.set(t.id, { lane: t.lane, totalLanes: t.totalLanes });
    return map;
  }, [view, days]);

  const draggedJobId = drag?.job.id ?? null;

  /* detail modal inline-edit state (component-level to avoid hooks-in-IIFE) */
  const [editTitle, setEditTitle] = useState("");
  const [editing, setEditing] = useState(false);

  const hoveredCustomer = useMemo(() => {
    if (!hoveredJobId) return null;
    const job = jobs.find((j) => j.id === hoveredJobId);
    return job ? (customersById.get(job.customerId) ?? null) : null;
  }, [hoveredJobId, jobs, customersById]);

  /* ── double-booking detection ────────────────────────────────────────── */
  const conflictingJobIds = useMemo(() => {
    const conflicts = new Set<string>();
    for (const [, dayJobs] of jobsByDate) {
      const slot = new Map<string, string[]>();
      for (const j of dayJobs) {
        if (!j.scheduledAt || !j.assignedTo) continue;
        const h = new Date(j.scheduledAt).getHours();
        const k = `${j.assignedTo}|${h}`;
        const list = slot.get(k) ?? [];
        list.push(j.id);
        slot.set(k, list);
      }
      for (const [, ids] of slot) {
        if (ids.length > 1) for (const id of ids) conflicts.add(id);
      }
    }
    return conflicts;
  }, [jobsByDate]);

  /* tech color helper */
  const techColor = useCallback((userId: string | null | undefined) => {
    if (!userId) return "var(--muted)";
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    return TECH_COLORS[Math.abs(hash) % TECH_COLORS.length];
  }, []);

  /* detail job lookup — handles both real jobs and virtual recurring instances */
  const detailJob = useMemo(() => {
    if (!detailJobId) return null;
    /* real job lookup first */
    const real = jobs.find((j) => j.id === detailJobId);
    if (real) return real;
    /* virtual recurring instance: extract template info */
    if (detailJobId.startsWith("rec-")) {
      const templateId = detailJobId.slice(4).replace(/-\d+$/, "");
      const template = recurringTemplates.find((t) => t.id === templateId);
      if (template) {
        return {
          id: detailJobId,
          customerId: template.customerId,
          title: template.title,
          status: "scheduled" as JobStatus,
          scheduledAt: null,
          assignedTo: null,
          total: 0,
          createdAt: template.createdAt,
        } satisfies JobDTO;
      }
    }
    return null;
  }, [detailJobId, jobs, recurringTemplates]);

  /* ── render helpers ───────────────────────────────────────────────────── */
  const dayCellClasses = (day: DayJobs): string => {
    const base = (view === "week" || view === "workweek") ? "sched-week-col" : view === "day" ? "sched-day-col" : view === "tech" ? "sched-week-col" : "sched-month-cell";
    return [
      base,
      day.isToday ? "sched-today" : "",
      !day.isCurrentMonth ? "sched-other-month" : "",
      selectedDay === day.key ? "sched-selected-day" : "",
      dropTargetKey === day.key ? "sched-drop-target" : "",
      updatingFlash === day.key ? "sched-drop-flash" : "",
    ].filter(Boolean).join(" ");
  };

  /* shared chip click handler — opens detail modal if not dragged */
  const onChipClick = useCallback((e: React.MouseEvent, jobId: string) => {
    if (dragMoved.current) return;
    if (selectMode) { toggleSelect(jobId, e.shiftKey); return; }
    setDetailJobId(jobId);
  }, [selectMode, toggleSelect]);

  const chipDragProps = (j: JobDTO) => ({
    className: `sched-job-chip ${draggedJobId === j.id ? "sched-dragging" : ""} ${updatingJobIds.current.has(j.id) ? "sched-updating" : ""} ${conflictingJobIds.has(j.id) ? "sched-conflict" : ""} ${selectedJobIds.has(j.id) ? "sched-selected-chip" : ""} ${isRecurringInstance(j.id) ? "sched-recurring-chip" : ""}`,
    style: { color: "inherit", touchAction: "none" } as React.CSSProperties,
    onClick: (e: React.MouseEvent) => onChipClick(e, j.id),
    onPointerDown: isRecurringInstance(j.id) ? undefined : (e: React.PointerEvent<HTMLSpanElement>) => onPointerDown(e, j),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      ctxMenuPos.current = { x: e.clientX, y: e.clientY };
      setCtxMenuJobId(j.id);
    },
    onMouseEnter: (e: React.MouseEvent) => onChipMouseEnter(e, j.id),
    onMouseLeave: onChipMouseLeave,
  });

  const dotDragProps = (j: JobDTO) => ({
    className: `sched-month-dot ${draggedJobId === j.id ? "sched-dragging" : ""} ${isRecurringInstance(j.id) ? "sched-recurring-dot" : ""}`,
    style: { touchAction: "none" } as React.CSSProperties,
    onClick: (e: React.MouseEvent) => { e.preventDefault(); onChipClick(e, j.id); },
    onPointerDown: isRecurringInstance(j.id) ? undefined : (e: React.PointerEvent<HTMLSpanElement>) => onPointerDown(e, j),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      ctxMenuPos.current = { x: e.clientX, y: e.clientY };
      setCtxMenuJobId(j.id);
    },
    onMouseEnter: (e: React.MouseEvent) => onChipMouseEnter(e, j.id),
    onMouseLeave: onChipMouseLeave,
  });

  /* shared chip body (title, customer, tech, meta) */
  const chipBody = (j: JobDTO) => {
    const techUser = j.assignedTo ? usersById.get(j.assignedTo) : null;
    const isRecurring = isRecurringInstance(j.id);
    return (
      <>
        <div className="sched-job-chip-title">
          {isRecurring && <span className="sched-recurring-badge" title="Recurring">🔄</span>}
          {j.title}
        </div>
        <div className="sched-job-chip-customer">{customersById.get(j.customerId)?.name}</div>
        <div className="sched-job-chip-meta">
          <span>{formatMoney(j.total)}</span>
          <span className="sched-job-chip-tech-row">
            {techUser ? (
              <span className="sched-tech-dot" style={{ background: techColor(j.assignedTo) }} />
            ) : (
              <span
                className="sched-tech-dot sched-tech-dot-empty"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  assignMenuPos.current = { x: rect.left, y: rect.bottom + 4 };
                  setAssignMenuJobId(j.id);
                }}
                title="Assign technician"
              >
                +
              </span>
            )}
            {techUser ? (
              <span
                className="sched-tech-name"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  assignMenuPos.current = { x: rect.left, y: rect.bottom + 4 };
                  setAssignMenuJobId(j.id);
                }}
              >
                {techUser.name.split(" ")[0]}
              </span>
            ) : null}
            <span
              className={`badge badge-${j.status} sched-job-chip-badge sched-status-clickable`}
              onClick={(e) => cycleStatus(j.id, e)}
              title="Click to cycle status"
            >{j.status.replace("_", " ")}</span>
          </span>
        </div>
      </>
    );
  };

  const unscheduledChipProps = (j: JobDTO) => ({
    className: `sched-job-chip sched-unscheduled-chip ${draggedJobId === j.id ? "sched-dragging" : ""} ${updatingJobIds.current.has(j.id) ? "sched-updating" : ""} ${conflictingJobIds.has(j.id) ? "sched-conflict" : ""} ${selectedJobIds.has(j.id) ? "sched-selected-chip" : ""} ${isRecurringInstance(j.id) ? "sched-recurring-chip" : ""}`,
    style: { color: "inherit", touchAction: "none" } as React.CSSProperties,
    onClick: (e: React.MouseEvent) => onChipClick(e, j.id),
    onPointerDown: isRecurringInstance(j.id) ? undefined : (e: React.PointerEvent<HTMLSpanElement>) => onPointerDown(e, j),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      ctxMenuPos.current = { x: e.clientX, y: e.clientY };
      setCtxMenuJobId(j.id);
    },
    onMouseEnter: (e: React.MouseEvent) => onChipMouseEnter(e, j.id),
    onMouseLeave: onChipMouseLeave,
  });

  /* context menu actions */
  const ctxMenuJob = useMemo(
    () => (ctxMenuJobId ? jobs.find((j) => j.id === ctxMenuJobId) ?? null : null),
    [ctxMenuJobId, jobs],
  );

  /* ── filter helpers ───────────────────────────────────────────────────── */
  const toggleFilterTech = useCallback((userId: string) => {
    setFilterTechIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }, []);

  const toggleFilterStatus = useCallback((s: JobStatus) => {
    setFilterStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilterTechIds(new Set());
    setFilterStatuses(new Set());
  }, []);

  const activeFilterCount = filterTechIds.size + filterStatuses.size;

  /* ── render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="fade-in">
      <div className="sched-header">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Schedule</h1>
        <div className="sched-header-right">
          <span className="card" style={{ padding: "8px 16px", fontSize: 14 }}>
            {activeCount} active jobs
          </span>
          <div className="sched-view-toggle">
            <button
              className={`sched-view-btn ${view === "week" ? "sched-view-btn-active" : ""}`}
              onClick={() => { setView("week"); setCursor(startOfWeek(today)); }}
            >Week</button>
            <button
              className={`sched-view-btn ${view === "day" ? "sched-view-btn-active" : ""}`}
              onClick={() => { setView("day"); setCursor(new Date(today)); }}
            >Day</button>
            <button
              className={`sched-view-btn ${view === "month" ? "sched-view-btn-active" : ""}`}
              onClick={() => { setView("month"); setCursor(startOfMonth(today)); }}
            >Month</button>
            <button
              className={`sched-view-btn ${view === "workweek" ? "sched-view-btn-active" : ""}`}
              onClick={() => { setView("workweek"); setCursor(startOfWeek(today)); }}
            >Mon–Fri</button>
            <button
              className={`sched-view-btn ${view === "tech" ? "sched-view-btn-active" : ""}`}
              onClick={() => { setView("tech"); setCursor(startOfWeek(today)); }}
            >Tech</button>
          </div>
        </div>
      </div>

      <div className="sched-nav">
        <div className="sched-nav-left">
          <button className="btn btn-sm btn-ghost" onClick={goPrev} title="Previous">← Prev</button>
          <button className="btn btn-sm btn-ghost" onClick={goToday}>Today</button>
          <button className="btn btn-sm btn-ghost" onClick={goNext} title="Next">Next →</button>
        </div>
        <div className="sched-nav-label">{headerLabel}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className={`btn btn-sm btn-ghost ${selectMode ? "sched-select-mode-active" : ""}`}
            onClick={() => { setSelectMode(!selectMode); setSelectedJobIds(new Set()); }}
            title="Multi-select mode"
          >☐ {selectedJobIds.size > 0 ? selectedJobIds.size : ""}</button>
          <button
            className={`btn btn-sm btn-ghost ${showFilters ? "sched-filter-btn-active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Filter by tech/status"
          >🔽 {activeFilterCount > 0 ? activeFilterCount : ""}</button>
          <button
            className={`btn btn-sm btn-ghost ${showUnscheduled ? "sched-unscheduled-btn-active" : ""}`}
            onClick={() => setShowUnscheduled(!showUnscheduled)}
            title="Toggle unscheduled jobs panel"
          >📋 {unscheduledJobs.length}</button>
          <button
            className="btn btn-sm btn-ghost sched-shortcuts-btn"
            onClick={() => setShowShortcuts(!showShortcuts)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >?</button>
        </div>
      </div>

      {/* search bar */}
      <div className="sched-search">
        <span className="sched-search-icon">🔍</span>
        <input
          ref={searchInputRef}
          className="sched-search-input"
          type="text"
          placeholder="Search by title, customer, or date…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="sched-search-clear" onClick={() => setSearchQuery("")} title="Clear">✕</button>
        )}
      </div>

      {/* undo toast */}
      {undoToast && (
        <div key={undoToast.key} className="sched-undo-toast fade-in">
          <span className="sched-undo-toast-title">Rescheduled &ldquo;{undoToast.title}&rdquo;</span>
          <button
            className="sched-undo-toast-btn"
            onClick={() => { setUndoToast(null); undoMove(); }}
          >
            Undo &nbsp;<kbd className="sched-kbd sched-kbd-sm">Ctrl+Z</kbd>
          </button>
        </div>
      )}

      {/* filter sidebar */}
      {showFilters && (
        <div className="sched-filters fade-in">
          <div className="sched-filters-header">
            <span className="sched-filters-title">Filters</span>
            {activeFilterCount > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={clearFilters}>Clear all</button>
            )}
          </div>
          <div className="sched-filters-section">
            <div className="sched-filters-section-title">Technicians</div>
            {techUsers.map((u) => (
              <label key={u.id} className="sched-filter-label">
                <input
                  type="checkbox"
                  checked={filterTechIds.has(u.id)}
                  onChange={() => toggleFilterTech(u.id)}
                />
                <span className="sched-tech-dot" style={{ background: techColor(u.id), width: 8, height: 8 }} />
                {u.name}
              </label>
            ))}
          </div>
          <div className="sched-filters-section">
            <div className="sched-filters-section-title">Status</div>
            {(["scheduled", "in_progress", "completed"] as JobStatus[]).map((s) => (
              <label key={s} className="sched-filter-label">
                <input
                  type="checkbox"
                  checked={filterStatuses.has(s)}
                  onChange={() => toggleFilterStatus(s)}
                />
                <span className={`badge badge-${s}`} style={{ fontSize: 11 }}>{s.replace("_", " ")}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* bulk action bar */}
      {selectMode && selectedJobIds.size > 0 && (
        <div className="sched-bulk-bar fade-in">
          <span className="sched-bulk-label">{selectedJobIds.size} selected</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelectedJobIds(new Set())}>Clear</button>
          <span className="sched-bulk-divider" />
          <span className="sched-bulk-hint">Drop on a day cell to reschedule all</span>
        </div>
      )}

      {/* main layout: calendar + optional unscheduled panel */}
      <div className="sched-layout">
        {/* unscheduled jobs panel */}
        {showUnscheduled && !loading && !error && !showEmptyResult && (
          <div className="sched-unscheduled-panel fade-in">
            <div className="sched-unscheduled-header">
              <span className="sched-unscheduled-title">Unscheduled</span>
              <span className="sched-unscheduled-count">{unscheduledJobs.length}</span>
            </div>
            <div className="sched-unscheduled-list">
              {unscheduledJobs.length === 0 ? (
                <div className="sched-unscheduled-empty">All jobs scheduled 🎉</div>
              ) : (
                unscheduledJobs.map((j) => (
                  <span
                    key={j.id}
                    {...unscheduledChipProps(j)}
                  >
                    {chipBody(j)}
                  </span>
                ))
              )}
            </div>
          </div>
        )}

        {/* calendar area */}
        <div className="sched-calendar-area">
          {error ? (
            <div className="error-banner" style={{ marginTop: 16 }}>
              API unreachable ({error}). Start it with <code>pnpm dev:api</code>.
            </div>
          ) : loading ? (
            <div className="empty-state">
              <div className="sched-spinner" />
              Loading schedule…
            </div>
          ) : showEmptyResult ? (
            <div className="empty-state">
              <div style={{ fontSize: 40, marginBottom: 8 }}>🔎</div>
              <div>No jobs match &ldquo;{searchQuery.trim()}&rdquo;</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try a different title, customer name, or date.</div>
            </div>
          ) : (
            <>
              {/* day view */}
              {view === "day" && days.length > 0 && (() => {
                const day = days[0];
                const hourly = dayJobsByHour;
                return (
                  <div className={dayCellClasses(day)} data-day-key={day.key}>
                    {hourly && hourly.untimed.length > 0 && (
                      <div className="sched-day-untimed">
                        <div className="sched-day-untimed-label">All day</div>
                        <div className="sched-day-untimed-jobs">
                          {hourly.untimed.map((j) => (
                            <span key={j.id} {...chipDragProps(j)}>
                              {chipBody(j)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="sched-day-slots">
                      {Array.from({ length: 17 }, (_, i) => {
                        const hour = i + 6;
                        const label = hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
                        const hourJobs = hourly?.hourMap.get(hour) ?? [];
                        return (
                          <div key={hour} className="sched-day-slot">
                            <div className="sched-day-slot-time">{label}</div>
                            <div
                              className="sched-day-slot-body"
                              style={{ position: "relative", overflow: "visible", height: SLOT_HEIGHT_PX + "px" }}
                            >
                              {hourJobs.length === 0 ? <div className="sched-day-slot-empty" /> : (
                                hourJobs.map((j) => {
                                  const startMin = new Date(j.scheduledAt!).getMinutes();
                                  const topPx = (startMin / 60) * SLOT_HEIGHT_PX;
                                  const durMin = jobDurations.current.get(j.id) ?? DEFAULT_DURATION_MIN;
                                  const heightPx = (durMin / 60) * SLOT_HEIGHT_PX;
                                  const props = chipDragProps(j);
                                  const laneInfo = dayJobLanes?.get(j.id);
                                  const laneStyle: React.CSSProperties = laneInfo && laneInfo.totalLanes > 1
                                    ? { left: `${(laneInfo.lane / laneInfo.totalLanes) * 100}%`, width: `calc(${(1 / laneInfo.totalLanes) * 100}% - 4px)` }
                                    : { left: 4, right: 4 };
                                  return (
                                    <span
                                      key={j.id}
                                      {...props}
                                      className={`sched-day-block ${props.className}`}
                                      style={{
                                        ...props.style,
                                        position: "absolute",
                                        top: topPx,
                                        height: heightPx,
                                        ...laneStyle,
                                        zIndex: 10,
                                        overflow: "hidden",
                                      }}
                                    >
                                      <div className="sched-day-block-time">
                                        {new Date(j.scheduledAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                      </div>
                                      {chipBody(j)}
                                      {/* resize handle */}
                                      <div
                                        className="sched-resize-handle"
                                        onPointerDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const dur = jobDurations.current.get(j.id) ?? DEFAULT_DURATION_MIN;
                                          setResizeDrag({ jobId: j.id, startY: e.clientY, startDur: dur });
                                        }}
                                      />
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* week / workweek view */}
              {(view === "week" || view === "workweek") && (
                <div className={`sched-week-grid ${view === "workweek" ? "sched-workweek-grid" : ""}`}>
                  {days.map((day) => (
                    <div key={day.key} className={dayCellClasses(day)} data-day-key={day.key}
                      onClick={() => setSelectedDay(selectedDay === day.key ? null : day.key)}>
                      <div className="sched-week-col-header">
                        <span className="sched-week-dayname">{WEEKDAY_LABELS[mondayIndex(day.date)]}</span>
                        <span className={`sched-week-daynum ${day.isToday ? "sched-today-badge" : ""}`}>{day.date.getDate()}</span>
                      </div>
                      <div className="sched-week-col-body">
                        {day.jobs.length === 0 ? <div className="sched-no-jobs">—</div> : (
                          day.jobs.map((j) => (
                            <span key={j.id} {...chipDragProps(j)}>
                              {chipBody(j)}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* tech view */}
              {view === "tech" && (
                <div className="sched-tech-grid" style={{ gridTemplateColumns: `repeat(${techColumns.length}, 1fr)` }}>
                  {techColumns.map((col) => (
                    <div key={col.userId} className="sched-tech-col">
                      <div className="sched-tech-col-header">
                        <span
                          className="sched-tech-col-dot"
                          style={{ background: col.userId === "__unassigned" ? "var(--muted)" : techColor(col.userId) }}
                        />
                        <span className="sched-tech-col-name">{col.userName}</span>
                        <span className="sched-tech-col-count">
                          {Array.from(col.dayJobMap.values()).reduce((s, arr) => s + arr.length, 0)}
                        </span>
                      </div>
                      <div className="sched-tech-col-body">
                        {Array.from({ length: 7 }, (_, i) => {
                          const date = addDays(startOfWeek(cursor), i);
                          const key = fmtDateKey(date);
                          const dayJobs = col.dayJobMap.get(key) ?? [];
                          return (
                            <div
                              key={key}
                              className={`sched-tech-day ${sameDay(date, today) ? "sched-tech-day-today" : ""} ${dropTargetKey === key ? "sched-drop-target" : ""} ${updatingFlash === key ? "sched-drop-flash" : ""}`}
                              data-day-key={key}
                            >
                              <div className="sched-tech-day-label">
                                <span className="sched-tech-day-name">{WEEKDAY_LABELS[i]}</span>
                                <span className={`sched-tech-day-num ${sameDay(date, today) ? "sched-today-badge" : ""}`}>{date.getDate()}</span>
                              </div>
                              <div className="sched-tech-day-jobs">
                                {dayJobs.length === 0 ? <div className="sched-no-jobs">—</div> : (
                                  dayJobs.map((j) => (
                                    <span key={j.id} {...chipDragProps(j)}>
                                      {chipBody(j)}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* month view */}
              {view === "month" && (
                <div className="sched-month">
                  <div className="sched-month-header">
                    {WEEKDAY_LABELS.map((l) => <div key={l} className="sched-month-dayname">{l}</div>)}
                  </div>
                  <div className="sched-month-grid">
                    {days.map((day) => (
                      <div key={day.key} className={dayCellClasses(day)} data-day-key={day.key}
                        onClick={() => setSelectedDay(selectedDay === day.key ? null : day.key)}>
                        <span className={`sched-month-cell-num ${day.isToday ? "sched-today-badge" : ""}`}>{day.date.getDate()}</span>
                        <div className="sched-month-cell-body">
                          {day.jobs.slice(0, 3).map((j) => (
                            <span key={j.id}
                              title={`${j.title} — ${formatMoney(j.total)}`} {...dotDragProps(j)}>
                              <span className={`sched-month-dot-color sched-dot-${j.status}`} />
                              <span className="sched-month-dot-label">{j.title}</span>
                              <span className="sched-month-dot-customer">{customersById.get(j.customerId)?.name}</span>
                            </span>
                          ))}
                          {day.jobs.length > 3 && <div className="sched-month-more">+{day.jobs.length - 3} more</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* detail panel */}
              {selectedDayData && selectedDayData.jobs.length > 0 && (
                <div className="sched-detail-panel fade-in">
                  <div className="sched-detail-header">
                    <span className="sched-detail-title">
                      {WEEKDAY_LABELS[mondayIndex(selectedDayData.date)]},{" "}
                      {MONTH_NAMES[selectedDayData.date.getMonth()].slice(0, 3)}{" "}
                      {selectedDayData.date.getDate()}
                    </span>
                    <button className="btn btn-sm btn-ghost" onClick={() => setSelectedDay(null)}>✕</button>
                  </div>
                  <div className="sched-detail-list">
                    {selectedDayData.jobs.map((j) => (
                      <span key={j.id}
                        className="appt-card" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                        onClick={() => setDetailJobId(j.id)}
                      >
                        <div>
                          <div className="appt-title">{j.title}</div>
                          <div className="appt-customer">{customersById.get(j.customerId)?.name}</div>
                          <div className="appt-assignee">
                            {usersById.get(j.assignedTo ?? "")?.name ?? "Unassigned"}
                          </div>
                          <div className="appt-time">{formatMoney(j.total)}</div>
                          {j.scheduledAt && (
                            <div className="appt-time">
                              {new Date(j.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                        <span className={`badge badge-${j.status}`}>{j.status.replace("_", " ")}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* tech assignment dropdown */}
      {assignMenuJobId && (
        <div
          className="sched-assign-menu fade-in"
          style={{ position: "fixed", left: assignMenuPos.current.x, top: assignMenuPos.current.y, zIndex: 10002 }}
        >
          <div className="sched-assign-menu-item sched-assign-menu-label">Assign to</div>
          <button
            className="sched-assign-menu-item"
            onClick={() => assignTech(assignMenuJobId, null)}
          >
            <span className="sched-tech-dot sched-tech-dot-empty" style={{ width: 10, height: 10 }} />
            Unassigned
          </button>
          {techUsers.map((u) => (
            <button
              key={u.id}
              className="sched-assign-menu-item"
              onClick={() => assignTech(assignMenuJobId, u.id)}
            >
              <span className="sched-tech-dot" style={{ background: techColor(u.id), width: 10, height: 10 }} />
              {u.name}
            </button>
          ))}
        </div>
      )}

      {/* right-click context menu */}
      {ctxMenuJobId && ctxMenuJob && (
        <div
          className="sched-ctx-menu fade-in"
          style={{ position: "fixed", left: ctxMenuPos.current.x, top: ctxMenuPos.current.y, zIndex: 10002 }}
        >
          <div className="sched-ctx-menu-item sched-ctx-menu-label">
            {ctxMenuJob.title}
          </div>
          <button className="sched-ctx-menu-item" onClick={() => { assignTech(ctxMenuJobId, null); setCtxMenuJobId(null); }}>
            Assign tech…
          </button>
          <button className="sched-ctx-menu-item" onClick={() => { moveJob(ctxMenuJobId, ctxMenuJob.scheduledAt ? fmtDateKey(new Date(ctxMenuJob.scheduledAt)) : "", fmtDateKey(today)); setCtxMenuJobId(null); }}>
            Move to today
          </button>
          <button className="sched-ctx-menu-item" onClick={() => { cycleStatus(ctxMenuJobId); setCtxMenuJobId(null); }}>
            Cycle status
          </button>
          <div className="sched-ctx-menu-divider" />
          <a className="sched-ctx-menu-item" href={`/customers/${ctxMenuJob.customerId}`} target="_blank" rel="noopener">
            Open customer ↗
          </a>
          <button className="sched-ctx-menu-item" onClick={() => { setDetailJobId(ctxMenuJobId); setCtxMenuJobId(null); }}>
            View details
          </button>
        </div>
      )}

      {/* job details modal */}
      {detailJobId && detailJob && (() => {
        const cust = customersById.get(detailJob.customerId);
        const techUser = detailJob.assignedTo ? usersById.get(detailJob.assignedTo) : null;
        return (
          <>
            <div className="sched-modal-backdrop" onClick={() => { setDetailJobId(null); setEditing(false); }} />
            <div className="sched-modal sched-detail-modal fade-in">
              <div className="sched-modal-header">
                <span className="sched-modal-title">
                  {editing ? (
                    <input
                      className="input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => { if (editTitle.trim()) updateTitle(detailJobId, editTitle.trim()); setEditing(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { if (editTitle.trim()) updateTitle(detailJobId, editTitle.trim()); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
                      autoFocus
                      style={{ fontSize: "inherit", fontWeight: "inherit" }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditTitle(detailJob.title); setEditing(true); }}
                      style={{ cursor: "text", borderBottom: "1px dashed var(--muted)" }}
                      title="Click to edit"
                    >
                      {detailJob.title}
                    </span>
                  )}
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => { setDetailJobId(null); setEditing(false); }}>✕</button>
              </div>
              <div className="sched-modal-body">
                <div className="sched-detail-grid">
                  <div className="sched-detail-field">
                    <div className="sched-detail-label">Status</div>
                    <button
                      className={`badge badge-${detailJob.status} sched-status-clickable`}
                      onClick={() => cycleStatus(detailJobId)}
                      title="Click to cycle"
                    >
                      {detailJob.status.replace("_", " ")} ↻
                    </button>
                  </div>
                  <div className="sched-detail-field">
                    <div className="sched-detail-label">Technician</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {techUser ? (
                        <>
                          <span className="sched-tech-dot" style={{ background: techColor(detailJob.assignedTo), width: 10, height: 10 }} />
                          {techUser.name}
                          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 4 }} onClick={() => assignTech(detailJobId, null)}>✕</button>
                        </>
                      ) : (
                        <button className="btn btn-sm btn-ghost" onClick={() => {
                          const el = document.querySelector(`.sched-tech-dot-empty`) as HTMLElement;
                          if (el) {
                            const rect = el.getBoundingClientRect();
                            assignMenuPos.current = { x: rect.left, y: rect.bottom + 4 };
                          }
                          setAssignMenuJobId(detailJobId);
                        }}>+ Assign</button>
                      )}
                    </div>
                  </div>
                  <div className="sched-detail-field">
                    <div className="sched-detail-label">Customer</div>
                    <a href={`/customers/${detailJob.customerId}`} target="_blank" rel="noopener" style={{ color: "var(--acc)", fontWeight: 600 }}>
                      {cust?.name ?? "Unknown"} ↗
                    </a>
                    {cust?.phone && <div style={{ fontSize: 12, color: "var(--mut)" }}>{cust.phone}</div>}
                    {cust?.email && <div style={{ fontSize: 12, color: "var(--mut)" }}>{cust.email}</div>}
                  </div>
                  <div className="sched-detail-field">
                    <div className="sched-detail-label">Time</div>
                    <div>
                      {detailJob.scheduledAt
                        ? new Date(detailJob.scheduledAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                        : "Unscheduled"}
                    </div>
                  </div>
                  <div className="sched-detail-field">
                    <div className="sched-detail-label">Amount</div>
                    <div style={{ fontWeight: 600 }}>{formatMoney(detailJob.total)}</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* drag ghost */}
      {drag && dragMoved.current && (
        <div className="sched-job-chip sched-drag-ghost" style={{
          position: "fixed", pointerEvents: "none", zIndex: 9999,
          left: drag.clientX - drag.offsetX, top: drag.clientY - drag.offsetY,
          width: drag.width, opacity: 0.92,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div className="sched-job-chip-title">{drag.job.title}</div>
          <div className="sched-job-chip-customer">{customersById.get(drag.job.customerId)?.name}</div>
          <div className="sched-job-chip-meta">
            <span>{formatMoney(drag.job.total)}</span>
            <span className={`badge badge-${drag.job.status} sched-job-chip-badge`}>{drag.job.status.replace("_", " ")}</span>
          </div>
        </div>
      )}

      {/* customer hover tooltip */}
      {hoveredCustomer && !drag && (
        <div className="sched-tooltip fade-in" style={{
          position: "fixed", zIndex: 9998,
          left: Math.min(hoverPos.current.x + 12, window.innerWidth - 260),
          top: Math.min(hoverPos.current.y + 16, window.innerHeight - 140),
        }}>
          <div className="sched-tooltip-name">{hoveredCustomer.name}</div>
          {hoveredCustomer.email && <div className="sched-tooltip-row">{hoveredCustomer.email}</div>}
          {hoveredCustomer.phone && <div className="sched-tooltip-row">{hoveredCustomer.phone}</div>}
          <div className="sched-tooltip-hint">Click for details →</div>
        </div>
      )}

      {/* keyboard shortcuts modal */}
      {showShortcuts && (
        <>
          <div className="sched-modal-backdrop" onClick={() => setShowShortcuts(false)} />
          <div className="sched-modal fade-in">
            <div className="sched-modal-header">
              <span className="sched-modal-title">Keyboard Shortcuts</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowShortcuts(false)}>✕</button>
            </div>
            <div className="sched-modal-body">
              <div className="sched-kb-section">
                <div className="sched-kb-section-title">Navigation</div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">←</kbd>
                  <kbd className="sched-kbd">→</kbd>
                  <span>Previous / next period</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">T</kbd>
                  <span>Jump to today</span>
                </div>
              </div>
              <div className="sched-kb-section">
                <div className="sched-kb-section-title">View Switching</div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">W</kbd>
                  <span>Week view</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">D</kbd>
                  <span>Day view</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">M</kbd>
                  <span>Month view</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">F</kbd>
                  <span>Mon–Fri (work week) view</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">E</kbd>
                  <span>Employee (tech) view</span>
                </div>
              </div>
              <div className="sched-kb-section">
                <div className="sched-kb-section-title">Editing</div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="sched-kbd">Z</kbd>
                  <span>Undo last reschedule</span>
                </div>
              </div>
              <div className="sched-kb-section">
                <div className="sched-kb-section-title">General</div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">/</kbd>
                  <span>or</span>
                  <kbd className="sched-kbd">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="sched-kbd">K</kbd>
                  <span>Focus search</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">S</kbd>
                  <span>Toggle multi-select mode</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">U</kbd>
                  <span>Toggle unscheduled panel</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">G</kbd>
                  <span>Toggle filter sidebar</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">?</kbd>
                  <span>Show / hide this dialog</span>
                </div>
                <div className="sched-kb-row">
                  <kbd className="sched-kbd">Esc</kbd>
                  <span>Close panels</span>
                </div>
              </div>
              <div className="sched-kb-section">
                <div className="sched-kb-section-title">Interactions</div>
                <div className="sched-kb-row">
                  <span style={{ minWidth: 100 }}>Drag &amp; drop</span>
                  <span>Reschedule a job to another day</span>
                </div>
                <div className="sched-kb-row">
                  <span style={{ minWidth: 100 }}>Click a chip</span>
                  <span>Open job detail modal</span>
                </div>
                <div className="sched-kb-row">
                  <span style={{ minWidth: 100 }}>Click status badge</span>
                  <span>Cycle job status</span>
                </div>
                <div className="sched-kb-row">
                  <span style={{ minWidth: 100 }}>Right-click chip</span>
                  <span>Context menu (assign, move, open)</span>
                </div>
                <div className="sched-kb-row">
                  <span style={{ minWidth: 100 }}>Shift+click</span>
                  <span>Multi-select range</span>
                </div>
                <div className="sched-kb-row">
                  <span style={{ minWidth: 100 }}>Drag block edge</span>
                  <span>Resize job duration (day view)</span>
                </div>
                <div className="sched-kb-row">
                  <span style={{ minWidth: 100 }}>Hover a chip</span>
                  <span>Show customer preview card</span>
                </div>
              </div>
            </div>
          </div>
        </>

      )}
    </div>
  );
}
