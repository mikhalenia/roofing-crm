import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index";

const env = {
  ALLOWED_ORIGIN: "https://roofing-crm.pages.dev",
  PIPELINE_API: "https://pipeline.test",
} as unknown as Cloudflare.Env;

async function allowOrigin(origin: string): Promise<string | null> {
  const res = await app.request("/health", { headers: { Origin: origin } }, env);
  return res.headers.get("access-control-allow-origin");
}

describe("cors", () => {
  // /health proxies the pipeline; keep these tests offline.
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 503 }));
  });
  afterEach(() => vi.restoreAllMocks());

  it("allows the deployed web origin and local dev origins", async () => {
    for (const o of [
      "https://roofing-crm.pages.dev",
      "http://localhost:4200",
      "http://localhost:4300",
    ])
      expect(await allowOrigin(o)).toBe(o);
  });

  it("does not allow other origins", async () => {
    expect(await allowOrigin("https://evil.example")).toBeNull();
  });
});
