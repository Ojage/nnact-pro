import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Audio, type AVPlaybackStatus } from "expo-av";
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ positionMs: number; durationMs: number } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopPlayback = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch {
        // already unloaded
      }
    }
    setPlayingId(null);
    setProgress(null);
  }, []);

  const togglePlay = useCallback(
    async (note: JobVoiceNoteDTO) => {
      if (playingId === note.id) {
        await stopPlayback();
        return;
      }
      await stopPlayback().catch(() => {});
      setLoadingId(note.id);
      setError(null);
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: voiceNoteFileUrl(note.id, accessToken) },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        setPlayingId(note.id);
        setProgress({ positionMs: 0, durationMs: note.durationMs || 0 });
        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            void stopPlayback();
            return;
          }
          setProgress({
            positionMs: status.positionMillis ?? 0,
            durationMs: status.durationMillis ?? note.durationMs ?? 0,
          });
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not play voice note");
      } finally {
        setLoadingId(null);
      }
    },
    [accessToken, playingId, stopPlayback],
  );

  useEffect(() => {
    return () => {
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) void sound.unloadAsync().catch(() => {});
    };
  }, []);

  if (notes.length === 0) return null;

  const ratio = progress && progress.durationMs > 0 ? Math.min(1, progress.positionMs / progress.durationMs) : 0;

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
              onPress={() => void togglePlay(note)}
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
                {isActive && ratio > 0 ? (
                  <Text style={styles.progressText}>{formatDuration(progress?.positionMs ?? 0)}</Text>
                ) : null}
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${isActive ? ratio * 100 : 0}%` }]} />
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