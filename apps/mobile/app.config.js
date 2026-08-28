const path = require("path");
const fs = require("fs");

/** Load monorepo root .env so Expo picks up API_PORT / NEXT_PUBLIC_* like the web app. */
const repoEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(repoEnv)) {
  process.loadEnvFile(repoEnv);
}

const apiPort = process.env.API_PORT ?? "3001";
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  `http://localhost:${apiPort}`;

process.env.EXPO_PUBLIC_API_URL = apiUrl;

const googleServicesPath = process.env.GOOGLE_SERVICES_JSON
  ? path.resolve(__dirname, process.env.GOOGLE_SERVICES_JSON)
  : path.resolve(__dirname, "google-services.json");

const appJson = require("./app.json");

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [...(appJson.expo.plugins ?? []), ["expo-notifications", { defaultChannel: "field-assignments" }]],
    android: {
      ...appJson.expo.android,
      ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: googleServicesPath } : {}),
      permissions: [...(appJson.expo.android?.permissions ?? []), "RECORD_AUDIO"],
    },
    ios: {
      ...appJson.expo.ios,
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist ?? {}),
        NSMicrophoneUsageDescription:
          "NNACT Pro records voice notes on jobs so dispatch can hear field updates immediately.",
      },
    },
    extra: {
      ...appJson.expo.extra,
      apiUrl,
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? undefined,
      },
    },
  },
};
