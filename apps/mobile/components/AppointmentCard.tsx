import { View, Text, StyleSheet } from "react-native";
import type { JobDTO } from "@ofp/shared";

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function AppointmentCard({
  appt,
  job,
}: {
  appt: Appointment;
  job?: JobDTO;
}) {
  const start = new Date(appt.startsAt);
  const isToday = new Date().toDateString() === start.toDateString();

  return (
    <View style={styles.card}>
      <View
        style={[styles.timeBlock, isToday && styles.timeBlockToday]}
      >
        <Text style={[styles.day, isToday && styles.dayToday]}>
          {formatDay(appt.startsAt)}
        </Text>
        <Text style={[styles.time, isToday && styles.timeToday]}>
          {formatTime(appt.startsAt)}
        </Text>
      </View>
      <View style={styles.details}>
        <Text style={styles.title} numberOfLines={1}>
          {job?.title ?? appt.jobId.slice(0, 8)}
        </Text>
        {isToday && <Text style={styles.today}>Today</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#141b33",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timeBlock: {
    backgroundColor: "rgba(26,35,64,0.5)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 80,
  },
  timeBlockToday: {
    backgroundColor: "rgba(59,86,176,0.2)",
  },
  day: {
    color: "#8a97c2",
    fontSize: 10,
    fontWeight: "600",
  },
  dayToday: {
    color: "#7ab8ff",
  },
  time: {
    color: "#e6e9f0",
    fontSize: 15,
    fontWeight: "700",
  },
  timeToday: {
    color: "#7ab8ff",
  },
  details: {
    flex: 1,
  },
  title: {
    color: "#e6e9f0",
    fontSize: 14,
    fontWeight: "500",
  },
  today: {
    color: "#7ab8ff",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
