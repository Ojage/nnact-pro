import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const SLIDE_MS = 320;
const FADE_MS = 240;

export function AnimatedScreen({
  visible,
  onExited,
  children,
  style,
}: {
  visible: boolean;
  onExited: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const width = Dimensions.get("window").width;
  const translateX = useRef(new Animated.Value(width)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    if (visible) {
      mounted.current = true;
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: SLIDE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!mounted.current) return;

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: width,
        duration: SLIDE_MS - 40,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        mounted.current = false;
        onExited();
      }
    });
  }, [visible, width, translateX, opacity, onExited]);

  if (!visible && !mounted.current) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.panel,
          style,
          {
            opacity,
            transform: [{ translateX }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  panel: {
    flex: 1,
  },
});
