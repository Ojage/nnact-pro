// OpenFieldPro technician app — dashboard with stat cards, appointments, and job cards.
// Run: pnpm --filter @ofp/mobile dev  (requires Expo Go or a simulator).
import { useEffect, useState, useMemo } from "react";
import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import type { JobDTO } from "@ofp/shared";
import { formatMoney } from "@ofp/shared";
import { StatCard } from "./components/StatCard";
import { JobCard } from "./components/JobCard";
import { AppointmentCard } from "./components/AppointmentCard";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

interface Invoice {
  id: string;
  jobId: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
}

export default function App() {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [jr, ar, ir] = await Promise.all([
          fetch(`${API}/api/jobs`).then((r) => r.json()).catch(() => []),
          fetch(`${API}/api/appointments`).then((r) => r.json()).catch(() => []),
          fetch(`${API}/api/invoices`).then((r) => r.json()).catch(() => []),
        ]);
        if (!cancelled) {
          setJobs(jr);
          setAppointments(ar);
          setInvoices(ir);
        }
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Computed metrics ──
  const stats = useMemo(() => {
    const active =
      jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress")
        .length;
    const completed = jobs.filter((j) => j.status === "completed").length;
    const revenue = jobs
      .filter((j) => j.status === "completed")
      .reduce((a, j) => a + j.total, 0);

    const now = new Date();
    const todayAppts = appointments.filter(
      (a) => new Date(a.startsAt).toDateString() === now.toDateString(),
    ).length;

    const outstanding = invoices
      .filter((i) => i.status === "sent" || i.status === "draft")
      .reduce((a, i) => a + i.total, 0);

    return { active, completed, revenue, todayAppts, outstanding };
  }, [jobs, appointments, invoices]);

  // ── Upcoming appointments (future, next 7 days) ──
  const upcoming = useMemo(() => {
    const now = new Date();
    return appointments
      .filter((a) => new Date(a.startsAt) > now)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      )
      .slice(0, 8);
  }, [appointments]);

  // ── Loading state ──
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b56b0" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSub}>
            {jobs.length} jobs · {stats.active} active
          </Text>
        </View>

        {/* ── Error banner ── */}
        {err && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorIcon}>⚠</Text>
            <View style={styles.errorTextBlock}>
              <Text style={styles.errorTitle}>Couldn't load data</Text>
              <Text style={styles.errorMsg}>{err}</Text>
            </View>
          </View>
        )}

        {/* ── Stat cards (horizontal scroll) ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statRow}
          contentContainerStyle={styles.statRowContent}
        >
          <StatCard
            label="Active"
            value={String(stats.active)}
            color={stats.active > 0 ? "#7ab8ff" : undefined}
          />
          <StatCard
            label="Completed"
            value={String(stats.completed)}
            color={stats.completed > 0 ? "#86e29a" : undefined}
          />
          <StatCard label="Revenue" value={formatMoney(stats.revenue)} color="#86e29a" />
          <StatCard
            label="Today"
            value={String(stats.todayAppts)}
            color={stats.todayAppts > 0 ? "#e0b34f" : undefined}
          />
          <StatCard
            label="Outstanding"
            value={formatMoney(stats.outstanding)}
            color={stats.outstanding > 0 ? "#e0b34f" : undefined}
          />
        </ScrollView>

        {/* ── Upcoming appointments ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
            <Text style={styles.sectionCount}>{upcoming.length}</Text>
          </View>
          {upcoming.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyTitle}>No upcoming appointments</Text>
              <Text style={styles.emptySub}>
                Scheduled jobs will appear here
              </Text>
            </View>
          ) : (
            upcoming.map((a) => {
              const job = jobs.find((j) => j.id === a.jobId);
              return <AppointmentCard key={a.id} appt={a} job={job} />;
            })
          )}
        </View>

        {/* ── All jobs ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Jobs</Text>
            <Text style={styles.sectionCount}>{jobs.length}</Text>
          </View>
          {jobs.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyTitle}>No jobs yet</Text>
              <Text style={styles.emptySub}>
                Jobs will appear here once created
              </Text>
            </View>
          ) : (
            jobs.map((job) => <JobCard key={job.id} job={job} />)
          )}
        </View>

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 20,
  },

  // ── Loading ──
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#8a97c2",
    fontSize: 14,
  },

  // ── Header ──
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    color: "#e6e9f0",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headerSub: {
    color: "#8a97c2",
    fontSize: 13,
    marginTop: 4,
  },

  // ── Error ──
  errorBanner: {
    backgroundColor: "rgba(255,128,128,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,128,128,0.2)",
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  errorIcon: {
    fontSize: 16,
    color: "#ff8080",
    marginTop: 1,
  },
  errorTextBlock: {
    flex: 1,
  },
  errorTitle: {
    color: "#ff8080",
    fontSize: 13,
    fontWeight: "600",
  },
  errorMsg: {
    color: "#8a97c2",
    fontSize: 11,
    marginTop: 2,
  },

  // ── Stat cards ──
  statRow: {
    marginBottom: 24,
  },
  statRowContent: {
    paddingLeft: 20,
    paddingRight: 10,
  },

  // ── Sections ──
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#e6e9f0",
    fontSize: 16,
    fontWeight: "600",
  },
  sectionCount: {
    color: "#6b7aa8",
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Empty ──
  emptyBlock: {
    backgroundColor: "#141b33",
    borderRadius: 12,
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#8a97c2",
    fontSize: 14,
    fontWeight: "600",
  },
  emptySub: {
    color: "#6b7aa8",
    fontSize: 12,
    marginTop: 4,
  },
});
