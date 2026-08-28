import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MobileSearchResultItem } from "@nnact/shared";
import { groupSearchResults } from "./search-utils";

export type AppSearchColors = {
  background: string;
  surface: string;
  card: string;
  border: string;
  borderLight: string;
  foreground: string;
  mutedForeground: string;
  dimForeground: string;
  primary: string;
  primaryMuted: string;
  onEmphasis: string;
};

export type AppSearchFonts = {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
};

type CategoryIcon = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
};

function categoryIcon(category: MobileSearchResultItem["category"], colors: AppSearchColors): CategoryIcon {
  switch (category) {
    case "service":
      return { name: "construct-outline", color: colors.primary, background: colors.primaryMuted };
    case "job":
      return { name: "briefcase-outline", color: colors.primary, background: colors.primaryMuted };
    case "customer":
      return { name: "people-outline", color: colors.primary, background: colors.primaryMuted };
    case "invoice":
      return { name: "receipt-outline", color: colors.primary, background: colors.primaryMuted };
    case "estimate":
      return { name: "document-text-outline", color: "#9a6700", background: "#fef8e7" };
    case "appointment":
      return { name: "calendar-outline", color: colors.primary, background: colors.primaryMuted };
    case "equipment":
      return { name: "hardware-chip-outline", color: colors.primary, background: colors.primaryMuted };
    case "repair_model":
    case "repair_fault":
    case "repair_part":
    case "repair_procedure":
      return { name: "pulse-outline", color: colors.primary, background: colors.primaryMuted };
    default:
      return { name: "flash-outline", color: colors.primary, background: colors.primaryMuted };
  }
}

export function AppSearchBar({
  colors,
  fonts,
  placeholder,
  onPress,
}: {
  colors: AppSearchColors;
  fonts: AppSearchFonts;
  placeholder: string;
  onPress: () => void;
}) {
  const styles = createStyles(colors, fonts);
  return (
    <View style={styles.barWrap}>
      <TouchableOpacity style={styles.bar} onPress={onPress} activeOpacity={0.9} accessibilityRole="search">
        <Ionicons name="search" size={20} color={colors.dimForeground} />
        <Text style={styles.barPlaceholder} numberOfLines={1} ellipsizeMode="tail">{placeholder}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** White pill search trigger for inside the blue hero header. */
export function HeroSearchTrigger({
  fonts,
  placeholder,
  onPress,
}: {
  fonts: AppSearchFonts;
  placeholder: string;
  onPress: () => void;
}) {
  const styles = createStyles({} as AppSearchColors, fonts);
  return (
    <TouchableOpacity style={styles.heroBar} onPress={onPress} activeOpacity={0.92} accessibilityRole="search">
      <Ionicons name="search" size={18} color="#636363" />
      <Text style={styles.heroBarPlaceholder} numberOfLines={1} ellipsizeMode="tail">
        {placeholder}
      </Text>
    </TouchableOpacity>
  );
}

export function AppSearchModal({
  visible,
  colors,
  fonts,
  placeholder,
  suggestions,
  onClose,
  onSearch,
  onSelect,
}: {
  visible: boolean;
  colors: AppSearchColors;
  fonts: AppSearchFonts;
  placeholder: string;
  suggestions: MobileSearchResultItem[];
  onClose: () => void;
  onSearch: (query: string) => Promise<MobileSearchResultItem[]>;
  onSelect: (item: MobileSearchResultItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MobileSearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const styles = createStyles(colors, fonts);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(focusTimer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    if (!query.trim()) {
      setResults(suggestions);
      setError(null);
      setLoading(false);
      return;
    }

    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void onSearch(query.trim())
        .then((items) => {
          setResults(items);
          setLoading(false);
        })
        .catch(() => {
          setError("Search failed. Check your connection and try again.");
          setResults([]);
          setLoading(false);
        });
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query, visible, onSearch, suggestions]);

  const sections = groupSearchResults(results);
  const showEmpty = query.trim().length >= 2 && !loading && results.length === 0 && !error;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <View style={styles.inputRow}>
            <Ionicons name="search" size={20} color={colors.dimForeground} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={colors.dimForeground}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn} accessibilityLabel="Close search">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {showEmpty ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="search-outline" size={40} color={colors.dimForeground} />
            <Text style={styles.emptyTitle}>No results for &ldquo;{query.trim()}&rdquo;</Text>
            <Text style={styles.emptyCopy}>Try a different keyword — job title, customer name, invoice number, or service type.</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section: { title } }) => (
              <Text style={styles.sectionLabel}>{title}</Text>
            )}
            renderItem={({ item }) => (
              <SearchResultRow
                colors={colors}
                fonts={fonts}
                item={item}
                onPress={() => {
                  Keyboard.dismiss();
                  onSelect(item);
                  onClose();
                }}
              />
            )}
            ListFooterComponent={<View style={{ height: 32 }} />}
          />
        )}
      </View>
    </Modal>
  );
}

function SearchResultRow({
  colors,
  fonts,
  item,
  onPress,
}: {
  colors: AppSearchColors;
  fonts: AppSearchFonts;
  item: MobileSearchResultItem;
  onPress: () => void;
}) {
  const styles = createStyles(colors, fonts);
  const icon = categoryIcon(item.category, colors);

  return (
    <TouchableOpacity style={styles.resultRow} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.resultIcon, { backgroundColor: icon.background }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
        {item.subtitle ? (
          <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
    </TouchableOpacity>
  );
}

const createStyles = (colors: AppSearchColors, fonts: AppSearchFonts) =>
  StyleSheet.create({
    barWrap: {
      paddingTop: Platform.OS === "ios" ? 54 : 40,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingHorizontal: 18,
      paddingVertical: 14,
      minHeight: 52,
    },
    barPlaceholder: {
      flex: 1,
      color: colors.dimForeground,
      fontSize: 16,
      fontFamily: fonts.regular,
    },
    heroBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 20,
      backgroundColor: "#ffffff",
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 11,
      minHeight: 44,
    },
    heroBarPlaceholder: {
      flex: 1,
      color: "#636363",
      fontSize: 15,
      fontFamily: fonts.regular,
    },
    modalRoot: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === "ios" ? 54 : 40,
    },
    modalHeader: {
      paddingHorizontal: 16,
      gap: 10,
      marginBottom: 8,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 52,
    },
    input: {
      flex: 1,
      color: colors.foreground,
      fontSize: 16,
      fontFamily: fonts.regular,
      paddingVertical: 0,
    },
    cancelBtn: {
      alignSelf: "flex-end",
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    cancelText: {
      color: colors.primary,
      fontSize: 15,
      fontFamily: fonts.semibold,
    },
    errorText: {
      color: "#d4111e",
      fontSize: 13,
      fontFamily: fonts.regular,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    sectionLabel: {
      color: colors.mutedForeground,
      fontSize: 12,
      fontFamily: fonts.bold,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 16,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 8,
    },
    resultIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    resultCopy: { flex: 1, gap: 2 },
    resultTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.semibold },
    resultSubtitle: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular },
    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 10,
    },
    emptyTitle: {
      color: colors.foreground,
      fontSize: 17,
      fontFamily: fonts.bold,
      textAlign: "center",
    },
    emptyCopy: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: fonts.regular,
      textAlign: "center",
      lineHeight: 20,
    },
  });
