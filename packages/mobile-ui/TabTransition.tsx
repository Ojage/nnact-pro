import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

export function TabTransition({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const prevKey = useRef(activeKey);

  useEffect(() => {
    if (prevKey.current === activeKey) return;
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    prevKey.current = activeKey;
  }, [activeKey, opacity, translateY]);

  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
});
