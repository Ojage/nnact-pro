const path = require("path");
const fs = require("fs");

/** Load monorepo root .env so Expo picks up API_PORT / NEXT_PUBLIC_* like the web app. */
const repoEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(repoEnv)) {
  process.loadEnvFile(repoEnv);
}

const { NNACT_PRODUCTION_API_URL } = require("../../packages/shared/mobile-api-origin.cjs");

/** Mobile uses EXPO_PUBLIC_API_URL only — not NEXT_PUBLIC_API_URL (web dev localhost). */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? NNACT_PRODUCTION_API_URL;

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
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "b56512d5-5af4-4588-9aae-e05de839bc71",
      },
    },
  },
};
