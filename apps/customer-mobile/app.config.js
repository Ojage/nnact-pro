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
    },
  },
};
