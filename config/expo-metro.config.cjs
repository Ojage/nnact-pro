const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { resolve: resolveModule } = require("metro-resolver");
const exclusionList = require("metro-config/src/defaults/exclusionList");

/** Workspace packages resolved from source (not prebuilt dist). */
const WORKSPACE_PACKAGE_DIRS = ["shared", "mobile-ui"];

/** Shared Metro config for pnpm monorepo Expo apps. */
function createExpoMetroConfig(projectRoot) {
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
