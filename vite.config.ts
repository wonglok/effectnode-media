import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Standalone Vite config for `bun run dev` — the frontend runs as its own
// process (see src/backend/server.ts for the backend), proxying /api and /ws to
// the Express server so browser calls stay same-origin. Mirrors the in-process
// dev server that src/index.ts spins up for the production `start` command.
export default defineConfig({
  root: "frontend",
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 5177,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
      },
      "/p8881": {
        target: "http://localhost:8881",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/p8881/, ""),
      },
    },
  },
});
