import { defineConfig, devices } from "@playwright/test";
import { nxE2EPreset } from "@nx/playwright/preset";
import { workspaceRoot } from "@nx/devkit";

// In CI, E2E_BASE_URL points at the deployed Pages URL. When unset, run against a local preview.
const remoteBaseURL = process.env["E2E_BASE_URL"];
const baseURL = remoteBaseURL || "http://localhost:4300";

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: "./src" }),
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  ...(remoteBaseURL
    ? {}
    : {
        webServer: {
          command: "pnpm exec nx run web:preview",
          url: "http://localhost:4300",
          reuseExistingServer: true,
          cwd: workspaceRoot,
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
