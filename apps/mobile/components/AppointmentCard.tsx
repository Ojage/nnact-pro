import { View, Text, StyleSheet } from "react-native";
import type { JobDTO } from "@nnact/shared";
import { colors, fonts } from "../src/theme";

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
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timeBlock: {
    backgroundColor: colors.borderAlpha,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 80,
  },
  timeBlockToday: {
    backgroundColor: colors.primaryAlpha,
  },
  day: {
    color: colors.mutedForeground,
    fontSize: 10,
    fontFamily: fonts.semibold,
  },
  dayToday: {
    color: colors.focus,
  },
  time: {
    color: colors.foreground,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  timeToday: {
    color: colors.focus,
  },
  details: {
    flex: 1,
  },
  title: {
    color: colors.foreground,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  today: {
    color: colors.focus,
    fontSize: 11,
    fontFamily: fonts.semibold,
    marginTop: 2,
  },
});
