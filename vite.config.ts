import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      // Cloudflare Access: manifest must be fetched WITH cookies, or it 302s
      // to the login page and the install prompt never appears
      useCredentials: true,
      // cache the app shell only — the API is online-only by design
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
      },
      manifest: {
        name: "Expense Tracker",
        short_name: "Expenses",
        description: "Personal expense tracker",
        display: "standalone",
        start_url: "/",
        theme_color: "#0d0e12",
        background_color: "#0d0e12",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
