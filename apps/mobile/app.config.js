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

module.exports = {
  expo: {
    name: "NNACT Pro Tech",
    slug: "nnact-pro-tech",
    version: "0.1.0",
    description:
      "NNACT Pro — field operations for HVAC, refrigeration, electrical, solar, and maintenance teams. Dispatch, diagnostics, Repair Brain, and mobile technician workflows.",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
    experiments: {
      tsconfigPaths: false,
    },
    plugins: [
      [
        "expo-splash-screen",
        { image: "./assets/icon.png", resizeMode: "contain", backgroundColor: "#0f172a" },
      ],
      ["expo-notifications", { defaultChannel: "field-assignments" }],
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.nnact.pro",
      infoPlist: {
        NSMicrophoneUsageDescription:
          "NNACT Pro records voice notes on jobs so dispatch can hear field updates immediately.",
      },
    },
    android: {
      package: "com.nnact.nnact_technician",
      permissions: ["RECORD_AUDIO"],
      ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: googleServicesPath } : {}),
    },
    extra: {
      companyName: "NNACT",
      tagline: "The Power of Dreams",
      apiUrl,
      eas: {
        projectId:
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          "b56512d5-5af4-4588-9aae-e05de839bc71",
      },
    },
  },
};