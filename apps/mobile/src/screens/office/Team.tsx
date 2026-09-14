import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import type { UserDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import {
  createTeamMember,
  listTeam,
  patchTeamMember,
  removeTeamMember,
  removeAvatar,
  uploadAvatar,
} from "../../office-api";
import { UserAvatar } from "../../components/UserAvatar";
import { ActionButton, InlineError, OfficeHeader, Row, SectionLabel, Sheet, Tag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

const ROLES: { value: UserDTO["role"]; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "secretary", label: "Secretary" },
  { value: "technician", label: "Technician" },
];

const INVITABLE_ROLES = ROLES.filter((role) => role.value !== "owner");

function roleLabel(role: string): string {
  return ROLES.find((r) => r.value === role)?.label ?? role.replaceAll("_", " ");
}

export function TeamScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [team, setTeam] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [memberFor, setMemberFor] = useState<UserDTO | null>(null);

  const me = session.user.id;

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        setTeam(await listTeam(session));
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(body: { name: string; email: string; role: UserDTO["role"] }) {
    try {
      const { user } = await createTeamMember(session, {
        name: body.name,
        email: body.email,
        role: body.role as "dispatcher" | "secretary" | "technician",
      });
      setShowInvite(false);
      setError(null);
      setTeam((rows) => [...rows, user].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function saveMember(userId: string, patch: { name?: string; email?: string; phone?: string | null; role?: UserDTO["role"]; active?: boolean; title?: string | null; about?: string | null }) {
    try {
      const updated = await patchTeamMember(session, userId, patch);
      setMemberFor((current) => (current && current.id === userId ? updated : current));
      setError(null);
      setTeam((rows) => rows.map((row) => (row.id === userId ? updated : row)).sort((a, b) => a.name.localeCompare(b.name)));
      return updated;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    }
  }

  async function deactivate(userId: string) {
    try {
      await removeTeamMember(session, userId);
      setMemberFor(null);
      setError(null);
      setTeam((rows) => rows.filter((row) => row.id !== userId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

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
        eyebrow="Owner · Team"
        title="Team & staff"
        subtitle="Invite people, set roles and manage who can sign in. The final owner can never be demoted or removed."
        onBack={nav.pop}
      />

      <InlineError colors={colors} message={error} />

      <TouchableOpacity style={styles.newBtn} activeOpacity={0.85} onPress={() => setShowInvite(true)}>
        <Ionicons name="person-add-outline" size={17} color={colors.primary} />
        <Text style={[styles.newBtnText, { color: colors.primary }]}>Invite team member</Text>
      </TouchableOpacity>

      <SectionLabel colors={colors}>{team.length} active member{team.length === 1 ? "" : "s"}</SectionLabel>
      {loading ? (
        <Text style={styles.mutedNote}>Loading team…</Text>
      ) : team.length === 0 ? (
        <Text style={styles.mutedNote}>No active members yet.</Text>
      ) : (
        team.map((member) => (
          <Row
            key={member.id}
            colors={colors}
            avatar={<UserAvatar colors={colors} name={member.name} uri={member.profilePictureUrl} size={38} />}
            title={`${member.name}${member.id === me ? " (you)" : ""}`}
            subtitle={[member.title, member.email, member.phone].filter(Boolean).join(" · ")}
            right={<Tag colors={colors} label={roleLabel(member.role)} tone={member.role === "owner" ? "primary" : "neutral"} />}
            onPress={() => setMemberFor(member)}
          />
        ))
      )}

      {showInvite ? (
        <InviteSheet colors={colors} session={session} onCancel={() => setShowInvite(false)} onSubmit={invite} />
      ) : null}
      {memberFor ? (
        <MemberSheet
          colors={colors}
          session={session}
          member={memberFor}
          isSelf={memberFor.id === me}
          onClose={() => setMemberFor(null)}
          onSave={saveMember}
          onDeactivate={deactivate}
          onAvatarChange={(user) => {
            setMemberFor((current) => (current && current.id === user.id ? user : current));
            setTeam((rows) => rows.map((row) => (row.id === user.id ? user : row)).sort((a, b) => a.name.localeCompare(b.name)));
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function InviteSheet({
  colors,
  session,
  onCancel,
  onSubmit,
}: {
  colors: Palette;
  session: StoredStaffSession;
  onCancel: () => void;
  onSubmit: (body: { name: string; email: string; role: UserDTO["role"] }) => void;
}) {
  const styles = createStyles(colors);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserDTO["role"]>("technician");
  const [result, setResult] = useState<{ password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const validating = name.trim().length > 0 && email.trim().includes("@");

  return (
    <Sheet colors={colors} visible title="Invite team member" onClose={onCancel}>
      {result ? (
        <View style={styles.inviteResult}>
          <View style={[styles.inviteResultIcon, { backgroundColor: colors.successAlpha }]}>
            <Ionicons name="checkmark" size={22} color={colors.success} />
          </View>
          <Text style={styles.inviteResultTitle}>{`Invite sent to ${email.trim()}`}</Text>
          <Text style={styles.inviteResultBody}>
            They can sign in right away with the temporary password below. Ask them to change it after first login.
          </Text>
          <View style={styles.passwordBox}>
            <Text style={[styles.passwordText, { color: colors.foreground }]}>{result.password}</Text>
          </View>
          <TouchableOpacity
            style={[styles.sheetActionBtn, { backgroundColor: colors.primary }]}
            onPress={onCancel}
            activeOpacity={0.8}
          >
            <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            placeholder="e.g. Nadia Fotso"
            placeholderTextColor={colors.dimForeground}
            style={[styles.input, { color: colors.foreground }]}
          />
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            placeholder="nadia@yourbusiness.com"
            placeholderTextColor={colors.dimForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.input, { color: colors.foreground }]}
          />
          <Text style={styles.fieldLabel}>Role</Text>
          <View style={styles.roleRow}>
            {INVITABLE_ROLES.map((option) => {
              const active = role === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.roleChip, active && { backgroundColor: colors.primaryAlpha, borderColor: colors.primary }]}
                  onPress={() => setRole(option.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.roleChipText, active && { color: colors.primary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {error ? <View style={styles.inlineMsg}><Text style={[styles.inlineMsgText, { color: colors.danger }]}>{error}</Text></View> : null}
          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]}
              onPress={onCancel}
              activeOpacity={0.8}
              disabled={busy}
            >
              <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, (busy || !validating) && { opacity: 0.45 }]}
              disabled={busy || !validating}
              onPress={() => {
                if (!validating) {
                  setError("Name and a valid email are required.");
                  return;
                }
                setBusy(true);
                setError(null);
                createTeamMember(session, { name: name.trim(), email: email.trim().toLowerCase(), role: role as "dispatcher" | "secretary" | "technician" })
                  .then((response) => {
                    setResult({ password: response.temporaryPassword });
                    onSubmit({ name: name.trim(), email: email.trim(), role });
                  })
                  .catch((caught) => {
                    setError(caught instanceof Error ? caught.message : String(caught));
                  })
                  .finally(() => setBusy(false));
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>{busy ? "Inviting…" : "Invite"}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </Sheet>
  );
}

function MemberSheet({
  colors,
  session,
  member,
  isSelf,
  onClose,
  onSave,
  onDeactivate,
  onAvatarChange,
}: {
  colors: Palette;
  session: StoredStaffSession;
  member: UserDTO;
  isSelf: boolean;
  onClose: () => void;
  onSave: (userId: string, patch: { name?: string; email?: string; phone?: string | null; role?: UserDTO["role"]; active?: boolean; title?: string | null; about?: string | null }) => Promise<UserDTO | null>;
  onDeactivate: (userId: string) => Promise<void>;
  onAvatarChange: (user: UserDTO) => void;
}) {
  const styles = createStyles(colors);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [role, setRole] = useState<UserDTO["role"]>(member.role);
  const [title, setTitle] = useState(member.title ?? "");
  const [about, setAbout] = useState(member.about ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(member.profilePictureUrl);

  const dirty =
    name.trim() !== member.name ||
    email.trim().toLowerCase() !== member.email ||
    phone.trim() !== (member.phone ?? "") ||
    role !== member.role ||
    title.trim() !== (member.title ?? "") ||
    about.trim() !== (member.about ?? "");

  async function submit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const updated = await onSave(member.id, {
      name: name.trim(),
      email: email.trim().toLowerCase() || undefined,
      phone: phone.trim() || null,
      role,
      title: title.trim() || null,
      about: about.trim() || null,
    });
    setBusy(false);
    if (updated) {
      setName(updated.name);
      setEmail(updated.email);
      setPhone(updated.phone ?? "");
      setRole(updated.role);
      setTitle(updated.title ?? "");
      setAbout(updated.about ?? "");
    }
  }

  async function pickAvatar() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      setAvatarBusy(true);
      setError(null);
      try {
        const updated = await uploadAvatar(session, member.id, asset.uri);
        setAvatarUri(updated.profilePictureUrl);
        onAvatarChange(updated);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setAvatarBusy(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function clearAvatar() {
    setAvatarBusy(true);
    setError(null);
    try {
      const updated = await removeAvatar(session, member.id);
      setAvatarUri(null);
      onAvatarChange(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    await onDeactivate(member.id);
  }

  return (
    <Sheet colors={colors} visible title={member.name} onClose={onClose}>
      <View style={styles.memberMeta}>
        <Tag colors={colors} label={`${roleLabel(member.role)}${isSelf ? " · you" : ""}`} tone={member.role === "owner" ? "primary" : "neutral"} />
        {member.role === "owner" || isSelf ? null : <Text style={styles.memberMetaText}>Changing a role or deactivating sends this member to the sign-in wall on next login.</Text>}
      </View>

      <View style={[styles.avatarSection, { borderColor: colors.border }]}>
        <UserAvatar colors={colors} name={member.name} uri={avatarUri} size={64} />
        <View style={styles.avatarActions}>
          <TouchableOpacity
            style={[styles.avatarBtn, { backgroundColor: colors.surfaceMuted }]}
            onPress={() => void pickAvatar()}
            activeOpacity={0.8}
            disabled={avatarBusy}
          >
            <Ionicons name="camera-outline" size={15} color={colors.primary} />
            <Text style={[styles.avatarBtnText, { color: colors.primary }]}>Change photo</Text>
          </TouchableOpacity>
          {avatarUri ? (
            <TouchableOpacity
              style={[styles.avatarBtn, { backgroundColor: colors.surfaceMuted }]}
              onPress={() => void clearAvatar()}
              activeOpacity={0.8}
              disabled={avatarBusy}
            >
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={[styles.avatarBtnText, { color: colors.danger }]}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {avatarBusy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(null);
        }}
        placeholder="Full name"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setError(null);
        }}
        placeholder="name@yourbusiness.com"
        placeholderTextColor={colors.dimForeground}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>Phone</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="+237 6XX XXX XXX"
        placeholderTextColor={colors.dimForeground}
        keyboardType="phone-pad"
        style={[styles.input, { color: colors.foreground }]}
      />

      <Text style={styles.fieldLabel}>Job title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Senior technician, Head of dispatch…"
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, { color: colors.foreground }]}
      />
      <Text style={styles.fieldLabel}>About</Text>
      <TextInput
        value={about}
        onChangeText={setAbout}
        placeholder="A short line about this team member (optional)"
        placeholderTextColor={colors.dimForeground}
        multiline
        numberOfLines={3}
        style={[styles.input, { color: colors.foreground, minHeight: 76, textAlignVertical: "top" }]}
      />

      <Text style={styles.fieldLabel}>Role</Text>
      {isSelf ? (
        <Text style={styles.memberMetaText}>You can't change your own role. Ask another owner.</Text>
      ) : (
        <View style={styles.roleRow}>
          {ROLES.map((option) => {
            const active = role === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.roleChip, active && { backgroundColor: colors.primaryAlpha, borderColor: colors.primary }]}
                onPress={() => setRole(option.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.roleChipText, active && { color: colors.primary }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <InlineError colors={colors} message={error} />

      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onClose} activeOpacity={0.8} disabled={busy}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Close</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }, (busy || !dirty) && { opacity: 0.45 }]}
          disabled={busy || !dirty}
          onPress={() => void submit()}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>Save changes</Text>
        </TouchableOpacity>
      </View>

      {!isSelf ? (
        confirmRemove ? (
          <View style={[styles.confirmBox, { backgroundColor: colors.dangerAlpha }]}>
            <Text style={[styles.confirmText, { color: colors.danger }]}>
              Deactivate {member.name}? They lose access immediately and won't appear on the board.
            </Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={() => setConfirmRemove(false)} activeOpacity={0.8} disabled={busy}>
                <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.danger }, busy && { opacity: 0.5 }]} onPress={() => void deactivate()} activeOpacity={0.8} disabled={busy}>
                <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>{busy ? "Removing…" : "Deactivate"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ActionButton colors={colors} label="Deactivate member" icon="person-remove-outline" tone="danger" onPress={() => setConfirmRemove(true)} style={{ marginTop: spacing.md }} />
        )
      ) : null}
    </Sheet>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    newBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    newBtnText: { fontSize: 14, fontFamily: fonts.semibold },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    fieldLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.semibold, marginTop: spacing.sm, marginBottom: 6 },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      fontFamily: fonts.regular,
      fontSize: 15,
    },
    roleRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    roleChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    roleChipText: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.semibold },
    avatarSection: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderWidth: 1,
      borderRadius: 12,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    avatarActions: { flex: 1, gap: spacing.sm },
    avatarBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    avatarBtnText: { fontSize: 13, fontFamily: fonts.semibold },
    sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    sheetActionBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12 },
    sheetActionText: { fontSize: 14, fontFamily: fonts.bold },
    inlineMsg: { marginTop: spacing.sm },
    inlineMsgText: { fontSize: 13, fontFamily: fonts.medium },
    memberMeta: { gap: spacing.sm, marginBottom: spacing.sm },
    memberMetaText: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.regular, lineHeight: 17 },
    inviteResult: { alignItems: "center", paddingTop: spacing.sm },
    inviteResultIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    inviteResultTitle: { color: colors.foreground, fontSize: 17, fontFamily: fonts.bold, marginTop: spacing.md },
    inviteResultBody: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, lineHeight: 18, textAlign: "center", marginTop: spacing.sm },
    passwordBox: {
      alignSelf: "stretch",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    passwordText: { fontSize: 17, fontFamily: fonts.bold },
    confirmBox: { borderRadius: 12, padding: spacing.sm, marginTop: spacing.md },
    confirmText: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 18 },
  });