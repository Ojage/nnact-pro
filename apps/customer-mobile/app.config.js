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

const defaultOrgId =
  process.env.EXPO_PUBLIC_DEFAULT_ORG_ID ??
  process.env.DEFAULT_ORG_ID ??
  process.env.NEXT_PUBLIC_DEFAULT_ORG_ID ??
  "";

process.env.EXPO_PUBLIC_DEFAULT_ORG_ID = defaultOrgId;

const appJson = require("./app.json");

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      apiUrl,
      defaultOrgId,
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "45eeecf8-bd00-454b-a8de-fca82ad8defa",
      },
    },
  },
};
