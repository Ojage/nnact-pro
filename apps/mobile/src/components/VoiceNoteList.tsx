import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import type { JobVoiceNoteDTO } from "@nnact/shared";
import { voiceNoteFileUrl } from "../field-api";
import { fonts, spacing, type Palette } from "../theme";

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Ticks({ colors, note }: { colors: Palette; note: JobVoiceNoteDTO }) {
  if (note.readAt) {
    return <Ionicons name="checkmark-done" size={16} color={colors.success} />;
  }
  if (note.deliveredAt) {
    return <Ionicons name="checkmark-done" size={16} color={colors.mutedForeground} />;
  }
  return <Ionicons name="checkmark" size={16} color={colors.mutedForeground} />;
}

export function VoiceNoteList({
  colors,
  accessToken,
  notes,
}: {
  colors: Palette;
  accessToken: string;
  notes: JobVoiceNoteDTO[];
}) {
  const styles = createStyles(colors);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = playingId ? { uri: voiceNoteFileUrl(playingId, accessToken) } : null;
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (!playingId) return;
    if (status.isLoaded) {
      setLoadingId(null);
      player.play();
      return;
    }
    const timer = setTimeout(() => {
      setLoadingId(null);
      setError("Could not load voice note");
      setPlayingId(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [playingId, player, status.isLoaded]);

  useEffect(() => {
    if (playingId && status.didJustFinish) {
      player.pause();
      setPlayingId(null);
    }
  }, [playingId, player, status.didJustFinish]);

  const togglePlay = useCallback(
    (note: JobVoiceNoteDTO) => {
      if (playingId === note.id) {
        player.pause();
        setPlayingId(null);
        return;
      }
      if (playingId) player.pause();
      setError(null);
      setLoadingId(note.id);
      setPlayingId(note.id);
    },
    [playingId, player],
  );

  if (notes.length === 0) return null;

  const activeRatio =
    playingId && status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  return (
    <View style={styles.wrap}>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
      {notes.map((note) => {
        const isActive = playingId === note.id;
        const isLoading = loadingId === note.id;
        return (
          <View key={note.id} style={styles.row}>
            <TouchableOpacity
              style={[styles.playButton, isActive && styles.playButtonActive]}
              activeOpacity={0.8}
              disabled={isLoading}
              onPress={() => togglePlay(note)}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.onEmphasis} />
              ) : (
                <Ionicons
                  name={isActive ? "pause" : "play"}
                  size={16}
                  color={isActive ? colors.onEmphasis : colors.primary}
                />
              )}
            </TouchableOpacity>

            <View style={styles.flexOne}>
              <View style={styles.labelRow}>
                <Text style={styles.noteMeta}>
                  {note.authorName}
                  {note.durationMs ? ` · ${formatDuration(note.durationMs)}` : ""}
                </Text>
                {isActive && activeRatio > 0 ? (
                  <Text style={styles.progressText}>{formatDuration((status.currentTime ?? 0) * 1000)}</Text>
                ) : null}
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${isActive ? activeRatio * 100 : 0}%` }]} />
              </View>
            </View>

            <Ticks colors={colors} note={note} />
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { marginTop: spacing.sm, gap: spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      padding: spacing.sm,
    },
    playButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    playButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    flexOne: { flex: 1, minWidth: 0 },
    labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    noteMeta: { color: colors.foreground, fontSize: 12, fontFamily: fonts.semibold },
    progressText: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.medium },
    progressTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderLight,
      marginTop: 6,
      overflow: "hidden",
    },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
    error: { color: colors.danger, fontSize: 12, marginBottom: 4, fontFamily: fonts.medium },
  });