import { replaceRawTokens, type AgentRequest, type AgentResponse } from "@crm/contracts";
import { generateText, type LanguageModel, stepCountIs } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { insertLead } from "../leads";
import {
  extractSources,
  isDegenerateAnswer,
  mentions,
  resolvedFiltersFromCalls,
  type Source,
} from "./postfilter";
import { type Evidence, ensureSources, fixCounts, groundStalled, nearPlace } from "./grounding";
import { OUT_OF_SCOPE, SYSTEM_PROMPT } from "./prompt";
import { type AgentTools, buildTools, type LeadStore } from "./tools";

export const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_STEPS = 6;
/** Shown when the model ends without writing text (seen with gpt-oss on Workers AI). */
export const NO_ANSWER =
  "The model did not write an answer. See the tool calls for what was tried.";

export interface GenerateOptions {
  model: LanguageModel;
  system: string;
  prompt: string;
  /** Absent on the tool-free repair call. */
  tools?: AgentTools;
  stopWhen?: ReturnType<typeof stepCountIs>;
  toolChoice?: "required" | "none";
  prepareStep?: (step: { stepNumber: number }) => { toolChoice: "auto" | "none" } | undefined;
}
interface StepCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}
export interface GenerateResult {
  text: string;
  steps: ReadonlyArray<{
    toolCalls: ReadonlyArray<StepCall>;
    toolResults: ReadonlyArray<StepCall & { output: unknown }>;
    /** The SDK reports failed tools here as parts of type "tool-error". */
    content: ReadonlyArray<{ type: string; toolCallId?: string; error?: unknown }>;
  }>;
}

/** Injection points for tests: the model call, the pipeline fetch, the lead store and the model. */
export interface AgentDeps {
  generateText?: (opts: GenerateOptions) => Promise<GenerateResult>;
  fetch?: typeof fetch;
  leadStore?: LeadStore;
  model?: LanguageModel;
}

let routeDeps: AgentDeps | null = null;
/** Test hook: deps used by the POST /agent route (null restores the real ones). */
export function setAgentDeps(deps: AgentDeps | null): void {
  routeDeps = deps;
}
export function getAgentDeps(): AgentDeps {
  return routeDeps ?? {};
}

function contextLine(req: AgentRequest): string {
  const c = req.context;
  if (!c) return "\nNo map context; call geocode_place when the question names a place.";
  const map = `\nCurrent map context: lat ${c.lat}, lon ${c.lon}, radius ${c.radiusMiles} miles. If the question names a place, geocode it instead.`;
  if (!c.apn) return map;
  const address = c.address ? `, address ${c.address}` : "";
  return `${map}\nSelected property: APN ${c.apn}${address}. The user picked it on the map: call get_property for APN ${c.apn} first and answer about it (roof age, permits, contractor, lead quality).`;
}

/**
 * Records an output exposes for citation: list items, or for get_property the APN the
 * pipeline returned plus only those of its permits whose number the answer names.
 */
function sourcesOf(call: StepCall, output: unknown, answer: string): Source[] {
  const o = (output ?? {}) as { items?: unknown; property?: unknown; permits?: unknown };
  const rows: Source[] = [];
  const push = (apn: unknown, permitNumber: unknown, address: unknown) => {
    if (typeof apn !== "string") return;
    rows.push({
      apn,
      ...(typeof permitNumber === "string" ? { permitNumber } : {}),
      ...(typeof address === "string" ? { address } : {}),
    });
  };
  if (Array.isArray(o.items)) {
    for (const it of o.items as Record<string, unknown>[]) {
      push(it["apn"], it["permitNumber"], it["address"]);
    }
  }
  if (call.toolName === "get_property" && o.property && typeof o.property === "object") {
    const p = o.property as Record<string, unknown>;
    push(p["apn"], undefined, p["situsAddress"]);
    if (Array.isArray(o.permits)) {
      for (const permit of o.permits as Record<string, unknown>[]) {
        const n = permit?.["permitNumber"];
        if (typeof n === "string" && mentions(answer, n)) push(p["apn"], n, undefined);
      }
    }
  }
  return rows;
}

export const OUT_OF_SCOPE_FALLBACK =
  "I can only help with roofing leads in Santa Clara County: aged roofs, roofing permits and contractors near a place, and saving properties as leads.";

/** Kept for callers and tests: the count safety net now lives in grounding.ts. */
export const uncapCounts = fixCounts;

/** Safety net for prompt rule 5: never show a raw pipeline token to a sales user. */
export function plainStates(text: string): string {
  return replaceRawTokens(text);
}

/** Adds what one tool call returned to the evidence the safety nets check against. */
function collectEvidence(evidence: Evidence, call: StepCall, output: unknown): void {
  const o = (output ?? {}) as { items?: unknown; stalledShown?: unknown; error?: unknown };
  if (call.toolName === "geocode_place" && !o.error) {
    const name = (call.input as { name?: unknown } | null)?.name;
    if (typeof name === "string") evidence.places.push(name);
  }
  if (!Array.isArray(o.items)) return;
  for (const it of o.items as Record<string, unknown>[]) {
    if (typeof it["city"] === "string") evidence.cities.push(it["city"]);
  }
  evidence.shown += o.items.length;
  evidence.approvedShown += (o.items as Record<string, unknown>[]).filter(
    (it) => it["permitState"] === "expired_unfinaled" && it["approvalsComplete"] === true,
  ).length;
  evidence.stalledShown +=
    typeof o.stalledShown === "number"
      ? o.stalledShown
      : (o.items as Record<string, unknown>[]).filter((it) => it["isStalled"] !== false).length;
}

function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.trim() || "tool failed";
}

/** Asks for the prose answer again, handing over the (already trimmed) tool results. */
function repairPrompt(question: string, result: GenerateResult): string {
  const results = result.steps.flatMap((s) =>
    s.toolResults.map((r) => ({ tool: r.toolName, input: r.input, output: r.output })),
  );
  return [
    `Question: ${question}`,
    `Tool results (JSON): ${JSON.stringify(results)}`,
    "Your previous reply had no explanation. Using only these tool results, write 2-5 sentences " +
      "answering the question (how many matched, the thresholds used, 3-5 concrete examples, caveats), " +
      "then a final line SOURCES: with at most 10 identifiers you named.",
  ].join("\n\n");
}

export async function runAgent(
  env: Cloudflare.Env,
  req: AgentRequest,
  deps: AgentDeps = {},
): Promise<AgentResponse> {
  const generate: NonNullable<AgentDeps["generateText"]> =
    deps.generateText ?? ((o) => generateText(o));
  const fetcher = deps.fetch ?? ((input, init) => fetch(input, init));
  const leadStore = deps.leadStore ?? { create: (input) => insertLead(env.DB, input) };
  const model = deps.model ?? createWorkersAI({ binding: env.AI })(MODEL_ID);

  const tools = buildTools(env.PIPELINE_API, fetcher, leadStore);
  const base: GenerateOptions = {
    model,
    system: SYSTEM_PROMPT + contextLine(req),
    prompt: req.question,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    // A "required" re-run only forces the first step; the last step may not call tools,
    // so the run always ends with a written answer.
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 ? undefined : { toolChoice: stepNumber >= MAX_STEPS - 1 ? "none" : "auto" },
  };

  let result = await generate(base);
  const calledTools = result.steps.some((s) => s.toolCalls.length > 0);
  // Rule 0: an out-of-scope question gets one sentence and no tools.
  if (!calledTools && result.text.trim().startsWith(OUT_OF_SCOPE)) {
    const sentence = result.text.trim().slice(OUT_OF_SCOPE.length).split("\n")[0]!.trim();
    return {
      answer: sentence || OUT_OF_SCOPE_FALLBACK,
      toolCalls: [],
      sources: [],
      resolvedFilters: null,
    };
  }
  if (!calledTools) {
    result = await generate({ ...base, toolChoice: "required" });
  }

  let text = result.text;
  if (isDegenerateAnswer(text)) {
    // One tool-free repair call: rewrite the answer from the tool results already fetched.
    const repaired = await generate({
      model,
      system: base.system,
      prompt: repairPrompt(req.question, result),
      toolChoice: "none",
    });
    if (!isDegenerateAnswer(repaired.text)) text = repaired.text;
  }
  const answer = plainStates(text.trim()) || NO_ANSWER;
  const toolCalls: AgentResponse["toolCalls"] = [];
  const returned: Source[] = [];
  const evidence: Evidence = { places: [], cities: [], shown: 0, stalledShown: 0, approvedShown: 0 };
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      const res = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
      const failed = step.content.find(
        (p) => p.type === "tool-error" && p.toolCallId === call.toolCallId,
      );
      const out = (res?.output ?? {}) as {
        count?: unknown;
        fetched?: unknown;
        error?: unknown;
        capped?: unknown;
        shown?: unknown;
      };
      const count = typeof out.fetched === "number" ? out.fetched : out.count;
      // A tool can also report a soft failure (unknown place, unknown APN) as an `error` field.
      const error = failed
        ? errorMessage(failed.error)
        : typeof out.error === "string" && out.error.trim()
          ? out.error
          : undefined;
      toolCalls.push({
        name: call.toolName,
        args: call.input,
        resultCount: !failed && typeof count === "number" ? count : 0,
        ...(error ? { error } : {}),
        ...(!failed && typeof out.capped === "boolean" ? { capped: out.capped } : {}),
        ...(!failed && typeof out.shown === "number" ? { shown: out.shown } : {}),
      });
      if (res && !failed) {
        returned.push(...sourcesOf(call, res.output, answer));
        collectEvidence(evidence, call, res.output);
      }
    }
  }

  const worded = nearPlace(groundStalled(fixCounts(answer, toolCalls), evidence), evidence);
  const cited = ensureSources(worded, extractSources(worded, returned), returned);
  return {
    answer: cited.answer,
    toolCalls,
    sources: cited.sources,
    resolvedFilters: resolvedFiltersFromCalls(toolCalls),
  };
}
