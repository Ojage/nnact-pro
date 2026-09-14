import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { BrandLogo } from "@nnact/mobile-ui";
import { buildGoogleMapsDirectionsUrl, NNACT_COMPANY } from "@nnact/shared";
import type { StoredStaffSession } from "../auth-storage";
import type { SyncService } from "../sync/service";
import { listTeam, patchTeamMember, removeAvatar, uploadAvatar } from "../office-api";
import { fonts, radius, spacing, type Palette } from "../theme";

type SyncTone = "success" | "warning" | "danger" | "dim";

function humanizeRole(role: string) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  const single = parts[0] ?? "?";
  return single.slice(0, 2).toUpperCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AccountScreen({
  colors,
  session,
  offline,
  lastSync,
  queuedWrites,
  unreadNotifications,
  refreshing,
  error,
  onRefresh,
  getSyncService,
  onOpenNotifications,
  onOpenChangePassword,
  onSignOut,
  signingOut,
}: {
  colors: Palette;
  session: StoredStaffSession;
  offline: boolean;
  lastSync: string | null;
  queuedWrites: number;
  unreadNotifications: number;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  getSyncService?: () => SyncService | null;
  onOpenNotifications?: () => void;
  onOpenChangePassword?: () => void;
  onSignOut: () => void;
  signingOut?: boolean;
}) {
  const styles = createStyles(colors);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [cachedJobs, setCachedJobs] = useState<number | null>(null);
  const [storedBytes, setStoredBytes] = useState<number | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [about, setAbout] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const [savedAbout, setSavedAbout] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadSelf = useCallback(async () => {
    try {
      const team = await listTeam(session);
      const me = team.find((row) => row.id === session.user.id);
      if (me) {
        setProfileUrl(me.profilePictureUrl);
        setTitle(me.title ?? "");
        setAbout(me.about ?? "");
        setSavedTitle(me.title ?? "");
        setSavedAbout(me.about ?? "");
      }
    } catch {
      // Profile stays empty offline; editing below surfaces any network error.
    }
  }, [session]);

  useEffect(() => {
    void loadSelf();
  }, [loadSelf]);

  const profileDirty = title.trim() !== savedTitle || about.trim() !== savedAbout;

  async function saveProfile() {
    setProfileBusy(true);
    setProfileError(null);
    try {
      const updated = await patchTeamMember(session, session.user.id, {
        title: title.trim() || null,
        about: about.trim() || null,
      });
      setTitle(updated.title ?? "");
      setAbout(updated.about ?? "");
      setSavedTitle(updated.title ?? "");
      setSavedAbout(updated.about ?? "");
      setProfileUrl(updated.profilePictureUrl);
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || result.assets.length === 0) return;
      setProfileBusy(true);
      setProfileError(null);
      try {
        const updated = await uploadAvatar(session, session.user.id, result.assets[0].uri);
        setProfileUrl(updated.profilePictureUrl);
        setTitle(updated.title ?? "");
        setAbout(updated.about ?? "");
        setSavedTitle(updated.title ?? "");
        setSavedAbout(updated.about ?? "");
      } catch (caught) {
        setProfileError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setProfileBusy(false);
      }
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function removePhoto() {
    setProfileBusy(true);
    setProfileError(null);
    try {
      const updated = await removeAvatar(session, session.user.id);
      setProfileUrl(updated.profilePictureUrl);
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setProfileBusy(false);
    }
  }

  const roleLabel = humanizeRole(session.user.role);
  const connected = !offline;

  interface SyncSummary {
    label: string;
    value: string;
    tone: SyncTone;
    detail?: string;
    retryable: boolean;
  }

  const syncSummary: SyncSummary = refreshing
    ? { label: "Data sync", value: "Syncing…", tone: "dim", retryable: false }
    : offline
      ? { label: "Data sync", value: error ? "Needs attention" : "Offline", tone: "danger", detail: lastSync ? `Last synced ${lastSync}` : undefined, retryable: Boolean(error) }
      : queuedWrites > 0
        ? { label: "Data sync", value: `${queuedWrites} change${queuedWrites > 1 ? "s" : ""} waiting`, tone: "warning", detail: lastSync ? `Last synced ${lastSync}` : undefined, retryable: true }
        : { label: "Data sync", value: "Up to date", tone: "success", detail: lastSync ? `Last synced ${lastSync}` : undefined, retryable: false };

  const statusTone = connected ? colors.success : colors.warning;
  const statusText = connected ? "Online" : "Offline mode";
  const statusDetail = offline && lastSync ? `Last synced ${lastSync}` : undefined;

  const loadOfflineInfo = useCallback(async () => {
    const service = getSyncService?.();
    if (!service) return;
    try {
      const [jobs, bytes] = await Promise.all([service.countCachedPackages(), service.storedBytes()]);
      setCachedJobs(jobs);
      setStoredBytes(bytes);
    } catch {
      setCachedJobs(0);
      setStoredBytes(0);
    }
  }, [getSyncService]);

  useEffect(() => {
    if (offlineOpen) void loadOfflineInfo();
  }, [offlineOpen, loadOfflineInfo]);

  function openOfflinePanel() {
    setOfflineOpen((open) => !open);
  }

  const syncToneColor =
    syncSummary.tone === "dim"
      ? colors.mutedForeground
      : syncSummary.tone === "success"
        ? colors.success
        : syncSummary.tone === "warning"
          ? colors.warning
          : colors.danger;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Account</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <BrandLogo size={34} style={styles.heroLogo} />
          <View style={styles.wordmark}>
            <Text style={styles.brandName}>NNACT PRO</Text>
            <Text style={styles.brandRole}>TECHNICIAN</Text>
          </View>
        </View>

        <View style={styles.identityRow}>
          {profileUrl ? (
            <Image source={{ uri: profileUrl }} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsFromName(session.user.name)}</Text>
            </View>
          )}
          <View style={styles.identityCopy}>
            <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
              {session.user.name}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {session.user.email}
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.heroFooter}>
          <View style={styles.statusLine}>
            <View style={[styles.statusDot, { backgroundColor: statusTone }]} />
            <Text style={styles.statusText}>{statusText}</Text>
            {statusDetail ? <Text style={styles.statusDetail}>{statusDetail}</Text> : null}
          </View>
          <View style={styles.sessionLine}>
            <Ionicons name="phone-portrait-outline" size={14} color="rgba(250,245,238,0.72)" />
            <Text style={styles.sessionText}>This device</Text>
          </View>
        </View>
      </View>

      <View style={styles.operations}>
        <View style={styles.opCell}>
          <Text style={styles.opLabel}>Connectivity</Text>
          <View style={styles.opValueRow}>
            <View style={[styles.opDot, { backgroundColor: statusTone }]} />
            <Text style={[styles.opValue, { color: connected ? colors.success : colors.warning }]}>{connected ? "Online" : "Offline"}</Text>
          </View>
        </View>
        <View style={styles.opDivider} />
        <View style={styles.opCell}>
          <Text style={styles.opLabel}>{syncSummary.label}</Text>
          <Text style={[styles.opValue, { color: syncToneColor }]}>{syncSummary.value}</Text>
        </View>
        <View style={styles.opDivider} />
        <View style={styles.opCell}>
          <Text style={styles.opLabel}>Pending changes</Text>
          <Text style={[styles.opValue, { color: queuedWrites > 0 ? colors.warning : colors.foreground }]}>{queuedWrites}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.group}>
          <View style={styles.profilePhotoRow}>
            {profileUrl ? (
              <Image source={{ uri: profileUrl }} style={styles.profilePhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.profilePhoto, styles.profilePhotoFallback, { backgroundColor: colors.primaryMuted }]}>
                <Ionicons name="person" size={26} color={colors.primary} />
              </View>
            )}
            <View style={styles.profilePhotoActions}>
              <TouchableOpacity style={[styles.profileActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={() => void changePhoto()} activeOpacity={0.8} disabled={profileBusy}>
                <Ionicons name="camera-outline" size={15} color={colors.primary} />
                <Text style={[styles.profileActionText, { color: colors.primary }]}>Change photo</Text>
              </TouchableOpacity>
              {profileUrl ? (
                <TouchableOpacity style={[styles.profileActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={() => void removePhoto()} activeOpacity={0.8} disabled={profileBusy}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.profileActionText, { color: colors.danger }]}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.rowDivider} />

          <View style={[styles.profileFieldWrap, { marginTop: spacing.sm }]}>
            <Text style={[styles.profileFieldLabel, { color: colors.mutedForeground }]}>Job title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Senior technician (shown to the team)"
              placeholderTextColor={colors.dimForeground}
              style={[styles.profileInput, { color: colors.foreground, backgroundColor: colors.surfaceMuted }]}
            />
          </View>
          <View style={[styles.profileFieldWrap, { marginTop: spacing.sm }]}>
            <Text style={[styles.profileFieldLabel, { color: colors.mutedForeground }]}>About</Text>
            <TextInput
              value={about}
              onChangeText={setAbout}
              placeholder="A short line about you (optional)"
              placeholderTextColor={colors.dimForeground}
              multiline
              numberOfLines={3}
              style={[styles.profileInput, { color: colors.foreground, backgroundColor: colors.surfaceMuted, minHeight: 76, textAlignVertical: "top" }]}
            />
          </View>

          {profileError ? (
            <View style={{ marginTop: spacing.sm, paddingHorizontal: spacing.md }}>
              <Text style={[styles.rowValue, { color: colors.danger }]}>{profileError}</Text>
            </View>
          ) : null}

          <View style={styles.profileSaveRow}>
            <TouchableOpacity
              style={[styles.profileSaveBtn, { backgroundColor: colors.primary }, (profileBusy || !profileDirty) && { opacity: 0.5 }]}
              onPress={() => void saveProfile()}
              activeOpacity={0.8}
              disabled={profileBusy || !profileDirty}
            >
              {profileBusy ? <ActivityIndicator size="small" color={colors.onEmphasis} /> : <Text style={[styles.profileSaveText, { color: colors.onEmphasis }]}>Save profile</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Field app</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={onRefresh} disabled={refreshing} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Sync, ${syncSummary.value}`}>
            <View style={styles.rowIcon}>
              {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync-outline" size={19} color={colors.primary} />}
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Sync</Text>
              <Text style={[styles.rowValue, { color: syncToneColor }]}>
                {refreshing ? "Syncing…" : syncSummary.detail ?? syncSummary.value}
              </Text>
            </View>
            {syncSummary.retryable && !refreshing ? (
              <View style={styles.rowAction}>
                <Text style={styles.rowActionText}>Sync now</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
            )}
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.row} onPress={openOfflinePanel} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Offline data, ${cachedJobs != null ? `${cachedJobs} jobs cached, ${queuedWrites} pending uploads` : "tap for details"}`} accessibilityState={{ expanded: offlineOpen }}>
            <View style={styles.rowIcon}>
              <Ionicons name="cloud-download-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Offline data</Text>
              <Text style={styles.rowValue}>
                {cachedJobs != null
                  ? offlineOpen
                    ? "Details"
                    : `${queuedWrites > 0 ? `${queuedWrites} pending upload` + (queuedWrites > 1 ? "s" : "") : "Ready for field work"} · ${cachedJobs} job${cachedJobs === 1 ? "" : "s"}`
                  : queuedWrites > 0
                    ? `${queuedWrites} pending upload${queuedWrites > 1 ? "s" : ""}`
                    : "Ready for field work"}
              </Text>
            </View>
            <Ionicons name={offlineOpen ? "chevron-up" : "chevron-forward"} size={18} color={colors.dimForeground} />
          </TouchableOpacity>
          {offlineOpen ? (
            <View style={styles.offlinePanel}>
              <View style={styles.offlineStat}>
                <Text style={styles.offlineStatLabel}>Jobs cached</Text>
                <Text style={styles.offlineStatValue}>{cachedJobs ?? "…"}</Text>
              </View>
              <View style={styles.offlineStat}>
                <Text style={styles.offlineStatLabel}>Pending uploads</Text>
                <Text style={styles.offlineStatValue}>{queuedWrites}</Text>
              </View>
              <View style={styles.offlineStat}>
                <Text style={styles.offlineStatLabel}>Storage used</Text>
                <Text style={styles.offlineStatValue}>{storedBytes != null ? formatBytes(storedBytes) : "…"}</Text>
              </View>
              <Text style={styles.offlineNote}>
                Offline field packages and readings are stored on this device and upload when you sync.
              </Text>
            </View>
          ) : null}

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.row} onPress={onOpenNotifications} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Notifications">
            <View style={styles.rowIcon}>
              <Ionicons name="notifications-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowValue}>{unreadNotifications > 0 ? `${unreadNotifications} unread` : "Job assignments, dispatch & alerts"}</Text>
            </View>
            {unreadNotifications > 0 ? <View style={styles.notifBadge}><Text style={styles.notifBadgeText}>{unreadNotifications > 9 ? "9+" : unreadNotifications}</Text></View> : null}
            <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={onOpenChangePassword} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Change password">
            <View style={styles.rowIcon}>
              <Ionicons name="lock-closed-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Change password</Text>
              <Text style={styles.rowValue}>Keep your sign-in private</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="phone-portrait-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Active session</Text>
              <Text style={styles.rowValue}>This device</Text>
            </View>
            <View style={styles.sessionDot} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => void Linking.openURL(`tel:${NNACT_COMPANY.contact.phones[0].replace(/\s/g, "")}`)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Call dispatch, ${NNACT_COMPANY.contact.phones[0]}`}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="call-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Call dispatch</Text>
              <Text style={styles.rowValue}>{NNACT_COMPANY.contact.phones[0]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => void Linking.openURL(`mailto:${NNACT_COMPANY.contact.email}`)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Email support, ${NNACT_COMPANY.contact.email}`}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="mail-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Email support</Text>
              <Text style={styles.rowValue}>{NNACT_COMPANY.contact.email}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => void Linking.openURL(buildGoogleMapsDirectionsUrl())}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Get directions to the NNACT workshop"
          >
            <View style={styles.rowIcon}>
              <Ionicons name="navigate-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Workshop &amp; directions</Text>
              <Text style={styles.rowValue}>{`${NNACT_COMPANY.location.streetAddress}, ${NNACT_COMPANY.location.addressLocality}`}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.about}>
        <BrandLogo size={40} style={styles.aboutLogo} />
        <Text style={styles.aboutName}>{`${NNACT_COMPANY.shortName} Pro Technician`}</Text>
        <Text style={styles.aboutVersion}>
          Version {Constants.expoConfig?.version ?? Constants.nativeApplicationVersion ?? "1.0.0"}
          {Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ""}
        </Text>
        <Text style={styles.slogan}>{NNACT_COMPANY.tagline.toUpperCase()}</Text>
      </View>

      <TouchableOpacity
        style={[styles.signOut, signingOut && styles.signOutDisabled]}
        onPress={() => confirmSignOut({ queuedWrites, onConfirm: onSignOut })}
        disabled={signingOut}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Sign out of NNACT Pro"
      >
        {signingOut ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="log-out-outline" size={18} color={colors.danger} />}
        <Text style={styles.signOutText}>{signingOut ? "Signing out…" : "Sign out"}</Text>
      </TouchableOpacity>

      <View style={styles.footerPad} />
    </ScrollView>
  );
}

/** Confirms sign-out with honesty about queued offline work (it persists on device). */
export function confirmSignOut({ queuedWrites, onConfirm }: { queuedWrites: number; onConfirm: () => void }) {
  const pending = queuedWrites > 0;
  const message = pending
    ? `${queuedWrites} change${queuedWrites > 1 ? "s haven't" : " hasn't"} synced yet. It stays safely on this device and will upload the next time you sign in.`
    : "Your field data is up to date and stays on this device. You can sign back in any time.";
  Alert.alert(
    "Sign out?",
    message,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: onConfirm },
    ],
    { cancelable: true },
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.lg },

    topBar: {
      paddingHorizontal: spacing.lg,
      paddingTop: Platform.OS === "ios" ? 58 : 44,
    },
    topBarTitle: { color: colors.foreground, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: -0.4 },

    hero: {
      marginTop: spacing.md,
      marginHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.brandCharcoal,
      overflow: "hidden",
      paddingTop: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    heroHeader: { flexDirection: "row", alignItems: "center" },
    heroLogo: { marginRight: 10 },
    wordmark: { gap: 0, marginLeft: 10 },
    brandName: { color: colors.brandWarmWhite, fontSize: 16, fontFamily: fonts.bold, letterSpacing: 0.6 },
    brandRole: { color: colors.brandOrangeBright, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 2.2 },
    identityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.brandCharcoalElevated,
      borderWidth: 2,
      borderColor: colors.brandOrangeBright,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.brandWarmWhite, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: 0.5 },
    avatarImage: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2,
      borderColor: colors.brandOrangeBright,
      backgroundColor: colors.brandCharcoalElevated,
    },
    profilePhotoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    profilePhoto: { width: 64, height: 64, borderRadius: 32 },
    profilePhotoFallback: { alignItems: "center", justifyContent: "center" },
    profilePhotoActions: { flex: 1, gap: spacing.sm },
    profileActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    profileActionText: { fontSize: 13, fontFamily: fonts.semibold },
    profileFieldWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
    profileFieldLabel: { fontSize: 10.5, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
    profileInput: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.regular,
    },
    profileSaveRow: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
    profileSaveBtn: {
      height: 44,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    profileSaveText: { fontSize: 14, fontFamily: fonts.bold },
    identityCopy: { flex: 1, gap: 4 },
    name: { color: colors.brandWarmWhite, fontSize: 22, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
    email: { color: "rgba(250,245,238,0.76)", fontSize: 13, fontFamily: fonts.regular },
    roleBadge: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: "rgba(242,183,5,0.45)",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
      marginTop: 2,
      backgroundColor: "rgba(242,183,5,0.12)",
    },
    roleText: { color: colors.brandOrangeBright, fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 1.2, textTransform: "uppercase" },
    heroFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: "rgba(250,245,238,0.12)",
      paddingBottom: spacing.md,
    },
    statusLine: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    statusText: { color: colors.brandWarmWhite, fontSize: 13, fontFamily: fonts.bold },
    statusDetail: { color: "rgba(250,245,238,0.72)", fontSize: 12, fontFamily: fonts.regular, marginLeft: 8, flexShrink: 1 },
    sessionLine: { flexDirection: "row", alignItems: "center", gap: 5 },
    sessionText: { color: "rgba(250,245,238,0.72)", fontSize: 12, fontFamily: fonts.medium },

    operations: {
      flexDirection: "row",
      alignItems: "stretch",
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingVertical: spacing.md,
    },
    opCell: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
    opLabel: { color: colors.mutedForeground, fontSize: 10.5, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.5 },
    opValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    opDot: { width: 7, height: 7, borderRadius: 4 },
    opValue: { fontSize: 15, fontFamily: fonts.bold },
    opDivider: { width: 1, backgroundColor: colors.borderLight },

    section: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
    sectionTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.6 },
    group: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 60,
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: { flex: 1, gap: 2 },
    rowTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.semibold },
    rowValue: { color: colors.mutedForeground, fontSize: 12.5, fontFamily: fonts.regular },
    rowAction: {
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.accentMuted,
    },
    rowActionText: { color: colors.warning, fontSize: 13, fontFamily: fonts.bold },
    rowDivider: { height: 1, backgroundColor: colors.borderLight, marginLeft: 72 },
    notifBadge: {
      backgroundColor: colors.danger,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 5,
    },
    notifBadgeText: { color: colors.onEmphasis, fontSize: 10, fontFamily: fonts.bold },
    sessionDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },

    offlinePanel: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    offlineStat: {
      flexGrow: 1,
      flexBasis: "30%",
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
    },
    offlineStatLabel: { color: colors.mutedForeground, fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.4 },
    offlineStatValue: { color: colors.foreground, fontSize: 18, fontFamily: fonts.extraBold, marginTop: 2 },
    offlineNote: { color: colors.dimForeground, fontSize: 11.5, fontFamily: fonts.regular, lineHeight: 16, marginTop: 2, flexBasis: "100%" },

    about: { alignItems: "center", marginTop: spacing.xl, paddingHorizontal: spacing.lg },
    aboutLogo: { marginBottom: spacing.sm },
    aboutName: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, textAlign: "center" },
    aboutVersion: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.regular, marginTop: 2, textAlign: "center" },
    slogan: { color: colors.warning, fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 1.4, marginTop: spacing.sm, textAlign: "center" },

    signOut: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 13,
    },
    signOutDisabled: { opacity: 0.6 },
    signOutText: { color: colors.danger, fontSize: 15, fontFamily: fonts.bold },

    footerPad: { height: spacing.xl },
  });