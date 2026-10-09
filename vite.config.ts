import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export const resolveAppVersion = (appVersion: string | undefined) => appVersion ?? "local";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(
      resolveAppVersion(process.env.VITE_APP_VERSION),
    ),
  },
  resolve: {
    alias: [
      {
        find: /^react-transition-group\/TransitionGroupContext$/,
        replacement: "react-transition-group/cjs/TransitionGroupContext.js",
      },
    ],
  },
  ssr: {
    noExternal: ["@mui/material", "react-transition-group"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react-vendor";
          }
          if (
            id.includes("node_modules/@mui/x-charts") ||
            id.includes("node_modules/@mui/x-internals")
          ) {
            return "mui-charts-vendor";
          }
          if (id.includes("node_modules/@mui/") || id.includes("node_modules/@emotion/")) {
            return "mui-vendor";
          }
          if (id.includes("node_modules/@clerk/")) {
            return "clerk-vendor";
          }
          if (id.includes("node_modules/convex/")) {
            return "convex-vendor";
          }
        },
      },
    },
  },
  server: {
    watch: {
      ignored: ["**/.agents/**"],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // e2e/ は Playwright で実行するため Vitest から除外
    exclude: ["**/node_modules/**", "**/.pnpm-store/**", "**/e2e/**", "**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["**/*.test.*"],
    },
  },
});
