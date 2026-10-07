import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PipelineError,
  fetchAgedRoofs,
  fetchHealth,
  fetchOpenPermits,
  fetchProperty,
} from "./pipeline";

const snapshot = { runId: "r1", manifestCid: "bafy", syncedAt: null };
const params = {
  lat: 37.3382,
  lon: -121.8863,
  radiusMiles: 5,
  minRoofAgeYears: 15,
  permitState: "any" as const,
  minOpenYears: 2,
  roofingOnly: true,
  limit: 200,
};

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("pipeline api", () => {
  it("builds the aged-roofs query from filters", async () => {
    const fn = mockFetch(200, { snapshot, items: [] });
    await fetchAgedRoofs(params);
    const url = new URL(String(fn.mock.calls[0]?.[0]), "http://x");
    expect(url.pathname).toBe("/api/leads/aged-roofs");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: "37.3382",
      lon: "-121.8863",
      radiusMiles: "5",
      minRoofAgeYears: "15",
      limit: "200",
    });
  });

  it("builds the open-permits query from filters", async () => {
    const fn = mockFetch(200, { snapshot, items: [] });
    await fetchOpenPermits(params);
    const url = new URL(String(fn.mock.calls[0]?.[0]), "http://x");
    expect(url.pathname).toBe("/api/leads/open-permits");
    expect(url.searchParams.get("state")).toBe("any");
    expect(url.searchParams.get("minOpenYears")).toBe("2");
    expect(url.searchParams.get("roofingOnly")).toBe("true");
  });

  it("throws PipelineError carrying the status on 500", async () => {
    mockFetch(500, { error: "boom" });
    const err = await fetchAgedRoofs(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PipelineError);
    expect((err as PipelineError).status).toBe(500);
  });

  it("throws PipelineError with status 0 on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const err = await fetchHealth().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PipelineError);
    expect((err as PipelineError).status).toBe(0);
  });

  it("parses health and encodes the apn for property detail", async () => {
    mockFetch(200, { ok: true, snapshot });
    expect((await fetchHealth()).snapshot.runId).toBe("r1");
    const fn = mockFetch(200, {
      snapshot,
      property: { apn: "1/2", lat: 37.3, lon: -121.9 },
      permits: [],
      roofAge: null,
      owners: [],
      contractors: [],
    });
    const detail = await fetchProperty("1/2");
    expect(String(fn.mock.calls[0]?.[0])).toContain("/api/properties/1%2F2");
    expect(detail.roofAge).toBeNull();
  });

  it("rejects malformed bodies as PipelineError", async () => {
    mockFetch(200, { nope: true });
    await expect(fetchOpenPermits(params)).rejects.toBeInstanceOf(PipelineError);
  });
});
