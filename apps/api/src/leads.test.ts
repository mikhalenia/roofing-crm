import { env } from "cloudflare:workers";
import type { LeadRecord, PipelineLead } from "@crm/contracts";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import migration from "../migrations/0001_leads.sql?raw";
import app from "./index";

const CENTER = { lat: 37.3541, lon: -121.9552 };

function lead(apn: string, over: Partial<PipelineLead> = {}): PipelineLead {
  return {
    apn,
    lat: CENTER.lat,
    lon: CENTER.lon,
    bbbRating: null,
    distanceMiles: 0,
    roofAgeYears: 20,
    permitState: "open",
    daysOpen: 800,
    provenance: {
      propertySourceUrl: "https://example.test/p",
      propertySourceVersion: "v1",
      permitSourceUrl: null,
      permitSourceVersion: null,
      fetchedAt: "2026-10-01T00:00:00Z",
    },
    ...over,
  };
}

let ip = 0;
let currentIp = "";
function call(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", "CF-Connecting-IP": currentIp, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}
const create = (l: PipelineLead) => call("/leads", "POST", { apn: l.apn, snapshot: l });

beforeAll(async () => {
  const statements = migration
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (const s of statements) await env.DB.prepare(s).run();
});

beforeEach(async () => {
  currentIp = `10.0.0.${++ip}`;
  await env.DB.prepare("DELETE FROM leads").run();
  await env.DB.prepare("DELETE FROM rate_limits").run();
});

describe("health", () => {
  afterEach(() => vi.restoreAllMocks());

  it("proxies the pipeline health for manifestCid and runId", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          snapshot: { runId: "run-9", manifestCid: "bafy-live", syncedAt: "2026-10-07T00:00:00Z" },
        }),
        { status: 200 },
      ),
    );
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      pipelineApi: env.PIPELINE_API,
      pipelineOk: true,
      manifestCid: "bafy-live",
      runId: "run-9",
    });
    expect(String(spy.mock.calls[0]![0])).toBe(new URL("/api/health", env.PIPELINE_API).toString());
  });

  it("reports pipelineOk false and null ids when the pipeline is down", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("down", { status: 503 }));
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      pipelineApi: env.PIPELINE_API,
      pipelineOk: false,
      manifestCid: null,
      runId: null,
    });
  });

  it("reports pipelineOk false when the pipeline fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    const body = (await (await call("/health")).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, pipelineOk: false, manifestCid: null, runId: null });
  });

  it("404s unknown routes as json", async () => {
    const res = await call("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});

describe("leads", () => {
  it("creates a lead -> 201 LeadRecord", async () => {
    const res = await create(lead("A-1"));
    expect(res.status).toBe(201);
    const body = (await res.json()) as LeadRecord;
    expect(body.apn).toBe("A-1");
    expect(body.status).toBe("new");
    expect(body.notes).toBe("");
    expect(body.snapshot.apn).toBe("A-1");
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(body.updatedAt).toBe(body.createdAt);
  });

  it("returns 409 for a duplicate apn", async () => {
    await create(lead("A-1"));
    const res = await create(lead("A-1"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "lead exists" });
  });

  it("gets one lead by apn -> 200 LeadRecord, 404 for unknown", async () => {
    await create(lead("A-1"));
    const res = await call("/leads/A-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeadRecord;
    expect(body.apn).toBe("A-1");
    expect(body.status).toBe("new");
    expect(body.snapshot.apn).toBe("A-1");
    const missing = await call("/leads/NOPE");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not found" });
  });

  it("rejects an apn longer than 16 characters", async () => {
    const res = await create(lead("X".repeat(17)));
    expect(res.status).toBe(400);
  });

  it("rejects a snapshot larger than 64 KB with 413", async () => {
    const res = await create(lead("BIG", { workDescription: "x".repeat(70 * 1024) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "snapshot too large" });
  });

  it("rejects notes longer than 2000 characters", async () => {
    await create(lead("A-1"));
    expect((await call("/leads/A-1", "PATCH", { notes: "n".repeat(2001) })).status).toBe(400);
    expect((await call("/leads/A-1", "PATCH", { notes: "n".repeat(2000) })).status).toBe(200);
  });

  it("returns 400 with issues for an invalid body", async () => {
    const res = await call("/leads", "POST", { apn: 5 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBeTruthy();
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("filters by status and minRoofAgeYears", async () => {
    await create(lead("OLD", { roofAgeYears: 25 }));
    await create(lead("YOUNG", { roofAgeYears: 10 }));
    await call("/leads/OLD", "PATCH", { status: "contacted" });

    const byAge = (await (await call("/leads?minRoofAgeYears=20")).json()) as LeadRecord[];
    expect(byAge.map((l) => l.apn)).toEqual(["OLD"]);

    const byStatus = (await (await call("/leads?status=new")).json()) as LeadRecord[];
    expect(byStatus.map((l) => l.apn)).toEqual(["YOUNG"]);

    const all = (await (await call("/leads")).json()) as LeadRecord[];
    expect(all).toHaveLength(2);
  });

  it("filters by permitState and minOpenYears", async () => {
    await create(lead("OPEN", { permitState: "open", daysOpen: 800 }));
    await create(lead("EXP", { permitState: "expired_unfinaled", daysOpen: 100 }));
    const open = (await (await call("/leads?permitState=open")).json()) as LeadRecord[];
    expect(open.map((l) => l.apn)).toEqual(["OPEN"]);
    const any = (await (await call("/leads?permitState=any")).json()) as LeadRecord[];
    expect(any).toHaveLength(2);
    const long = (await (await call("/leads?minOpenYears=2")).json()) as LeadRecord[];
    expect(long.map((l) => l.apn)).toEqual(["OPEN"]);
  });

  it("the stalled filter excludes expired permits whose work was approved", async () => {
    await create(lead("STALLED", { permitState: "expired_unfinaled", isStalled: true, approvalsComplete: false }));
    await create(lead("APPROVED", { permitState: "expired_unfinaled", isStalled: false, approvalsComplete: true }));
    // Saved before the pipeline sent isStalled: derived from approvalsComplete.
    await create(lead("OLD-APPROVED", { permitState: "expired_unfinaled", approvalsComplete: true }));
    await create(lead("OLD-STALLED", { permitState: "expired_unfinaled" }));
    const stalled = (await (await call("/leads?permitState=expired_unfinaled")).json()) as LeadRecord[];
    expect(stalled.map((l) => l.apn).sort()).toEqual(["OLD-STALLED", "STALLED"]);
    const any = (await (await call("/leads?permitState=any")).json()) as LeadRecord[];
    expect(any).toHaveLength(4);
  });

  it("radius filter includes 1 mile and excludes 20 miles", async () => {
    const perMile = 1 / 69;
    await create(lead("NEAR", { lat: CENTER.lat + perMile, lon: CENTER.lon }));
    await create(lead("FAR", { lat: CENTER.lat + 20 * perMile, lon: CENTER.lon }));
    const res = await call(`/leads?lat=${CENTER.lat}&lon=${CENTER.lon}&radiusMiles=5`);
    const body = (await res.json()) as LeadRecord[];
    expect(body.map((l) => l.apn)).toEqual(["NEAR"]);
  });

  it("rejects an invalid query with 400", async () => {
    const res = await call("/leads?status=bogus");
    expect(res.status).toBe(400);
  });

  it("patches status -> 200 with new updatedAt, 404 for unknown", async () => {
    const created = (await (await create(lead("A-1"))).json()) as LeadRecord;
    await new Promise((r) => setTimeout(r, 5));
    const res = await call("/leads/A-1", "PATCH", { status: "qualified", notes: "call back" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeadRecord;
    expect(body.status).toBe("qualified");
    expect(body.notes).toBe("call back");
    expect(body.updatedAt).not.toBe(created.createdAt);
    expect(body.createdAt).toBe(created.createdAt);

    expect((await call("/leads/NOPE", "PATCH", { status: "lost" })).status).toBe(404);
  });

  it("deletes -> 204 then 404", async () => {
    await create(lead("A-1"));
    expect((await call("/leads/A-1", "DELETE")).status).toBe(204);
    expect((await call("/leads/A-1", "DELETE")).status).toBe(404);
  });

  it("limits writes to 60 per ip per minute", async () => {
    for (let i = 0; i < 60; i++) {
      const res = await create(lead(`L-${i}`));
      expect(res.status).toBe(201);
    }
    const res = await create(lead("L-61"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate limited" });
    // reads are not limited; other ips are unaffected
    expect((await call("/leads")).status).toBe(200);
    currentIp = "10.9.9.9";
    expect((await create(lead("OTHER"))).status).toBe(201);
  });
});
