const path = require("path");
const { createRequire } = require("node:module");

/** Workspace packages resolved from source (not prebuilt dist). */
const WORKSPACE_PACKAGE_DIRS = ["shared", "mobile-ui"];

/**
 * Require (call) resolve relative to the app directory, where pnpm installs
 * `expo`, `metro-config`, and `metro-resolver`. The shared config lives
 * outside the app's node_modules, so plain require() from this file walks up
 * to the monorepo root and misses packages on EAS runners.
 */
function requireFromProject(projectRoot, name) {
  return createRequire(path.join(projectRoot, "package.json"))(name);
}

/** Shared Metro config for pnpm monorepo Expo apps. */
function createExpoMetroConfig(projectRoot) {
  // SDK 52 exposes the config as `expo/metro-config`; SDK 57+ ships `@expo/metro-config`.
  let getDefaultConfig;
  try {
    getDefaultConfig = requireFromProject(projectRoot, "expo/metro-config").getDefaultConfig;
  } catch {
    getDefaultConfig = requireFromProject(projectRoot, "@expo/metro-config").getDefaultConfig;
  }
  const { resolve: resolveModule } = requireFromProject(projectRoot, "metro-resolver");
  // metro 0.84+ restricts subpaths via "exports"; SDK 57 (metro 0.84.5) exposes
  // `metro-config/private/*`, older SDKs (metro 0.81) resolve `src/...` directly.
  let exclusionList;
  for (const subpath of [
    "metro-config/private/defaults/exclusionList",
    "metro-config/src/defaults/exclusionList",
  ]) {
    try {
      exclusionList = requireFromProject(projectRoot, subpath);
      // metro 0.84 ships Babel-interop CJS (exports.default).
      exclusionList = exclusionList.default || exclusionList;
      break;
    } catch {
      // try next metro-config entry point for this SDK
    }
  }
  if (!exclusionList) throw new Error("metro-config exclusionList is not resolvable");

  const monorepoRoot = path.resolve(projectRoot, "../..");
  const config = getDefaultConfig(projectRoot);

  // Watch workspace sources + hoisted pnpm store (symlinks resolve outside the app dir).
  // Do not watch the whole repo — data/pg and backups trigger EACCES on scan.
  config.watchFolders = [
    ...WORKSPACE_PACKAGE_DIRS.map((name) =>
      path.resolve(monorepoRoot, "packages", name),
    ),
    path.resolve(monorepoRoot, "node_modules"),
  ];

  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules"),
  ];

  const repoDataDir = path.resolve(monorepoRoot, "data").replace(/[/\\]/g, "[/\\\\]");
  const repoBackupsDir = path.resolve(monorepoRoot, "backups").replace(/[/\\]/g, "[/\\\\]");

  config.resolver.blockList = exclusionList([
    new RegExp(`^${repoDataDir}[/\\\\].*`),
    new RegExp(`^${repoBackupsDir}[/\\\\].*`),
    /\/\.git\/.*/,
  ]);

  config.resolver.extraNodeModules = {
    "@nnact/shared": path.resolve(monorepoRoot, "packages/shared"),
    "@nnact/mobile-ui": path.resolve(monorepoRoot, "packages/mobile-ui"),
  };

  const defaultResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // @nnact/shared (and API-aligned packages) use NodeNext ".js" specifiers for .ts sources.
    if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
      const tsModuleName = moduleName.replace(/\.js$/, "");
      try {
        return resolveModule(context, tsModuleName, platform);
      } catch {
        // fall through to default resolution
      }
    }

    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }

    return resolveModule(context, moduleName, platform);
  };

  return config;
}

module.exports = { createExpoMetroConfig };