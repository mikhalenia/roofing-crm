import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmError, askAgent, createLead, deleteLead, getLead, listLeads, updateLead } from "./crm";

const snapshot = {
  apn: "A1", lat: 37.3, lon: -121.9, bbbRating: null, distanceMiles: 1,
  provenance: { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" },
};
const lead = { apn: "A1", status: "new", notes: "", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", snapshot };

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("crm api", () => {
  it("lists leads with the filter as query params", async () => {
    const fn = mockFetch(200, [lead]);
    const out = await listLeads({ status: "new", minRoofAgeYears: 15, lat: 37.3, lon: -121.9, radiusMiles: 5 });
    expect(out[0]?.apn).toBe("A1");
    const url = new URL(String(fn.mock.calls[0]?.[0]), "http://x");
    expect(url.pathname).toBe("/leads");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "new", minRoofAgeYears: "15", lat: "37.3", lon: "-121.9", radiusMiles: "5",
    });
  });

  it("creates a lead with a JSON POST", async () => {
    const fn = mockFetch(201, lead);
    await createLead({ apn: "A1", snapshot });
    const init = fn.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({ apn: "A1" });
  });

  it("gets one lead by encoded apn, null on 404, throws otherwise", async () => {
    const fn = mockFetch(200, lead);
    expect((await getLead("A/1"))?.apn).toBe("A1");
    expect(String(fn.mock.calls[0]?.[0])).toContain("/leads/A%2F1");
    mockFetch(404, { error: "not found" });
    expect(await getLead("A1")).toBeNull();
    mockFetch(500, { error: "boom" });
    await expect(getLead("A1")).rejects.toBeInstanceOf(CrmError);
  });

  it("throws CrmError with 409 status", async () => {
    mockFetch(409, { error: "lead exists" });
    const err = await createLead({ apn: "A1", snapshot }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CrmError);
    expect((err as CrmError).status).toBe(409);
  });

  it("patches and deletes with encoded apn", async () => {
    const fn = mockFetch(200, {});
    await updateLead("1/2", { notes: "hi" });
    expect(String(fn.mock.calls[0]?.[0])).toContain("/leads/1%2F2");
    expect(fn.mock.calls[0]?.[1]?.method).toBe("PATCH");
    const del = mockFetch(204);
    await deleteLead("A1");
    expect(del.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("parses the agent response and wraps network failures", async () => {
    mockFetch(200, { answer: "a", toolCalls: [], sources: [], resolvedFilters: null });
    expect((await askAgent({ question: "hello", context: null })).answer).toBe("a");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const err = await askAgent({ question: "hello", context: null }).catch((e: unknown) => e);
    expect((err as CrmError).status).toBe(0);
  });

  it("rejects malformed bodies", async () => {
    mockFetch(200, { nope: 1 });
    await expect(listLeads()).rejects.toBeInstanceOf(CrmError);
  });
});
