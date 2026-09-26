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
import App from "./App";

function Root() {
  // Kick off font loading immediately but do NOT gate the app on it — on
  // native this resolves in the background and text falls back to the system
  // face for the first frames, so the boot/login screens appear as fast as
  // possible instead of waiting behind a blocking spinner.
  void useFonts({
    SourceSans3_400Regular,
    SourceSans3_500Medium,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
    SourceSans3_800ExtraBold,
    SourceSans3_900Black,
  });

  return <App />;
}

// Expo resolves the bundle entry from package.json "main" and mounts the root
// component registered here under the registered name ("main").
registerRootComponent(Root);