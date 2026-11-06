import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  publicDir: false,
  envDir: false,
  envPrefix: [],
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    cors: false,
    fs: {
      allow: [fileURLToPath(new URL(".", import.meta.url))],
      deny: [
        ".env", ".env.*", ".envrc", ".npmrc", ".pypirc", ".netrc",
        "*.{crt,pem,key,p12,pfx,keystore}", "id_rsa*", "id_ed25519*",
        "credentials.json", "credentials.local.*", "secrets.json", "secrets.local.*",
        "*.{db,sqlite,sqlite3}*", "**/.git/**", "**/.evidencelab/**",
        "**/conversations/**", "**/agent-workspace/**", "**/notebook-workspace/**",
      ],
    },
    headers: {
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; img-src 'self' data: blob:",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
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
