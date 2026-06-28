import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // We register + drive updates ourselves in src/lib/pwa.ts (prompt mode so
      // onNeedRefresh fires; we then auto-apply the update).
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      injectManifest: {
        // Keep the generated SW small — only precache the shell assets.
        globPatterns: ["**/*.{js,css,html,svg,ico,woff2}"],
      },
      manifest: {
        name: "Nudge",
        short_name: "Nudge",
        description: "Offline-first todos that nudge until they're done",
        theme_color: "#0b0b11",
        background_color: "#0b0b11",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // In split dev, proxy API calls to the Worker so cookies stay same-origin.
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
