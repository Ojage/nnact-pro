// OpenFieldPro technician app — Phase-1 stub. Lists today's jobs from the API.
// Run: pnpm --filter @ofp/mobile dev  (requires Expo Go or a simulator).
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View, FlatList } from "react-native";
import type { JobDTO } from "@ofp/shared";
import { formatMoney } from "@ofp/shared";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export default function App() {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/jobs`)
      .then((r) => r.json())
      .then(setJobs)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>My Jobs</Text>
      {err && <Text style={styles.err}>{err}</Text>}
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        renderItem={({ item }) => (
          <Text style={styles.row}>
            {item.title} · {item.status} · {formatMoney(item.total)}
          </Text>
        )}
      />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1020", padding: 20, paddingTop: 60 },
  h1: { color: "#e6e9f0", fontSize: 24, fontWeight: "700", marginBottom: 16 },
  row: { color: "#cdd6f4", paddingVertical: 8, fontSize: 16 },
  err: { color: "#ff8080" },
});
