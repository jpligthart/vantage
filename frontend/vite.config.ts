import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8")) as {
    version?: string;
  };
  return pkg.version || "0.0.0";
}

function resolveGitSha(): string {
  const fromEnv = process.env.VITE_GIT_SHA || process.env.GIT_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: join(rootDir, ".."),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.VITE_DEV_PORT) || 7847;
  const proxyTarget =
    env.VITE_PROXY_TARGET || env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const appVersion = process.env.VITE_APP_VERSION?.trim() || packageVersion();
  const gitSha = resolveGitSha();

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
      "import.meta.env.VITE_GIT_SHA": JSON.stringify(gitSha),
    },
    server: {
      host: "0.0.0.0",
      port: devPort,
      strictPort: true,
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/docs": { target: proxyTarget, changeOrigin: true },
        "/openapi.json": { target: proxyTarget, changeOrigin: true },
      },
    },
  };
});
