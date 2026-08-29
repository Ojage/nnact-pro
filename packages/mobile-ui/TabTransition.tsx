import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Animated, Dimensions, Easing, PanResponder, StyleSheet } from "react-native";

const SWIPE_RATIO = 0.22;
const SWIPE_VELOCITY = 0.6;

export function TabTransition({
  activeKey,
  children,
  onNextTab,
  onPreviousTab,
}: {
  activeKey: string;
  children: ReactNode;
  onNextTab?: () => void;
  onPreviousTab?: () => void;
}) {
  const width = Dimensions.get("window").width;
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const prevKey = useRef(activeKey);
  const busy = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !busy.current &&
          Boolean(onNextTab || onPreviousTab) &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderGrant: () => {
          busy.current = true;
        },
        onPanResponderMove: (_, gesture) => {
          translateX.setValue(gesture.dx);
        },
        onPanResponderRelease: (_, gesture) => {
          const release = gesture.dx;
          const dismiss = Math.abs(release) > width * SWIPE_RATIO || Math.abs(gesture.vx) > SWIPE_VELOCITY;
          if (dismiss) {
            const isNext = release < 0;
            Animated.timing(translateX, {
              toValue: isNext ? -width : width,
              duration: 180,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }).start(() => {
              translateX.setValue(0);
              busy.current = false;
              if (isNext) onNextTab?.();
              else onPreviousTab?.();
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              friction: 7,
              tension: 80,
              useNativeDriver: true,
            }).start(() => {
              busy.current = false;
            });
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            tension: 80,
            useNativeDriver: true,
          }).start(() => {
            busy.current = false;
          });
        },
      }),
    [width, translateX, onNextTab, onPreviousTab],
  );

  useEffect(() => {
    if (prevKey.current === activeKey) return;
    opacity.setValue(0);
    translateY.setValue(8);
    translateX.setValue(0);
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
  }, [activeKey, opacity, translateY, translateX]);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.wrap, { opacity, transform: [{ translateY }, { translateX }] }]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
});