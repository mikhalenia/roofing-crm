import { env } from "cloudflare:workers";
import { PERMIT_STATE_LABELS, type AgentResponse, type CreateLead, type PipelineLead } from "@crm/contracts";
import type { z } from "zod";
import { MockLanguageModelV4 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import migration from "../../migrations/0001_leads.sql?raw";
import app from "../index";
import { type AgentDeps, NO_ANSWER, OUT_OF_SCOPE_FALLBACK, runAgent, setAgentDeps, uncapCounts } from "./index";
import { INVALID_COORDINATES, buildTools, invalidArea } from "./tools";

const SNAPSHOT = { runId: "run-1", manifestCid: "bafy-manifest", syncedAt: "2026-10-01T00:00:00Z" };

function pipelineLead(apn: string, over: Partial<PipelineLead> = {}): PipelineLead {
  return {
    apn,
    situsAddress: `${apn} Main St`,
    situsCity: "SAN JOSE",
    lat: 37.33,
    lon: -121.88,
    roofAgeYears: 22,
    roofAgeAnchor: "final_date",
    permitNumber: `P-${apn}`,
    permitState: "expired_unfinaled",
    daysOpen: 900,
    contractorCompany: "Acme Roofing",
    cslbLicenseNumber: "123456",
    ownerName: "Owner",
    workDescription: "a very long description that should be trimmed away",
    bbbRating: null,
    distanceMiles: 1.2,
    provenance: {
      propertySourceUrl: "https://example.test/p",
      propertySourceVersion: "v1",
      permitSourceUrl: "https://example.test/permit",
      permitSourceVersion: "v1",
      fetchedAt: "2026-10-01T00:00:00Z",
    },
    ...over,
  };
}

/** Stub pipeline API: answers every list endpoint with `items`, records requested URLs. */
function stubFetch(items: PipelineLead[], status = 200) {
  const urls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ snapshot: SNAPSHOT, items }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return { fn: fn as unknown as typeof fetch, urls };
}

function stubJson(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}

type Exec = (input: unknown, options: unknown) => Promise<unknown>;
/** Runs a tool's execute the way the SDK would. */
const exec = (t: unknown, input: unknown, toolCallId = "x") =>
  (t as { execute: Exec }).execute(input, { toolCallId, messages: [], context: {} });

type ScriptedCall = { toolName: string; input: Record<string, unknown> };
type GenOpts = Parameters<NonNullable<AgentDeps["generateText"]>>[0];

/**
 * Stub for `generateText`: executes the scripted tool calls against the real tools it was
 * given (so fetch and the lead store are exercised) and returns one step plus `answer`.
 */
function scripted(calls: ScriptedCall[], answer: string) {
  const seen: GenOpts[] = [];
  const fn: NonNullable<AgentDeps["generateText"]> = async (opts) => {
    seen.push(opts);
    if (!opts.tools)
      return { text: answer, steps: [{ toolCalls: [], toolResults: [], content: [] }] };
    const toolCalls = [];
    const toolResults = [];
    const content = [];
    for (const [i, c] of calls.entries()) {
      const toolCallId = `call-${i}`;
      const call = { type: "tool-call" as const, toolCallId, toolName: c.toolName, input: c.input };
      toolCalls.push(call);
      try {
        const output = await exec(
          (opts.tools as Record<string, unknown>)[c.toolName],
          c.input,
          toolCallId,
        );
        const result = { ...call, type: "tool-result" as const, output };
        toolResults.push(result);
        content.push(result);
      } catch (error) {
        // the SDK reports a failed tool as a tool-error content part, not as a toolResult
        content.push({ ...call, type: "tool-error" as const, error });
      }
    }
    return { text: answer, steps: [{ toolCalls, toolResults, content }] };
  };
  return { fn, seen };
}

const leadStore = () => ({
  create: vi.fn<(input: CreateLead) => Promise<"created" | "exists">>(async () => "created"),
});

const AGED = { lat: 37.3382, lon: -121.8863, radiusMiles: 5, minRoofAgeYears: 20 };

describe("buildTools", () => {
  it("calls the pipeline endpoint and trims items to 25 with manifestCid once", async () => {
    const many = Array.from({ length: 30 }, (_, i) => pipelineLead(`A-${i}`));
    const { fn, urls } = stubFetch(many);
    const tools = buildTools("https://pipeline.test", fn, leadStore());
    const out = (await exec(tools.find_aged_roofs, AGED)) as {
      count: number;
      fetched: number;
      capped: boolean;
      shown: number;
      manifestCid: string;
      items: Record<string, unknown>[];
    };
    const url = new URL(urls[0]!);
    expect(url.pathname).toBe("/api/leads/aged-roofs");
    expect(url.searchParams.get("minRoofAgeYears")).toBe("20");
    expect(url.searchParams.get("radiusMiles")).toBe("5");
    expect(out.count).toBe(30);
    expect(out.fetched).toBe(30);
    expect(out.capped).toBe(false);
    expect(out.shown).toBe(25);
    expect(out.manifestCid).toBe("bafy-manifest");
    expect(out.items).toHaveLength(25);
    expect(out.items[0]).toEqual({
      apn: "A-0",
      address: "A-0 Main St",
      city: "SAN JOSE",
      roofAgeYears: 22,
      roofAgeAnchor: "final_date",
      permitNumber: "P-A-0",
      permitState: "expired_unfinaled",
      isStalled: true,
      permitStateLabel: null,
      approvalsComplete: null,
      daysOpen: 900,
      contractorCompany: "Acme Roofing",
      cslbLicenseNumber: "123456",
      ownerName: "Owner",
      distanceMiles: 1.2,
      permitSourceUrl: "https://example.test/permit",
    });
  });

  it("flags a result set that hit the fetch limit as capped", async () => {
    const many = Array.from({ length: 10 }, (_, i) => pipelineLead(`A-${i}`));
    const tools = buildTools("https://pipeline.test", stubFetch(many).fn, leadStore());
    const capped = (await exec(tools.find_aged_roofs, { ...AGED, limit: 10 })) as Record<string, unknown>;
    expect(capped).toMatchObject({ fetched: 10, capped: true, shown: 10 });
    const defaulted = (await exec(tools.find_aged_roofs, AGED)) as Record<string, unknown>;
    expect(defaulted).toMatchObject({ fetched: 10, capped: false, shown: 10 });
  });

  it("accepts numbers and booleans sent as strings (llama does this)", () => {
    const tools = buildTools("https://pipeline.test", stubFetch([]).fn, leadStore());
    const schema = tools.find_open_roofing_permits.inputSchema as z.ZodType;
    expect(
      schema.parse({ lat: "37.3382", lon: "-121.8863", radiusMiles: "5", roofingOnly: "false" }),
    ).toEqual({
      lat: 37.3382,
      lon: -121.8863,
      radiusMiles: 5,
      roofingOnly: false,
    });
  });

  it("defaults open-permit state to any and roofingOnly to true", async () => {
    const { fn, urls } = stubFetch([]);
    const tools = buildTools("https://pipeline.test", fn, leadStore());
    await exec(tools.find_open_roofing_permits, { lat: 37.3, lon: -121.9 });
    const url = new URL(urls[0]!);
    expect(url.pathname).toBe("/api/leads/open-permits");
    expect(url.searchParams.get("state")).toBe("any");
    expect(url.searchParams.get("roofingOnly")).toBe("true");
  });

  it("throws on a pipeline error so the model sees a failed tool", async () => {
    const { fn } = stubFetch([], 503);
    const tools = buildTools("https://pipeline.test", fn, leadStore());
    await expect(exec(tools.search_properties_in_radius, AGED)).rejects.toThrow(/503/);
  });

  it("lets create_lead accept only the 25 records the model saw", async () => {
    const store = leadStore();
    const many = Array.from({ length: 30 }, (_, i) => pipelineLead(`A-${i}`));
    const tools = buildTools("https://pipeline.test", stubFetch(many).fn, store);
    await exec(tools.find_aged_roofs, AGED);
    expect(await exec(tools.create_lead, { apn: "A-27" })).toMatchObject({ created: false });
    expect(await exec(tools.create_lead, { apn: "A-24" })).toMatchObject({ created: true });
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("refuses create_lead for an apn no tool returned", async () => {
    const store = leadStore();
    const tools = buildTools("https://pipeline.test", stubFetch([]).fn, store);
    const out = await exec(tools.create_lead, { apn: "NOPE" });
    expect(out).toMatchObject({ created: false });
    expect(store.create).not.toHaveBeenCalled();
  });
});

describe("search tool input checks", () => {
  it("returns a readable error instead of calling the pipeline with bad coordinates", async () => {
    const { fn, urls } = stubFetch([pipelineLead("264-12-034")]);
    const tools = buildTools("https://pipeline.test", fn, leadStore());
    const nested = await exec(tools.find_aged_roofs, { lat: { tool: "geocode_place", name: "San Jose" }, lon: -121.9 });
    expect(nested).toMatchObject({ count: 0, fetched: 0 });
    expect((nested as { error: string }).error).toContain(INVALID_COORDINATES);
    expect((await exec(tools.find_open_roofing_permits, { lat: 95, lon: -121.9 })) as { error: string }).toMatchObject({
      error: expect.stringContaining(INVALID_COORDINATES),
    });
    expect((await exec(tools.search_properties_in_radius, { lat: 37.3, lon: -121.9, radiusMiles: 60 })) as { error: string }).toMatchObject({
      error: "invalid radius 60; use 0.1 to 50 miles",
    });
    expect(urls).toHaveLength(0);
    expect(invalidArea({ lat: "37.3", lon: "-121.9", radiusMiles: "0.1" })).toBeNull();
    expect(invalidArea({ lat: 37.3, lon: -181 })).toContain(INVALID_COORDINATES);
  });

  const reject400 = (issues: unknown[]) =>
    (async () =>
      new Response(JSON.stringify({ error: "invalid request", issues }), { status: 400 })) as unknown as typeof fetch;

  it("passes the pipeline's 400 reason through, pointing at geocoding only for a location problem", async () => {
    const where = buildTools(
      "https://pipeline.test",
      reject400([{ path: ["lon"], message: "Too big: expected number to be <=-121.2" }]),
      leadStore(),
    );
    expect(await exec(where.find_aged_roofs, { lat: 37, lon: -121 })).toMatchObject({
      count: 0,
      error: `${INVALID_COORDINATES}: lon: Too big: expected number to be <=-121.2`,
    });
    const other = buildTools(
      "https://pipeline.test",
      reject400([{ path: ["state"], message: "Invalid option" }]),
      leadStore(),
    );
    expect(await exec(other.find_open_roofing_permits, { lat: 37.3, lon: -121.9, state: "open" })).toMatchObject({
      error: "the pipeline rejected the search: state: Invalid option",
    });
  });

  it("rejects a non-numeric radius instead of searching at the default", async () => {
    const { fn, urls } = stubFetch([]);
    const tools = buildTools("https://pipeline.test", fn, leadStore());
    const schema = (tools.find_aged_roofs as unknown as { inputSchema: { parse: (v: unknown) => Record<string, unknown> } }).inputSchema;
    const parsed = schema.parse({ lat: 37.3, lon: -121.9, radiusMiles: "five" });
    expect(parsed["radiusMiles"]).toBe("five");
    expect(await exec(tools.find_aged_roofs, parsed)).toMatchObject({ error: "invalid radius five; use 0.1 to 50 miles" });
    expect(await exec(tools.find_aged_roofs, { lat: 37.3, lon: -121.9, radiusMiles: { n: 5 } })).toMatchObject({
      error: 'invalid radius {"n":5}; use 0.1 to 50 miles',
    });
    expect(urls).toHaveLength(0);
  });
});

describe("runAgent", () => {
  it("answers an out-of-scope question in one sentence without tools", async () => {
    const calls: unknown[] = [];
    const generate: NonNullable<AgentDeps["generateText"]> = async (opts) => {
      calls.push(opts);
      return {
        text: "OUT_OF_SCOPE: I can only help with roofing leads in Santa Clara County, such as aged roofs and roofing permits.\nextra",
        steps: [{ toolCalls: [], toolResults: [], content: [] }],
      };
    };
    const res = await runAgent(
      env,
      { question: "What is the weather tomorrow?", context: null },
      { generateText: generate, fetch: stubFetch([]).fn, leadStore: leadStore(), model: "test-model" },
    );
    expect(calls).toHaveLength(1);
    expect(res).toEqual({
      answer: "I can only help with roofing leads in Santa Clara County, such as aged roofs and roofing permits.",
      toolCalls: [],
      sources: [],
      resolvedFilters: null,
    });
    expect(OUT_OF_SCOPE_FALLBACK).toMatch(/^I can only help/);
  });

  it("drops \"at least\" from counts unless a search was capped", async () => {
    const { fn: fetcher } = stubFetch([pipelineLead("264-12-034"), pipelineLead("264-12-035")]);
    const gen = scripted(
      [{ toolName: "find_aged_roofs", input: AGED }],
      "At least 2 roofs match, with roofs at least 20 years old: 264-12-034 and 264-12-035.\nSOURCES: 264-12-034",
    );
    const res = await runAgent(
      env,
      { question: "Old roofs?", context: null },
      { generateText: gen.fn, fetch: fetcher, leadStore: leadStore(), model: "test-model" },
    );
    expect(res.answer).toContain("2 roofs match, with roofs at least 20 years old");
    expect(uncapCounts("at least 200 properties", [{ name: "find_aged_roofs", args: {}, resultCount: 200, capped: true }])).toBe(
      "at least 200 properties",
    );
    expect(uncapCounts("At least 5 permits", [{ name: "find_open_roofing_permits", args: {}, resultCount: 5, capped: false }])).toBe(
      "5 permits",
    );
  });

  it("grounds a capped answer about work-approved permits: counts, stalled wording and sources", async () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      pipelineLead(`R-${i}`, { isStalled: false, approvalsComplete: true, permitStateLabel: "Expired (work approved, no final inspection)" }),
    );
    const gen = scripted(
      [{ toolName: "find_aged_roofs", input: AGED }],
      "At least 25 roofs have stalled permits, including R-0 Main St and R-1 Main St. Roof age 22 years.\nSOURCES:",
    );
    const res = await runAgent(
      env,
      { question: "Old roofs with stalled permits?", context: { lat: 37.3382, lon: -121.8863, radiusMiles: 5 } },
      { generateText: gen.fn, fetch: stubFetch(items).fn, leadStore: leadStore(), model: "test-model" },
    );
    expect(res.toolCalls[0]).toMatchObject({ resultCount: 200, capped: true, shown: 25 });
    expect(res.answer).toContain("At least 200 roofs have permits that expired after all approvals were completed");
    expect(res.answer).toMatch(/\nSOURCES: R-0, R-1$/);
    expect(res.sources.map((s) => s.apn)).toEqual(["R-0", "R-1"]);
  });

  it("says near <place> when the records are in another city", async () => {
    const items = [pipelineLead("C-1", { situsCity: "SAN JOSE", isStalled: true })];
    const gen = scripted(
      [
        { toolName: "geocode_place", input: { name: "Campbell" } },
        { toolName: "find_open_roofing_permits", input: { lat: 37.2872, lon: -121.95, radiusMiles: 5 } },
      ],
      "1 open roofing permit in Campbell: C-1 Main St (C-1). It is stalled.\nSOURCES: C-1",
    );
    const res = await runAgent(
      env,
      { question: "Open roofing permits in Campbell?", context: null },
      { generateText: gen.fn, fetch: stubFetch(items).fn, leadStore: leadStore(), model: "test-model" },
    );
    expect(res.answer).toContain("1 open roofing permit near Campbell (records are in San Jose)");
    expect(res.answer).toContain("It is stalled.");
  });

  it("passes the pipeline's stalled verdict and label to the model", async () => {
    const tools = buildTools(
      "https://pipeline.test",
      stubFetch([
        pipelineLead("S", { isStalled: true }),
        pipelineLead("W", { isStalled: false, approvalsComplete: true, permitStateLabel: "Expired (work approved, no final inspection)" }),
        pipelineLead("D", { isStalled: undefined, approvalsComplete: true }),
      ]).fn,
      leadStore(),
    );
    const out = (await exec(tools.find_aged_roofs, AGED)) as { stalledShown: number; items: Record<string, unknown>[] };
    expect(out.stalledShown).toBe(1);
    expect(out.items.map((i) => [i["apn"], i["isStalled"], i["permitStateLabel"]])).toEqual([
      ["S", true, null],
      ["W", false, "Expired (work approved, no final inspection)"],
      ["D", false, null],
    ]);
  });

  it("tells the model about out-of-scope replies, geocoding first, radius wording and approved expired permits", async () => {
    const gen = scripted([{ toolName: "find_aged_roofs", input: AGED }], "none");
    await runAgent(
      env,
      { question: "Old roofs?", context: null },
      { generateText: gen.fn, fetch: stubFetch([]).fn, leadStore: leadStore(), model: "test-model" },
    );
    const system = gen.seen[0]!.system;
    expect(system).toContain("OUT_OF_SCOPE:");
    expect(system).toMatch(/never a nested call/);
    expect(system).toMatch(/within N miles of\s+<place>", never "in <place>"/);
    expect(system).toMatch(/never write "at least"/);
    expect(system).toMatch(/Call a permit "stalled" ONLY when its isStalled field is true/);
    expect(system).toMatch(/never write "at least 25" when 200 were fetched/);
    expect(system).toMatch(/near <place> \(records are in <city>\)/);
    expect(system).toMatch(/must not be\s+empty whenever you describe any returned record/);
  });

  it("returns sources only for returned identifiers, counts, and resolved filters", async () => {
    const { fn: fetcher } = stubFetch([pipelineLead("264-12-034"), pipelineLead("264-12-035")]);
    const gen = scripted(
      [{ toolName: "find_aged_roofs", input: AGED }],
      "Roof older than 20 years: 264-12-034. Also 777-77-777.\nSOURCES: 264-12-034, 777-77-777",
    );
    const res = await runAgent(
      env,
      { question: "Old roofs near San Jose?", context: null },
      { generateText: gen.fn, fetch: fetcher, leadStore: leadStore(), model: "test-model" },
    );
    expect(res.sources).toEqual([
      { apn: "264-12-034", permitNumber: "P-264-12-034", address: "264-12-034 Main St" },
    ]);
    expect(res.toolCalls).toEqual([{ name: "find_aged_roofs", args: AGED, resultCount: 2, capped: false, shown: 2 }]);
    expect(res.resolvedFilters).toEqual({
      lat: 37.3382,
      lon: -121.8863,
      radiusMiles: 5,
      minRoofAgeYears: 20,
    });
    expect(res.answer).toContain("264-12-034");
    expect(gen.seen[0]!.system).toContain("call geocode_place");
  });

  it("puts the map context into the system prompt", async () => {
    const gen = scripted([{ toolName: "find_aged_roofs", input: AGED }], "none");
    await runAgent(
      env,
      { question: "Old roofs here?", context: { lat: 37.3, lon: -121.9, radiusMiles: 2 } },
      {
        generateText: gen.fn,
        fetch: stubFetch([]).fn,
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    expect(gen.seen[0]!.system).toContain("lat 37.3, lon -121.9, radius 2 miles");
  });

  it("adds the selected property to the system prompt and asks for get_property first", async () => {
    const gen = scripted([{ toolName: "find_aged_roofs", input: AGED }], "none");
    await runAgent(
      env,
      {
        question: "Tell me about 1 Main St",
        context: { lat: 37.3, lon: -121.9, radiusMiles: 2, apn: "264-12-034", address: "1 Main St" },
      },
      { generateText: gen.fn, fetch: stubFetch([]).fn, leadStore: leadStore(), model: "test-model" },
    );
    const system = gen.seen[0]!.system;
    expect(system).toContain("Selected property: APN 264-12-034, address 1 Main St.");
    expect(system).toMatch(/call get_property for APN 264-12-034 first/);
  });

  it("replaces the raw expired_unfinaled state name in the answer and tells the model not to use it", async () => {
    const gen = scripted(
      [{ toolName: "find_aged_roofs", input: AGED }],
      'Permit P-1 is "expired_unfinaled". Another is expired_unfinaled too.\nSOURCES: none',
    );
    const res = await runAgent(
      env,
      { question: "Old roofs?", context: null },
      { generateText: gen.fn, fetch: stubFetch([]).fn, leadStore: leadStore(), model: "test-model" },
    );
    expect(res.answer).not.toContain("expired_unfinaled");
    expect(res.answer).toContain(
      "Permit P-1 is expired without a final inspection. Another is expired without a final inspection too.",
    );
    expect(gen.seen[0]!.system).toContain('expired_unfinaled -> "Stalled"');
    expect(gen.seen[0]!.system).toMatch(/never the raw tool values/);
    expect(gen.seen[0]!.system).toContain('Never write "unfinaled"');
    expect(gen.seen[0]!.system).toContain("if no permit state filter was applied, do not claim a");
    for (const label of Object.values(PERMIT_STATE_LABELS)) expect(gen.seen[0]!.system).toContain(`"${label}"`);
  });

  it("replaces every raw pipeline token in the answer", async () => {
    const { plainStates } = await import("./index");
    expect(
      plainStates("final_date, approval_complete_issue_date, aged_roof, open_permit, stalled_permit, finaled, 'expired_unfinaled'"),
    ).toBe(
      "final inspection date, approval completed (issue date), aged roof, open permit, stalled permit, completed, expired without a final inspection",
    );
    expect(plainStates("expired, unfinaled permits")).toBe("permits that expired without a final inspection");
  });

  it("reports capped and shown for search tool calls", async () => {
    const { fn: fetcher } = stubFetch([pipelineLead("264-12-034"), pipelineLead("264-12-035")]);
    const gen = scripted([{ toolName: "find_aged_roofs", input: { ...AGED, limit: 2 } }], "Two roofs. Both old.\nSOURCES: 264-12-034");
    const res = await runAgent(
      env,
      { question: "Old roofs?", context: null },
      { generateText: gen.fn, fetch: fetcher, leadStore: leadStore(), model: "test-model" },
    );
    expect(res.toolCalls[0]).toMatchObject({ resultCount: 2, capped: true, shown: 2 });
  });

  it("omits the selected-property line without an apn", async () => {
    const gen = scripted([{ toolName: "find_aged_roofs", input: AGED }], "none");
    await runAgent(
      env,
      { question: "Old roofs here?", context: { lat: 37.3, lon: -121.9, radiusMiles: 2 } },
      { generateText: gen.fn, fetch: stubFetch([]).fn, leadStore: leadStore(), model: "test-model" },
    );
    expect(gen.seen[0]!.system).not.toContain("Selected property");
  });

  it("tells the model to geocode a named place even with map context, and to word capped counts", async () => {
    const gen = scripted([{ toolName: "find_aged_roofs", input: AGED }], "none");
    await runAgent(
      env,
      { question: "Old roofs in Cupertino?", context: { lat: 37.3, lon: -121.9, radiusMiles: 2 } },
      { generateText: gen.fn, fetch: stubFetch([]).fn, leadStore: leadStore(), model: "test-model" },
    );
    const system = gen.seen[0]!.system;
    expect(system).toMatch(/names a place, ALWAYS call geocode_place/);
    expect(system).toMatch(/even when map context is given/);
    expect(system).toContain("capped");
    expect(system).toContain("at least N matched");
  });

  it("reports tool results that carry an error field in toolCalls[].error", async () => {
    const gen = scripted(
      [
        { toolName: "geocode_place", input: { name: "Atlantis" } },
        { toolName: "create_lead", input: { apn: "NOPE" } },
      ],
      "Atlantis is not a known place. Nothing was saved.",
    );
    const res = await runAgent(
      env,
      { question: "Save NOPE near Atlantis", context: null },
      { generateText: gen.fn, fetch: stubFetch([]).fn, leadStore: leadStore(), model: "test-model" },
    );
    expect(res.toolCalls[0]).toMatchObject({ name: "geocode_place", resultCount: 0 });
    expect(res.toolCalls[0]!.error).toMatch(/Unknown place "Atlantis"/);
    expect(res.toolCalls[1]).toMatchObject({ name: "create_lead", resultCount: 0 });
    expect(res.toolCalls[1]!.error).toMatch(/NOPE was not returned/);
  });

  it("reports the fetched count (not the 25 shown) as resultCount", async () => {
    const many = Array.from({ length: 40 }, (_, i) => pipelineLead(`A-${i}`));
    const gen = scripted([{ toolName: "find_aged_roofs", input: AGED }], "At least 40 matched. Fine.");
    const res = await runAgent(
      env,
      { question: "Old roofs?", context: null },
      { generateText: gen.fn, fetch: stubFetch(many).fn, leadStore: leadStore(), model: "test-model" },
    );
    expect(res.toolCalls[0]!.resultCount).toBe(40);
  });

  it("wires create_lead to the lead store with the returned record", async () => {
    const store = leadStore();
    const gen = scripted(
      [
        { toolName: "find_aged_roofs", input: AGED },
        { toolName: "create_lead", input: { apn: "264-12-034" } },
      ],
      "Saved 264-12-034 as a lead.",
    );
    const res = await runAgent(
      env,
      { question: "Save the oldest roof near San Jose as a lead", context: null },
      {
        generateText: gen.fn,
        fetch: stubFetch([pipelineLead("264-12-034")]).fn,
        leadStore: store,
        model: "test-model",
      },
    );
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(store.create.mock.calls[0]![0].apn).toBe("264-12-034");
    expect(store.create.mock.calls[0]![0].snapshot.apn).toBe("264-12-034");
    expect(res.toolCalls[1]).toEqual({
      name: "create_lead",
      args: { apn: "264-12-034" },
      resultCount: 1,
    });
  });

  it("forces a text answer on the last step and only forces tools on the first", async () => {
    const gen = scripted([{ toolName: "geocode_place", input: { name: "Gilroy" } }], "Gilroy.");
    await runAgent(
      env,
      { question: "Roofs in Gilroy?", context: null },
      {
        generateText: gen.fn,
        fetch: stubFetch([]).fn,
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    const prepare = gen.seen[0]!.prepareStep!;
    expect(prepare({ stepNumber: 0 })).toBeUndefined();
    expect(prepare({ stepNumber: 1 })).toEqual({ toolChoice: "auto" });
    expect(prepare({ stepNumber: 5 })).toEqual({ toolChoice: "none" });
  });

  it("re-runs once with toolChoice required when the model skipped tools", async () => {
    const calls: GenOpts[] = [];
    const tooled = scripted(
      [{ toolName: "geocode_place", input: { name: "Cupertino" } }],
      "Cupertino resolved to its centroid. No records were searched yet.",
    );
    const gen: NonNullable<AgentDeps["generateText"]> = async (opts) => {
      calls.push(opts);
      return calls.length === 1
        ? { text: "I guess.", steps: [{ toolCalls: [], toolResults: [], content: [] }] }
        : tooled.fn(opts);
    };
    const res = await runAgent(
      env,
      { question: "Roofs near Cupertino?", context: null },
      { generateText: gen, fetch: stubFetch([]).fn, leadStore: leadStore(), model: "test-model" },
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]!.toolChoice).toBeUndefined();
    expect(calls[1]!.toolChoice).toBe("required");
    expect(res.toolCalls).toEqual([
      { name: "geocode_place", args: { name: "Cupertino" }, resultCount: 1 },
    ]);
    expect(res.answer).toBe("Cupertino resolved to its centroid. No records were searched yet.");
  });

  it("falls back to a plain message when the model wrote no text", async () => {
    const gen = scripted([{ toolName: "geocode_place", input: { name: "Gilroy" } }], "  ");
    const res = await runAgent(
      env,
      { question: "Roofs in Gilroy?", context: null },
      {
        generateText: gen.fn,
        fetch: stubFetch([]).fn,
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    expect(res.answer).toBe(NO_ANSWER);
  });

  it("cites nothing from get_property when the pipeline has no such property", async () => {
    const gen = scripted(
      [{ toolName: "get_property", input: { apn: "264-12-034" } }],
      "264-12-034 has an old roof.",
    );
    const res = await runAgent(
      env,
      { question: "Tell me about 264-12-034", context: null },
      {
        generateText: gen.fn,
        fetch: stubJson({ snapshot: SNAPSHOT, property: null }),
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    expect(res.toolCalls[0]).toEqual({
      name: "get_property",
      args: { apn: "264-12-034" },
      resultCount: 0,
    });
    expect(res.sources).toEqual([]);
  });

  it("cites only the get_property permit the answer names, under the returned apn", async () => {
    const gen = scripted(
      [{ toolName: "get_property", input: { apn: "asked-apn" } }],
      "Permit 2019-000002-RS expired without a final inspection.",
    );
    const detail = {
      snapshot: SNAPSHOT,
      property: { apn: "264-12-034", situsAddress: "1 Main St" },
      permits: [{ permitNumber: "2019-000001-RS" }, { permitNumber: "2019-000002-RS" }],
      roofAge: null,
      owners: [],
      contractors: [],
    };
    const res = await runAgent(
      env,
      { question: "Tell me about 264-12-034", context: null },
      {
        generateText: gen.fn,
        fetch: stubJson(detail),
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    expect(res.toolCalls[0]!.resultCount).toBe(1);
    expect(res.sources).toEqual([{ apn: "264-12-034", permitNumber: "2019-000002-RS" }]);
  });

  it("repairs an answer that is only a SOURCES line with one tool-free call", async () => {
    const tooled = scripted(
      [{ toolName: "find_aged_roofs", input: AGED }],
      "SOURCES: 264-12-034, 264-12-035",
    );
    const calls: GenOpts[] = [];
    const prose =
      "2 properties matched a roof age of at least 20 years within 5 miles. " +
      "264-12-034 Main St has a 22-year-old roof; its permit expired without a final inspection.\n" +
      "SOURCES: 264-12-034";
    const gen: NonNullable<AgentDeps["generateText"]> = async (opts) => {
      calls.push(opts);
      return opts.tools
        ? tooled.fn(opts)
        : { text: prose, steps: [{ toolCalls: [], toolResults: [], content: [] }] };
    };
    const res = await runAgent(
      env,
      { question: "Old roofs near San Jose?", context: null },
      {
        generateText: gen,
        fetch: stubFetch([pipelineLead("264-12-034"), pipelineLead("264-12-035")]).fn,
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]!.tools).toBeUndefined();
    expect(calls[1]!.toolChoice).toBe("none");
    expect(calls[1]!.system).toBe(calls[0]!.system);
    expect(calls[1]!.prompt).toContain("Old roofs near San Jose?");
    expect(calls[1]!.prompt).toContain('"apn":"264-12-035"');
    expect(res.answer).toBe(prose);
    expect(res.sources.map((s) => s.apn)).toEqual(["264-12-034"]);
    expect(res.toolCalls).toEqual([{ name: "find_aged_roofs", args: AGED, resultCount: 2, capped: false, shown: 2 }]);
  });

  it("keeps the original answer when the repair is degenerate too", async () => {
    const gen = scripted([{ toolName: "find_aged_roofs", input: AGED }], "SOURCES: 264-12-034");
    const res = await runAgent(
      env,
      { question: "Old roofs near San Jose?", context: null },
      {
        generateText: gen.fn,
        fetch: stubFetch([pipelineLead("264-12-034")]).fn,
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    expect(gen.seen).toHaveLength(2);
    expect(res.answer).toBe("SOURCES: 264-12-034");
  });

  it("does not repair an answer that already has prose", async () => {
    const gen = scripted(
      [{ toolName: "find_aged_roofs", input: AGED }],
      "1 property matched. 264-12-034 has a 22-year-old roof.\nSOURCES: 264-12-034",
    );
    await runAgent(
      env,
      { question: "Old roofs near San Jose?", context: null },
      {
        generateText: gen.fn,
        fetch: stubFetch([pipelineLead("264-12-034")]).fn,
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    expect(gen.seen).toHaveLength(1);
  });

  it("reports a failed tool call with resultCount 0", async () => {
    const gen = scripted(
      [{ toolName: "find_aged_roofs", input: AGED }],
      "The pipeline is unavailable.",
    );
    const res = await runAgent(
      env,
      { question: "Old roofs near San Jose?", context: null },
      {
        generateText: gen.fn,
        fetch: stubFetch([], 500).fn,
        leadStore: leadStore(),
        model: "test-model",
      },
    );
    expect(res.toolCalls).toEqual([
      {
        name: "find_aged_roofs",
        args: AGED,
        resultCount: 0,
        error: expect.stringContaining("500"),
      },
    ]);
    expect(res.sources).toEqual([]);
  });
});

describe("runAgent with the real ai generateText loop", () => {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };

  it("runs tools, cites returned records only, and resolves filters", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "c1",
              toolName: "find_aged_roofs",
              input: JSON.stringify({
                lat: "37.3382",
                lon: -121.8863,
                radiusMiles: 5,
                minRoofAgeYears: 20,
              }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [
            {
              type: "text",
              text: "Roof 22 years: 264-12-034. Also 777-77-777.\nSOURCES: 264-12-034",
            },
          ],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });
    const { fn: fetcher, urls } = stubFetch([
      pipelineLead("264-12-034"),
      pipelineLead("264-12-035"),
    ]);
    const res = await runAgent(
      env,
      { question: "Old roofs near San Jose?", context: null },
      { fetch: fetcher, leadStore: leadStore(), model },
    );
    expect(urls).toHaveLength(1);
    expect(res.toolCalls).toEqual([{ name: "find_aged_roofs", args: AGED, resultCount: 2, capped: false, shown: 2 }]);
    expect(res.sources.map((s) => s.apn)).toEqual(["264-12-034"]);
    expect(res.resolvedFilters).toEqual({
      lat: 37.3382,
      lon: -121.8863,
      radiusMiles: 5,
      minRoofAgeYears: 20,
    });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[1]!.toolChoice).toEqual({ type: "auto" });
  });

  it("surfaces a failed tool through the real loop", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "c1",
              toolName: "find_aged_roofs",
              input: JSON.stringify(AGED),
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [
            {
              type: "text",
              text: "The pipeline failed. No properties can be named.\nSOURCES: none",
            },
          ],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });
    const res = await runAgent(
      env,
      { question: "Old roofs near San Jose?", context: null },
      { fetch: stubFetch([], 503).fn, leadStore: leadStore(), model },
    );
    expect(res.toolCalls[0]!.resultCount).toBe(0);
    expect(res.toolCalls[0]!.error).toMatch(/503/);
  });
});

describe("POST /agent", () => {
  let ip = 0;
  const post = (body: unknown) =>
    app.request(
      "/agent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": `10.1.0.${++ip}` },
        body: JSON.stringify(body),
      },
      env,
    );

  beforeAll(async () => {
    const statements = migration
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const s of statements) await env.DB.prepare(s).run();
  });
  beforeEach(() => setAgentDeps(null));

  it("returns an AgentResponse", async () => {
    const gen = scripted([{ toolName: "find_aged_roofs", input: AGED }], "Old roof: 264-12-034.");
    setAgentDeps({
      generateText: gen.fn,
      fetch: stubFetch([pipelineLead("264-12-034")]).fn,
      model: "test-model",
    });
    const res = await post({ question: "Old roofs near San Jose?", context: null });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AgentResponse;
    expect(body.sources.map((s) => s.apn)).toEqual(["264-12-034"]);
    expect(body.toolCalls[0]!.resultCount).toBe(1);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await post({ question: "x" });
    expect(res.status).toBe(400);
  });

  it("maps a model error to 502 with the message", async () => {
    setAgentDeps({
      generateText: async () => {
        throw new Error("model exploded");
      },
      model: "test-model",
    });
    const res = await post({ question: "Old roofs near San Jose?", context: null });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "model exploded" });
  });

  it("is rate limited like writes", async () => {
    const gen = scripted([], "nothing");
    setAgentDeps({ generateText: gen.fn, model: "test-model" });
    const headers = { "content-type": "application/json", "CF-Connecting-IP": "10.2.2.2" };
    const body = JSON.stringify({ question: "hello there", context: null });
    for (let i = 0; i < 60; i++) {
      const r = await app.request("/agent", { method: "POST", headers, body }, env);
      expect(r.status).toBe(200);
    }
    const r = await app.request("/agent", { method: "POST", headers, body }, env);
    expect(r.status).toBe(429);
  });
});
