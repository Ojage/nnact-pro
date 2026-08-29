import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const SLIDE_MS = 320;
const FADE_MS = 240;
const DISMISS_RATIO = 0.3;
const DISMISS_VELOCITY = 0.6;

export function AnimatedScreen({
  visible,
  onExited,
  children,
  style,
  onDismiss,
  swipeToDismiss = true,
}: {
  visible: boolean;
  onExited: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onDismiss?: () => void;
  swipeToDismiss?: boolean;
}) {
  const width = Dimensions.get("window").width;
  const translateX = useRef(new Animated.Value(width)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);
  const settle = useRef<Animated.CompositeAnimation | null>(null);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Boolean(swipeToDismiss && onDismiss && visible) &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderGrant: () => {
          settle.current?.stop();
        },
        onPanResponderMove: (_, gesture) => {
          const offset = Math.max(0, gesture.dx);
          translateX.setValue(offset);
          opacity.setValue(Math.max(0, 1 - offset / width));
        },
        onPanResponderRelease: (_, gesture) => {
          const dismiss =
            gesture.dx > width * DISMISS_RATIO || (gesture.vx > DISMISS_VELOCITY && gesture.dx > width * 0.08);
          if (dismiss) {
            translateX.setValue(Math.max(gesture.dx, width * 0.2));
            settle.current = Animated.parallel([
              Animated.timing(translateX, {
                toValue: width,
                duration: 220,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
            ]);
            settle.current.start(() => onDismiss?.());
          } else {
            settle.current = Animated.parallel([
              Animated.spring(translateX, {
                toValue: 0,
                friction: 7,
                tension: 80,
                useNativeDriver: true,
              }),
              Animated.spring(opacity, {
                toValue: 1,
                friction: 7,
                tension: 80,
                useNativeDriver: true,
              }),
            ]);
            settle.current.start();
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: (_, gesture) => {
          translateX.setValue(Math.max(0, gesture.dx));
          settle.current = Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              friction: 7,
              tension: 80,
              useNativeDriver: true,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              friction: 7,
              tension: 80,
              useNativeDriver: true,
            }),
          ]);
          settle.current.start();
        },
      }),
    [width, translateX, opacity, onDismiss, swipeToDismiss, visible],
  );

  useEffect(() => {
    if (!visible || !onDismiss) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, onDismiss]);

  useEffect(() => {
    if (visible) {
      mounted.current = true;
      settle.current?.stop();
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
        {...panResponder.panHandlers}
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