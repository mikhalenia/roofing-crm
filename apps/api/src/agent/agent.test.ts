import { env } from "cloudflare:workers";
import type { AgentResponse, CreateLead, PipelineLead } from "@crm/contracts";
import type { z } from "zod";
import { MockLanguageModelV4 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import migration from "../../migrations/0001_leads.sql?raw";
import app from "../index";
import { type AgentDeps, NO_ANSWER, runAgent, setAgentDeps } from "./index";
import { buildTools } from "./tools";

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
      manifestCid: string;
      items: Record<string, unknown>[];
    };
    const url = new URL(urls[0]!);
    expect(url.pathname).toBe("/api/leads/aged-roofs");
    expect(url.searchParams.get("minRoofAgeYears")).toBe("20");
    expect(url.searchParams.get("radiusMiles")).toBe("5");
    expect(out.count).toBe(30);
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
      daysOpen: 900,
      contractorCompany: "Acme Roofing",
      cslbLicenseNumber: "123456",
      ownerName: "Owner",
      distanceMiles: 1.2,
      permitSourceUrl: "https://example.test/permit",
    });
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

describe("runAgent", () => {
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
    expect(res.toolCalls).toEqual([{ name: "find_aged_roofs", args: AGED, resultCount: 2 }]);
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
    const prepare = gen.seen[0]!.prepareStep;
    expect(prepare({ stepNumber: 0 })).toBeUndefined();
    expect(prepare({ stepNumber: 1 })).toEqual({ toolChoice: "auto" });
    expect(prepare({ stepNumber: 5 })).toEqual({ toolChoice: "none" });
  });

  it("re-runs once with toolChoice required when the model skipped tools", async () => {
    const calls: GenOpts[] = [];
    const tooled = scripted(
      [{ toolName: "geocode_place", input: { name: "Cupertino" } }],
      "Cupertino.",
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
    expect(res.answer).toBe("Cupertino.");
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
    expect(res.toolCalls).toEqual([{ name: "find_aged_roofs", args: AGED, resultCount: 2 }]);
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
          content: [{ type: "text", text: "The pipeline failed.\nSOURCES: none" }],
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
