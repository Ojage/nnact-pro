import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AI_MODES, AI_SLOTS, type AiAutomationMode, type AiRunDTO, type AiSlot, type ChannelPublicationDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import {
  getAiSettings,
  listAiRuns,
  listNewsletterSubscribers,
  listPublications,
  retryPublication,
  triggerAiRun,
  updateAiSettings,
  updateNewsletterSubscriber,
  type NewsletterSubscriberDTO,
} from "../../office-api";
import { ActionButton, InlineError, OfficeHeader, Row, SectionLabel, StatusTag, Tag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

function humanize(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function errorText(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export function ContentPublicationsScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [publications, setPublications] = useState<ChannelPublicationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listPublications(session, { take: 50 });
      setPublications(result.items);
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = useCallback(
    async (publication: ChannelPublicationDTO) => {
      if (busy) return;
      setBusy(publication.id);
      try {
        await retryPublication(session, publication.id);
        await load();
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(null);
      }
    },
    [session, busy, load],
  );

  const failed = publications.filter((p) => p.status === "FAILED");
  const pending = publications.filter((p) => ["PENDING", "PUBLISHING", "SCHEDULED"].includes(p.status));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <OfficeHeader
        colors={colors}
        onBack={nav.pop}
        eyebrow="Content automation"
        title="Deliveries"
        subtitle="Every channel publication attempt, with one-tap retry on failures."
      />

      <InlineError colors={colors} message={error} />

      {failed.length > 0 ? (
        <>
          <SectionLabel colors={colors}>Needs attention ({failed.length})</SectionLabel>
          {failed.map((pub) => (
            <Row
              key={pub.id}
              colors={colors}
              icon="warning-outline"
              title={humanize(pub.channel)}
              subtitle={pub.lastErrorMessage?.slice(0, 110) || `${pub.attemptCount} failed attempt${pub.attemptCount === 1 ? "" : "s"}`}
              right={
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={busy === pub.id}
                  onPress={() => void retry(pub)}
                  style={[styles.miniBtn, { backgroundColor: colors.primaryAlpha }]}
                >
                  <Text style={[styles.miniBtnText, { color: colors.primary }]}>{busy === pub.id ? "…" : "Retry"}</Text>
                </TouchableOpacity>
              }
            />
          ))}
        </>
      ) : null}

      {pending.length > 0 ? (
        <>
          <SectionLabel colors={colors}>In flight ({pending.length})</SectionLabel>
          {pending.map((pub) => (
            <Row
              key={pub.id}
              colors={colors}
              icon="time-outline"
              title={humanize(pub.channel)}
              subtitle={pub.scheduledAt ? `Scheduled ${fmtDate(pub.scheduledAt)}` : "Publishing"}
              right={<StatusTag colors={colors} status={pub.status} />}
            />
          ))}
        </>
      ) : null}

      <SectionLabel colors={colors}>{loading ? "Loading…" : `Recent (${publications.length})`}</SectionLabel>
      {!loading && publications.length === 0 ? (
        <Text style={styles.mutedNote}>No publications yet. Publish a content item to create one.</Text>
      ) : null}
      {publications.map((pub) => (
        <Row
          key={pub.id}
          colors={colors}
          icon={pub.status === "FAILED" ? "close-circle-outline" : "checkmark-done-outline"}
          title={humanize(pub.channel)}
          subtitle={pub.externalUrl || fmtDate(pub.publishedAt) || `${pub.attemptCount} attempt${pub.attemptCount === 1 ? "" : "s"}`}
          right={<StatusTag colors={colors} status={pub.status} />}
        />
      ))}
    </ScrollView>
  );
}

export function NewsletterScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriberDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | NewsletterSubscriberDTO["status"]>("");

  const load = useCallback(async () => {
    try {
      const result = await listNewsletterSubscribers(session, { take: 100, status: filter || undefined });
      setSubscribers(result.subscribers);
      setTotal(result.total);
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = useCallback(
    async (subscriber: NewsletterSubscriberDTO, status: NewsletterSubscriberDTO["status"]) => {
      if (busy) return;
      setBusy(subscriber.id);
      try {
        await updateNewsletterSubscriber(session, subscriber.id, status);
        await load();
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(null);
      }
    },
    [session, busy, load],
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <OfficeHeader
        colors={colors}
        onBack={nav.pop}
        eyebrow="Content automation"
        title="Subscribers"
        subtitle={`${total} subscriber${total === 1 ? "" : "s"}. Only owners can read this list.`}
      />

      <InlineError colors={colors} message={error} />

      <View style={styles.chipRow}>
        {["", "subscribed", "unsubscribed", "bounced"].map((value) => {
          const active = value === filter;
          return (
            <TouchableOpacity
              key={value || "all"}
              activeOpacity={0.8}
              onPress={() => setFilter(value as typeof filter)}
              style={[styles.chip, active ? { backgroundColor: colors.primaryAlpha, borderColor: colors.primary } : null]}
            >
              <Text style={[styles.chipText, active ? { color: colors.primary } : null]}>{value ? humanize(value) : "All"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionLabel colors={colors}>{loading ? "Loading…" : `Subscribers (${subscribers.length})`}</SectionLabel>
      {!loading && subscribers.length === 0 ? (
        <Text style={styles.mutedNote}>No subscribers match this filter.</Text>
      ) : null}

      {subscribers.map((sub) => (
        <Row
          key={sub.id}
          colors={colors}
          icon="person-outline"
          title={sub.name || sub.email}
          subtitle={[sub.email !== sub.name ? sub.email : null, sub.source, fmtDate(sub.createdAt)].filter(Boolean).join(" · ")}
          right={<StatusTag colors={colors} status={sub.status} />}
        />
      ))}

      {subscribers.length > 0 ? (
        <>
          <SectionLabel colors={colors}>Actions</SectionLabel>
          {subscribers.map((sub) => (
            <View key={`actions-${sub.id}`} style={styles.bulkRow}>
              <Text style={styles.bulkLabel} numberOfLines={1}>
                {sub.name || sub.email}
              </Text>
              <View style={styles.bulkButtons}>
                {sub.status !== "subscribed" ? (
                  <ActionButton
                    colors={colors}
                    label="Subscribe"
                    tone="success"
                    onPress={() => void setStatus(sub, "subscribed")}
                    disabled={busy !== null}
                    style={{ marginBottom: 0 }}
                  />
                ) : null}
                {sub.status !== "unsubscribed" ? (
                  <ActionButton
                    colors={colors}
                    label="Unsubscribe"
                    tone="warning"
                    onPress={() => void setStatus(sub, "unsubscribed")}
                    disabled={busy !== null}
                    style={{ marginBottom: 0 }}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

export function ContentAutomationScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void; push: (route: { name: "content"; contentId: string }) => void };
}) {
  const styles = createStyles(colors);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getAiSettings>> | null>(null);
  const [runs, setRuns] = useState<AiRunDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([getAiSettings(session), listAiRuns(session, { take: 15 })]);
      setSettings(s);
      setRuns(r.items);
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const setMode = useCallback(
    async (mode: AiAutomationMode) => {
      if (busy || !settings) return;
      setBusy("mode");
      try {
        setSettings(await updateAiSettings(session, { mode }));
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(null);
      }
    },
    [session, busy, settings],
  );

  const toggleKillSwitch = useCallback(async () => {
    if (busy || !settings) return;
    setBusy("kill");
    try {
      setSettings(await updateAiSettings(session, { killSwitch: !settings.killSwitch }));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }, [session, busy, settings]);

  const trigger = useCallback(
    async (slot: AiSlot) => {
      if (busy) return;
      setBusy(`trigger:${slot}`);
      try {
        await triggerAiRun(session, slot);
        await load();
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(null);
      }
    },
    [session, busy, load],
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <OfficeHeader
        colors={colors}
        onBack={nav.pop}
        eyebrow="Content automation"
        title="Automation"
        subtitle="Guardrails, provider order and manual triggers for AI-generated content."
      />

      <InlineError colors={colors} message={error} />

      {settings ? (
        <>
          <View style={styles.tagRow}>
            <Tag colors={colors} label={settings.enabled ? "Enabled" : "Disabled"} tone={settings.enabled ? "success" : "neutral"} />
            {settings.killSwitch ? <Tag colors={colors} label="Kill switch" tone="danger" /> : null}
            {settings.reserveEnabled ? <Tag colors={colors} label={`Reserve ${settings.reserveTarget}`} tone="primary" /> : null}
          </View>

          <SectionLabel colors={colors}>Mode</SectionLabel>
          <View style={styles.chipWrap}>
            {AI_MODES.map((mode) => {
              const active = settings.mode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  activeOpacity={0.8}
                  disabled={busy !== null}
                  onPress={() => void setMode(mode)}
                  style={[styles.chip, active ? { backgroundColor: colors.primaryAlpha, borderColor: colors.primary } : null]}
                >
                  <Text style={[styles.chipText, active ? { color: colors.primary } : null]}>{humanize(mode)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {settings.mode === "AUTO_PUBLISH_WITH_GUARDRAILS" ? (
            <Text style={styles.hintNote}>
              Auto-publish is on: generated content clears the quality threshold and publishes without a human approving each item.
            </Text>
          ) : null}

          <SectionLabel colors={colors}>Run now</SectionLabel>
          <View style={styles.actionRow}>
            {AI_SLOTS.map((slot) => (
              <ActionButton
                key={slot}
                colors={colors}
                label={busy === `trigger:${slot}` ? "Starting…" : `Run ${humanize(slot)}`}
                icon="flash-outline"
                tone="primary"
                onPress={() => void trigger(slot)}
                disabled={busy !== null || !settings.enabled || settings.killSwitch}
                style={{ flex: 1, marginBottom: 0 }}
              />
            ))}
          </View>

          <SectionLabel colors={colors}>Safety</SectionLabel>
          <Row
            colors={colors}
            icon={settings.killSwitch ? "lock-closed-outline" : "shield-checkmark-outline"}
            title={settings.killSwitch ? "Resume automation" : "Stop all automation"}
            subtitle="The kill switch halts every scheduled slot immediately."
            danger={!settings.killSwitch}
            onPress={() => void toggleKillSwitch()}
          />

          <SectionLabel colors={colors}>Budget</SectionLabel>
          <View style={styles.card}>
            <Line colors={colors} label="Quality threshold" value={String(settings.qualityThreshold)} />
            <Line colors={colors} label="Daily cap" value={`${(settings.dailyBudgetCents / 100).toFixed(2)}`} />
            <Line colors={colors} label="Monthly cap" value={`${(settings.monthlyBudgetCents / 100).toFixed(2)}`} />
            <Line colors={colors} label="Max AI calls / slot" value={String(settings.maxAiCallsPerSlot)} />
            <Line colors={colors} label="Last morning run" value={fmtDate(settings.lastMorningRunAt)} />
            <Line colors={colors} label="Next morning run" value={fmtDate(settings.nextMorningRunAt)} />
          </View>
        </>
      ) : loading ? (
        <Text style={styles.mutedNote}>Loading automation settings…</Text>
      ) : null}

      <SectionLabel colors={colors}>Recent runs ({runs.length})</SectionLabel>
      {!loading && runs.length === 0 ? <Text style={styles.mutedNote}>No automation runs recorded yet.</Text> : null}
      {runs.map((run) => (
        <Row
          key={run.id}
          colors={colors}
          icon="sparkles-outline"
          title={run.topic || humanize(run.slot)}
          subtitle={[humanize(run.state), run.contentType, fmtDate(run.scheduledDate)].filter(Boolean).join(" · ")}
          right={<StatusTag colors={colors} status={run.state} />}
          onPress={run.contentId ? () => nav.push({ name: "content", contentId: run.contentId as string }) : undefined}
        />
      ))}
    </ScrollView>
  );
}

function Line({ colors, label, value }: { colors: Palette; label: string; value?: string | null }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value ?? "—"}</Text>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xxl },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    hintNote: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingHorizontal: spacing.lg },
    chipRow: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingHorizontal: spacing.lg },
    chip: {
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
      backgroundColor: colors.card,
    },
    chipText: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.semibold },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
    miniBtn: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
    miniBtnText: { fontSize: 11, fontFamily: fonts.bold },
    bulkRow: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 14 },
    bulkLabel: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold, marginBottom: spacing.xs },
    bulkButtons: { flexDirection: "row", gap: spacing.xs },
    card: { marginHorizontal: spacing.lg, padding: spacing.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 14 },
    line: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
    lineLabel: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular },
    lineValue: { color: colors.foreground, fontSize: 13, fontFamily: fonts.semibold },
  });
