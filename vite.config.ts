import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const remoteWorkerOrigin = "https://joker-mastra-2.jokul0518.workers.dev";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api/stream": {
        target: remoteWorkerOrigin,
        changeOrigin: true,
        rewrite: () => "/api/agents/reporting-agent/stream"
      }
    }
  }
});
