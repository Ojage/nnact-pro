import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fonts, spacing, type Palette } from "../theme";

export type TabId = "home" | "services" | "activity" | "account";

type TabConfig = {
  id: TabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const TABS: TabConfig[] = [
  { id: "home", label: "Home", icon: "home-outline", iconActive: "home" },
  { id: "services", label: "Services", icon: "grid-outline", iconActive: "grid" },
  { id: "activity", label: "Activity", icon: "clipboard-outline", iconActive: "clipboard" },
  { id: "account", label: "Account", icon: "person-outline", iconActive: "person" },
];

export function BottomTabBar({
  colors,
  active,
  onChange,
  activityBadge,
}: {
  colors: Palette;
  active: TabId;
  onChange: (tab: TabId) => void;
  activityBadge?: number;
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.wrap}>
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        const badge = tab.id === "activity" && activityBadge ? activityBadge : 0;
        return (
          <TouchableOpacity key={tab.id} style={styles.tab} onPress={() => onChange(tab.id)} activeOpacity={0.75}>
            <View style={styles.iconWrap}>
              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={22}
                color={isActive ? colors.primary : colors.dimForeground}
              />
              {badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            {isActive ? <View style={styles.indicator} /> : <View style={styles.indicatorSpacer} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      backgroundColor: colors.surface,
      paddingBottom: spacing.sm,
      paddingTop: spacing.xs,
    },
    tab: { flex: 1, alignItems: "center", gap: 2, paddingTop: spacing.xs },
    iconWrap: { position: "relative", width: 28, height: 28, alignItems: "center", justifyContent: "center" },
    label: { fontSize: 11, fontFamily: fonts.medium, color: colors.dimForeground, marginTop: 2 },
    labelActive: { color: colors.primary, fontFamily: fonts.bold },
    badge: {
      position: "absolute",
      top: -4,
      right: -10,
      backgroundColor: colors.danger,
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    badgeText: { color: colors.onEmphasis, fontSize: 9, fontFamily: fonts.bold },
    indicator: { width: 20, height: 3, borderRadius: 2, backgroundColor: colors.primary, marginTop: 4 },
    indicatorSpacer: { height: 7 },
  });
