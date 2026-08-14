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
        /**
         * Inter ships seven unicode subsets. `unicode-range` already stops a
         * browser fetching the ones it doesn't need — but precaching bypasses
         * that and pulls all 218KB on install, of which ~170KB is Cyrillic,
         * Greek, Vietnamese and latin-ext this app never renders.
         *
         * Excluded rather than removed from the bundle: they stay on the
         * server, so an accented character in a category name still resolves —
         * it just costs a request instead of everyone's install.
         */
        globIgnores: ["**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese,latin-ext}-*.woff2"],
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
        // Long-press the app icon → straight to the composer, skipping a tab tap
        // on the most common action. Android and desktop only: iOS does not
        // implement manifest shortcuts, so it's inert on iPhone — kept because
        // it costs nothing and is correct wherever it is supported.
        shortcuts: [
          {
            name: "Add expense",
            short_name: "Add",
            description: "Log a new expense",
            url: "/#add",
            icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
      },
    }),
  ],
});
