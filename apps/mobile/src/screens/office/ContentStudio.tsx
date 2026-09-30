import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  CONTENT_VISIBILITY,
  PUBLISHING_CHANNELS,
  type ContentItemDTO,
  type ContentStatus,
  type ContentType,
  type ContentVisibility,
  type PublishingChannel,
} from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import {
  approveContent,
  createContent,
  getContent,
  listContent,
  publishContent,
  rejectContent,
  saveChannelVariant,
  submitContentForReview,
  unpublishContent,
  type ContentDetailResult,
  type ContentListFilters,
} from "../../office-api";
import { ActionButton, InlineError, OfficeHeader, Row, SectionLabel, Sheet, StatusTag, Tag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

const PAGE_SIZE = 25;

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

/**
 * Which lifecycle actions the API will actually accept, mirroring the role
 * checks in apps/api/src/routes/content.ts. Approve, reject, publish and
 * unpublish are all owner-only server-side; offering them to a dispatcher
 * would only produce a 403.
 */
function actionsFor(status: ContentStatus, isOwner: boolean): string[] {
  const actions: string[] = [];
  if (status === "DRAFT" || status === "REJECTED") actions.push("submit-review");
  if (isOwner) {
    if (status === "IN_REVIEW") actions.push("approve", "reject");
    if (status === "DRAFT" || status === "APPROVED") actions.push("publish");
    if (status === "PUBLISHED" || status === "SCHEDULED") actions.push("unpublish");
  }
  return actions;
}

const ACTION_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; tone: "primary" | "success" | "warning" | "danger" }> = {
  "submit-review": { label: "Send for review", icon: "send-outline", tone: "primary" },
  approve: { label: "Approve", icon: "checkmark-circle-outline", tone: "success" },
  reject: { label: "Reject", icon: "close-circle-outline", tone: "danger" },
  publish: { label: "Publish now", icon: "cloud-upload-outline", tone: "success" },
  unpublish: { label: "Unpublish", icon: "remove-circle-outline", tone: "danger" },
};

function FilterChips({
  colors,
  options,
  value,
  onChange,
  allLabel,
}: {
  colors: Palette;
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  allLabel: string;
}) {
  const styles = createStyles(colors);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {[{ value: "", label: allLabel }, ...options.map((o) => ({ value: o, label: humanize(o) }))].map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value || "all"}
            activeOpacity={0.8}
            onPress={() => onChange(opt.value)}
            style={[styles.chip, active ? { backgroundColor: colors.primaryAlpha, borderColor: colors.primary } : null]}
          >
            <Text style={[styles.chipText, active ? { color: colors.primary } : null]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function ContentStudioScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { push: (route: { name: "content"; contentId: string }) => void };
}) {
  const styles = createStyles(colors);
  const [items, setItems] = useState<ContentItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ContentStatus | "">("");
  const [type, setType] = useState<ContentType | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newType, setNewType] = useState<ContentType>("ARTICLE");
  const [newVisibility, setNewVisibility] = useState<ContentVisibility>("PUBLIC");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const filters: ContentListFilters = { take: PAGE_SIZE, status, type, search: search.trim() || undefined };
        const result = await listContent(session, filters);
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session, status, type, search],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    if (!newTitle.trim() || saving) return;
    setSaving(true);
    try {
      const created = await createContent(session, {
        title: newTitle.trim(),
        summary: newSummary.trim() || null,
        type: newType,
        visibility: newVisibility,
      });
      setCreating(false);
      setNewTitle("");
      setNewSummary("");
      await load(true);
      nav.push({ name: "content", contentId: created.id });
    } catch (caught) {
      setError(errorText(caught));
      setSaving(false);
    }
  }, [session, newTitle, newSummary, newType, newVisibility, saving, load, nav]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <OfficeHeader
        colors={colors}
        eyebrow="Content automation"
        title="Content Studio"
        subtitle={`${total} item${total === 1 ? "" : "s"} in the pipeline. Rich text is authored on the web.`}
      />

      <InlineError colors={colors} message={error} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.dimForeground} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search title, summary or slug"
          placeholderTextColor={colors.dimForeground}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={colors.dimForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FilterChips colors={colors} options={CONTENT_STATUSES} value={status} onChange={(v) => setStatus(v as ContentStatus | "")} allLabel="Any status" />
      <FilterChips colors={colors} options={CONTENT_TYPES} value={type} onChange={(v) => setType(v as ContentType | "")} allLabel="Any type" />

      <View style={styles.actionRow}>
        <ActionButton colors={colors} label="New item" icon="add" tone="primary" onPress={() => setCreating(true)} style={{ flex: 1, marginBottom: 0 }} />
      </View>

      <SectionLabel colors={colors}>{loading ? "Loading…" : `Items (${items.length})`}</SectionLabel>

      {!loading && items.length === 0 ? (
        <Text style={styles.mutedNote}>No content matches these filters.</Text>
      ) : null}

      {items.map((item) => (
        <Row
          key={item.id}
          colors={colors}
          icon="document-text-outline"
          title={item.title}
          subtitle={[humanize(item.type), item.visibility, fmtDate(item.updatedAt)].filter(Boolean).join(" · ")}
          right={<StatusTag colors={colors} status={item.status} />}
          onPress={() => nav.push({ name: "content", contentId: item.id })}
        />
      ))}

      <Sheet colors={colors} visible={creating} title="New content" onClose={() => setCreating(false)}>
        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="What is this about?"
          placeholderTextColor={colors.dimForeground}
          value={newTitle}
          onChangeText={setNewTitle}
        />
        <Text style={styles.fieldLabel}>Summary (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="One or two lines for cards and previews"
          placeholderTextColor={colors.dimForeground}
          value={newSummary}
          onChangeText={setNewSummary}
          multiline
        />
        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.chipWrap}>
          {CONTENT_TYPES.map((t) => {
            const active = t === newType;
            return (
              <TouchableOpacity
                key={t}
                activeOpacity={0.8}
                onPress={() => setNewType(t)}
                style={[styles.chip, active ? { backgroundColor: colors.primaryAlpha, borderColor: colors.primary } : null]}
              >
                <Text style={[styles.chipText, active ? { color: colors.primary } : null]}>{humanize(t)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.fieldLabel}>Visibility</Text>
        <View style={styles.chipWrap}>
          {CONTENT_VISIBILITY.map((v) => {
            const active = v === newVisibility;
            return (
              <TouchableOpacity
                key={v}
                activeOpacity={0.8}
                onPress={() => setNewVisibility(v)}
                style={[styles.chip, active ? { backgroundColor: colors.primaryAlpha, borderColor: colors.primary } : null]}
              >
                <Text style={[styles.chipText, active ? { color: colors.primary } : null]}>{humanize(v)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <ActionButton
          colors={colors}
          label={saving ? "Creating…" : "Create draft"}
          icon="checkmark"
          tone="primary"
          onPress={() => void create()}
          disabled={!newTitle.trim() || saving}
        />
      </Sheet>
    </ScrollView>
  );
}

export function ContentDetailScreen({
  colors,
  session,
  contentId,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  contentId: string;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const isOwner = session.user.role === "owner";
  const [item, setItem] = useState<ContentDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [publishSheet, setPublishSheet] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<PublishingChannel[]>([]);
  const [variantChannel, setVariantChannel] = useState<PublishingChannel | null>(null);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItem(await getContent(session, contentId));
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [session, contentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableActions = useMemo(() => (item ? actionsFor(item.status, isOwner) : []), [item, isOwner]);

  const openPublish = useCallback(() => {
    if (!item) return;
    // Default to the channels that already have an enabled variant, else website.
    const enabled = item.variants.filter((v) => v.enabled).map((v) => v.channel);
    setSelectedChannels(enabled.length ? enabled : ["WEBSITE"]);
    setPublishSheet(true);
  }, [item]);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      if (busy) return;
      setBusy(key);
      setError(null);
      try {
        await fn();
        await load();
        setPublishSheet(false);
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(null);
      }
    },
    [busy, load],
  );

  const openVariant = useCallback((channel: PublishingChannel) => {
    if (!item) return;
    const existing = item.variants.find((v) => v.channel === channel);
    setCaption(existing?.caption ?? "");
    setHashtags((existing?.hashtags ?? []).join(" "));
    setVariantChannel(channel);
  }, [item]);

  const saveVariant = useCallback(async () => {
    if (!item || !variantChannel) return;
    const parsedHashtags = hashtags
      .split(/[\s,]+/)
      .map((h) => h.replace(/^#/, "").trim())
      .filter(Boolean);
    await run(`variant:${variantChannel}`, async () => {
      await saveChannelVariant(session, item.id, variantChannel, {
        enabled: true,
        caption: caption.trim() || null,
        hashtags: parsedHashtags,
      });
    });
    setVariantChannel(null);
  }, [session, item, variantChannel, caption, hashtags, run]);

  const toggleChannel = useCallback((channel: PublishingChannel) => {
    setSelectedChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  }, []);

  if (loading && !item) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <OfficeHeader colors={colors} onBack={nav.pop} eyebrow="Content" title="Loading…" />
      </ScrollView>
    );
  }

  if (!item) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <OfficeHeader colors={colors} onBack={nav.pop} eyebrow="Content" title="Not found" />
        <InlineError colors={colors} message={error ?? "This item could not be loaded."} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <OfficeHeader colors={colors} onBack={nav.pop} eyebrow={humanize(item.type)} title={item.title} subtitle={item.summary} />

      <InlineError colors={colors} message={error} />

      <View style={styles.tagRow}>
        <StatusTag colors={colors} status={item.status} />
        <Tag colors={colors} label={item.visibility} tone="neutral" />
        <Tag colors={colors} label={`rev ${item.revision}`} tone="neutral" />
      </View>

      <SectionLabel colors={colors}>Workflow</SectionLabel>
      {availableActions.length === 0 ? (
        <Text style={styles.mutedNote}>
          {isOwner
            ? "No actions available in this state."
            : "Approval and publishing are owner-only. An owner picks this up from here."}
        </Text>
      ) : (
        <View style={styles.actionRow}>
          {availableActions.map((key) => {
            const meta = ACTION_META[key];
            if (!meta) return null;
            if (key === "publish") {
              return (
                <ActionButton
                  key={key}
                  colors={colors}
                  label={meta.label}
                  icon={meta.icon}
                  tone={meta.tone}
                  onPress={openPublish}
                  style={{ flex: 1, marginBottom: 0 }}
                />
              );
            }
            return (
              <ActionButton
                key={key}
                colors={colors}
                label={busy === key ? "Working…" : meta.label}
                icon={meta.icon}
                tone={meta.tone}
                onPress={() => {
                  if (key === "approve") void run(key, () => approveContent(session, item.id));
                  else if (key === "reject") void run(key, () => rejectContent(session, item.id));
                  else if (key === "submit-review") void run(key, () => submitContentForReview(session, item.id));
                  else if (key === "unpublish") void run(key, () => unpublishContent(session, item.id));
                }}
                style={{ flex: 1, marginBottom: 0 }}
              />
            );
          })}
        </View>
      )}

      <SectionLabel colors={colors}>Details</SectionLabel>
      <View style={styles.card}>
        <DetailLine colors={colors} label="Slug" value={item.slug} />
        <DetailLine colors={colors} label="Visibility" value={item.visibility} />
        <DetailLine colors={colors} label="Language" value={item.language} />
        <DetailLine colors={colors} label="Updated" value={fmtDate(item.updatedAt)} />
        <DetailLine colors={colors} label="Published" value={fmtDate(item.publishedAt)} />
        <DetailLine colors={colors} label="Scheduled" value={fmtDate(item.scheduledAt)} />
        <DetailLine colors={colors} label="SEO title" value={item.seo?.seoTitle} />
        <DetailLine colors={colors} label="SEO description" value={item.seo?.seoDescription} />
        {item.seo?.canonicalUrl ? <DetailLine colors={colors} label="Canonical" value={item.seo.canonicalUrl} /> : null}
      </View>
      {item.seo?.seoTitle || item.seo?.seoDescription ? null : (
        <Text style={styles.hintNote}>No SEO metadata yet — search engines fall back to the title and summary.</Text>
      )}

      <SectionLabel colors={colors}>Channel copy</SectionLabel>
      {item.variants.length === 0 ? (
        <Text style={styles.mutedNote}>No per-channel copy yet. Add a caption before publishing to social.</Text>
      ) : (
        item.variants.map((variant) => (
          <Row
            key={variant.id}
            colors={colors}
            icon={channelIcon(variant.channel)}
            title={humanize(variant.channel)}
            subtitle={variant.caption?.slice(0, 80) || (variant.enabled ? "Enabled, no caption" : "Disabled")}
            right={<StatusTag colors={colors} status={variant.status} />}
            onPress={() => openVariant(variant.channel)}
          />
        ))
      )}
      <View style={styles.chipWrap}>
        {PUBLISHING_CHANNELS.map((channel) => (
          <TouchableOpacity key={channel} activeOpacity={0.8} onPress={() => openVariant(channel)} style={styles.chip}>
            <Ionicons name={channelIcon(channel)} size={13} color={colors.mutedForeground} />
            <Text style={[styles.chipText, { marginLeft: 5 }]}>Edit {humanize(channel)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {item.publications.length > 0 ? (
        <>
          <SectionLabel colors={colors}>Deliveries</SectionLabel>
          {item.publications.map((pub) => (
            <Row
              key={pub.id}
              colors={colors}
              icon={pub.status === "FAILED" ? "warning-outline" : "checkmark-done-outline"}
              title={humanize(pub.channel)}
              subtitle={pub.lastErrorMessage?.slice(0, 90) || pub.externalUrl || `${pub.attemptCount} attempt${pub.attemptCount === 1 ? "" : "s"}`}
              right={<StatusTag colors={colors} status={pub.status} />}
            />
          ))}
        </>
      ) : null}

      <Sheet colors={colors} visible={publishSheet} title="Publish to" onClose={() => setPublishSheet(false)}>
        {PUBLISHING_CHANNELS.map((channel) => {
          const active = selectedChannels.includes(channel);
          return (
            <TouchableOpacity key={channel} activeOpacity={0.8} onPress={() => toggleChannel(channel)} style={styles.pickRow}>
              <Ionicons
                name={active ? "checkmark-circle" : "ellipse-outline"}
                size={20}
                color={active ? colors.primary : colors.dimForeground}
              />
              <Text style={styles.pickRowText}>{humanize(channel)}</Text>
            </TouchableOpacity>
          );
        })}
        <ActionButton
          colors={colors}
          label={busy ? "Publishing…" : `Publish to ${selectedChannels.length} channel${selectedChannels.length === 1 ? "" : "s"}`}
          icon="cloud-upload-outline"
          tone="success"
          onPress={() => void run("publish", () => publishContent(session, item.id, selectedChannels))}
          disabled={busy !== null || selectedChannels.length === 0}
        />
      </Sheet>

      <Sheet
        colors={colors}
        visible={variantChannel !== null}
        title={variantChannel ? `${humanize(variantChannel)} caption` : "Caption"}
        onClose={() => setVariantChannel(null)}
      >
        <Text style={styles.fieldLabel}>Caption</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Channel-specific post copy"
          placeholderTextColor={colors.dimForeground}
          value={caption}
          onChangeText={setCaption}
          multiline
        />
        <Text style={styles.fieldLabel}>Hashtags (space separated)</Text>
        <TextInput
          style={styles.input}
          placeholder="hvac maintenance kenya"
          placeholderTextColor={colors.dimForeground}
          value={hashtags}
          onChangeText={setHashtags}
          autoCapitalize="none"
        />
        <ActionButton
          colors={colors}
          label={busy ? "Saving…" : "Save channel copy"}
          icon="save-outline"
          tone="primary"
          onPress={() => void saveVariant()}
          disabled={busy !== null}
        />
      </Sheet>
    </ScrollView>
  );
}

function channelIcon(channel: PublishingChannel): keyof typeof Ionicons.glyphMap {
  if (channel === "WEBSITE") return "globe-outline";
  if (channel === "LINKEDIN") return "logo-linkedin";
  if (channel === "FACEBOOK") return "logo-facebook";
  return "logo-instagram";
}

function DetailLine({ colors, label, value }: { colors: Palette; label: string; value?: string | null }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      {value ? <Text style={styles.detailValue}>{value}</Text> : null}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xxl },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 12,
    },
    searchInput: { flex: 1, color: colors.foreground, fontSize: 14, fontFamily: fonts.regular, padding: 0 },
    chipRow: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
      backgroundColor: colors.card,
    },
    chipText: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.semibold },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    hintNote: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingHorizontal: spacing.lg },
    card: {
      marginHorizontal: spacing.lg,
      padding: spacing.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 14,
    },
    detailLine: { marginBottom: spacing.sm },
    detailLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.semibold, textTransform: "uppercase", letterSpacing: 0.5 },
    detailValue: { color: colors.foreground, fontSize: 14, fontFamily: fonts.medium, marginTop: 2 },
    pickRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
    pickRowText: { color: colors.foreground, fontSize: 15, fontFamily: fonts.medium },
    fieldLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.semibold, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.sm },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: fonts.regular,
    },
    inputMultiline: { minHeight: 84, textAlignVertical: "top" },
  });
