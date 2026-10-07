import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "../../node_modules/.vite/apps/api",
  plugins: [
    nxViteTsPaths(),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
    }),
  ],
  test: {
    name: "api",
    watch: false,
    globals: true,
    include: ["src/**/*.test.ts"],
    reporters: ["default"],
  },
});
