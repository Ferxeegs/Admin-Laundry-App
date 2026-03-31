import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",

      // ── Workbox Caching Strategies ──
      workbox: {
        // Precache all built assets (JS, CSS, HTML, fonts, images)
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}",
        ],
        // Max precache payload — skip huge files
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB

        // Runtime caching for API calls & external resources
        runtimeCaching: [
          // Google Fonts stylesheets — cache first (rarely changes)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts webfont files — cache first
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // API calls — network first with cache fallback
          {
            urlPattern: /\/api\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 }, // 1 hour
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 10,
            },
          },
          // NOTE: /uploads/ images are NOT cached by Service Worker.
          // They are served by the backend via reverse proxy and
          // should pass through directly without SW interception.
        ],

        // Prevent SW from intercepting backend-served routes
        // (uploads, API). Without this, SW returns index.html for
        // these paths causing "no-response" errors.
        navigateFallbackDenylist: [/^\/uploads\//, /^\/api\//],

        // Clean outdated caches on new SW activation
        cleanupOutdatedCaches: true,
        // Skip waiting — new SW activates immediately
        skipWaiting: true,
        clientsClaim: true,
      },

      // ── Web App Manifest ──
      manifest: {
        name: "Admin Laundry Pondok",
        short_name: "Laundry",
        description:
          "Sistem manajemen laundry pesantren — kelola order, pantau status cucian, dan lacak pendapatan.",
        theme_color: "#3B82F6",
        background_color: "#0F172A",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["business", "productivity"],
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "screenshot-desktop.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide"
          },
          {
            src: "screenshot-mobile.png",
            sizes: "720x1280",
            type: "image/png",
            form_factor: "narrow"
          }
        ]
      },

      // Dev options — enable SW in development for testing
      devOptions: {
        enabled: false, // Set to true temporarily if you need to test SW in dev
      },
    }),
  ],
  server: {
    host: "0.0.0.0", // Allow access from outside container
    port: 5173,
    strictPort: true,
    watch: {
      // Use polling for file watching in Docker (better compatibility)
      usePolling: true,
      interval: 1000, // Poll every 1 second
      ignored: ["**/node_modules/**", "**/.git/**"],
    },
    hmr: {
      // Enable HMR (Hot Module Replacement) for Docker
      // Client akan connect melalui nginx di port 80
      clientPort: 80,
      protocol: "ws",
    },
    // Increase timeout for large files
    fs: {
      strict: false,
      allow: [".."], // Allow access to files outside of project root
    },
  },
  // Optimize build performance
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router"],
        },
      },
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router",
      "@vitejs/plugin-react",
    ],
    exclude: [
      "lightningcss", // Exclude lightningcss dari pre-bundling karena native module
    ],
  },
});
