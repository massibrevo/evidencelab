import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.EVIDENCELAB_API_PORT || "8000"}`,
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          flow: ["@xyflow/react"],
          plotly: ["plotly.js-cartesian-dist-min"],
        },
      },
    },
  },
});
