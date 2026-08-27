import { registerRootComponent } from "expo";
import { useFonts } from "expo-font";
import {
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
  SourceSans3_800ExtraBold,
  SourceSans3_900Black,
} from "@expo-google-fonts/source-sans-3";
import { ActivityIndicator, View } from "react-native";
import App from "./App";
import { useTheme } from "./src/theme";

function FontGate() {
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({
    SourceSans3_400Regular,
    SourceSans3_500Medium,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
    SourceSans3_800ExtraBold,
    SourceSans3_900Black,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <App />;
}

// Expo resolves the bundle entry from package.json "main" and mounts the root
// component registered here under the registered name ("main").
registerRootComponent(FontGate);