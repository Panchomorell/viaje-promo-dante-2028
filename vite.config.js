import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const cloudApiOrigin = env.VITE_CLOUD_API_ORIGIN?.replace(/\/$/, "");

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      proxy: cloudApiOrigin
        ? {
            "/api": {
              target: cloudApiOrigin,
              changeOrigin: true,
              secure: true
            }
          }
        : undefined
    },
    preview: {
      host: "127.0.0.1"
    }
  };
});
