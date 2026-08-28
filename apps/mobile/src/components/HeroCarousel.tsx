import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
} from "react-native";
import { fonts, radius, spacing, type Palette } from "../theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_GAP = spacing.md;
const HORIZONTAL_INSET = spacing.lg;
const CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_INSET * 2;
const IMAGE_HEIGHT = Math.round(CARD_WIDTH * (9 / 16));
const AUTO_INTERVAL_MS = 5000;
const USER_PAUSE_MS = 10000;

export type HeroCarouselSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
  badge?: string;
};

export function HeroCarousel({
  colors,
  slides,
  onSlidePress,
}: {
  colors: Palette;
  slides: HeroCarouselSlide[];
  onSlidePress?: (slide: HeroCarouselSlide) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<HeroCarouselSlide>>(null);
  const autoScrollingRef = useRef(false);
  const pauseUntilRef = useRef(0);
  const styles = createStyles(colors);

  useEffect(() => {
    if (slides.length <= 1) return;

    const id = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;

      setActiveIndex((prev) => {
        const next = (prev + 1) % slides.length;
        autoScrollingRef.current = true;
        listRef.current?.scrollToOffset({ offset: next * (CARD_WIDTH + CARD_GAP), animated: true });
        return next;
      });
    }, AUTO_INTERVAL_MS);

    return () => clearInterval(id);
  }, [slides.length]);

  function pauseAutoAdvance() {
    pauseUntilRef.current = Date.now() + USER_PAUSE_MS;
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.round(offset / (CARD_WIDTH + CARD_GAP));
    setActiveIndex(Math.min(Math.max(index, 0), slides.length - 1));
    if (!autoScrollingRef.current) pauseAutoAdvance();
    autoScrollingRef.current = false;
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.listContent}
        onScrollBeginDrag={pauseAutoAdvance}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <CarouselCard colors={colors} slide={item} onPress={onSlidePress ? () => onSlidePress(item) : undefined} />
        )}
      />

      <View style={styles.dots}>
        {slides.map((slide, index) => (
          <TouchableOpacity
            key={slide.id}
            onPress={() => {
              pauseAutoAdvance();
              listRef.current?.scrollToOffset({ offset: index * (CARD_WIDTH + CARD_GAP), animated: true });
              setActiveIndex(index);
            }}
            style={[styles.dot, index === activeIndex && styles.dotActive]}
            accessibilityLabel={`Go to slide ${index + 1}`}
          />
        ))}
      </View>
    </View>
  );
}

function CarouselCard({
  colors,
  slide,
  onPress,
}: {
  colors: Palette;
  slide: HeroCarouselSlide;
  onPress?: () => void;
}) {
  const styles = createStyles(colors);
  const content = (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        <Image source={slide.image} style={styles.image} resizeMode="cover" />
        <View style={styles.imageOverlay} />
        {slide.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{slide.badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {slide.title}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {slide.description}
        </Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.cardOuter}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.cardOuter}>{content}</View>;
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { marginBottom: spacing.lg },
    listContent: {
      paddingHorizontal: HORIZONTAL_INSET,
      gap: CARD_GAP,
    },
    cardOuter: {
      width: CARD_WIDTH,
    },
    card: {
      borderRadius: radius.lg,
      overflow: "hidden",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    imageWrap: {
      width: "100%",
      height: IMAGE_HEIGHT,
      backgroundColor: colors.primaryMuted,
    },
    image: {
      width: "100%",
      height: "100%",
    },
    imageOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 37, 93, 0.08)",
    },
    badge: {
      position: "absolute",
      top: spacing.sm,
      left: spacing.sm,
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeText: {
      color: colors.primaryDark,
      fontSize: 10,
      fontFamily: fonts.bold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    body: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      gap: 4,
    },
    eyebrow: {
      color: colors.primary,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    title: {
      color: colors.foreground,
      fontSize: 18,
      fontFamily: fonts.extraBold,
      letterSpacing: -0.3,
      lineHeight: 24,
    },
    description: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontFamily: fonts.regular,
      lineHeight: 19,
      marginTop: 2,
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
      marginTop: spacing.md,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    dotActive: {
      width: 18,
      backgroundColor: colors.primary,
    },
  });
