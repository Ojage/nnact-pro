import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

const logoSource = require("./assets/nnact-logo.png");

export function BrandLogo({
  size = 48,
  style,
  imageStyle,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.22 }, style]}>
      <Image
        source={logoSource}
        style={[styles.image, { width: size, height: size }, imageStyle]}
        resizeMode="contain"
        accessibilityLabel="NNACT logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    backgroundColor: "transparent",
  },
});
