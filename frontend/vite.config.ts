import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.VITE_DEV_PORT) || 7847;
  const proxyTarget =
    env.VITE_PROXY_TARGET || env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
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
