import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import type { StoredStaffSession } from "../auth-storage";
import { uploadVoiceNote } from "../field-api";
import { fonts, spacing, type Palette } from "../theme";

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceNoteRecorder({
  colors,
  session,
  jobId,
  onUploaded,
}: {
  colors: Palette;
  session: StoredStaffSession;
  jobId: string;
  onUploaded: () => void;
}) {
  const styles = createStyles(colors);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    void Audio.requestPermissionsAsync();
    void Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
  }, []);

  useEffect(() => {
    if (!isRecording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startRecording = useCallback(async () => {
    if (isUploading) return;
    setError(null);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone permission is required for voice notes.");
        return;
      }
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
      startTimeRef.current = Date.now();
      stopTimer();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start recording");
    }
  }, [isUploading]);

  const finishRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    stopTimer();
    setIsRecording(false);
    const durationMs = Date.now() - startTimeRef.current;
    setElapsedMs(0);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      if (!uri || durationMs < 400) return;

      setIsUploading(true);
      await uploadVoiceNote(session, jobId, uri, durationMs);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }, [jobId, onUploaded, session]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Voice note to dispatch</Text>
        <Text style={styles.subtitle}>Hold to record · release to send · office hears it live</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.controls}>
        {isRecording ? (
          <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>
        ) : isUploading ? (
          <Text style={styles.timer}>Sending…</Text>
        ) : (
          <Text style={styles.hint}>Hold the button</Text>
        )}

        <Animated.View style={[styles.micOuter, isRecording && { transform: [{ scale: pulse }] }]}>
          <TouchableOpacity
            style={[styles.micButton, isRecording && styles.micButtonActive]}
            activeOpacity={0.9}
            disabled={isUploading}
            onPressIn={() => void startRecording()}
            onPressOut={() => void finishRecording()}
            delayPressIn={0}
          >
            <Ionicons
              name={isRecording ? "mic" : "mic-outline"}
              size={28}
              color={isRecording ? colors.onEmphasis : colors.primary}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    header: { marginBottom: spacing.sm },
    title: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold },
    subtitle: { color: colors.mutedForeground, fontSize: 12, marginTop: 4, fontFamily: fonts.regular },
    error: { color: colors.danger, fontSize: 12, marginBottom: spacing.sm, fontFamily: fonts.medium },
    controls: { alignItems: "center", paddingVertical: spacing.sm },
    timer: { color: colors.foreground, fontSize: 22, fontFamily: fonts.extraBold },
    hint: { color: colors.dimForeground, fontSize: 12, marginTop: spacing.xs, fontFamily: fonts.medium },
    micOuter: {
      marginTop: spacing.md,
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    micButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    micButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
  });
