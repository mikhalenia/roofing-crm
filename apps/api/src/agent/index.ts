import type { AgentRequest, AgentResponse } from "@crm/contracts";
import { generateText, type LanguageModel, stepCountIs } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { insertLead } from "../leads";
import { extractSources, resolvedFiltersFromCalls, type Source } from "./postfilter";
import { SYSTEM_PROMPT } from "./prompt";
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
  tools: AgentTools;
  stopWhen: ReturnType<typeof stepCountIs>;
  toolChoice?: "required";
  prepareStep: (step: { stepNumber: number }) => { toolChoice: "auto" | "none" } | undefined;
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
  return req.context
    ? `\nCurrent map context: lat ${req.context.lat}, lon ${req.context.lon}, radius ${req.context.radiusMiles} miles.`
    : "\nNo map context; call geocode_place when the question names a place.";
}

/** Records an output exposes for citation: list items, or the APN/permits of get_property. */
function sourcesOf(call: StepCall, output: unknown): Source[] {
  const o = (output ?? {}) as { items?: unknown; permits?: unknown };
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
    for (const it of o.items as Record<string, unknown>[])
      push(it["apn"], it["permitNumber"], it["address"]);
  }
  if (call.toolName === "get_property") {
    const apn = (call.input as { apn?: unknown } | null)?.apn;
    push(apn, undefined, undefined);
    if (Array.isArray(o.permits)) {
      for (const p of o.permits as Record<string, unknown>[])
        push(apn, p?.["permitNumber"], undefined);
    }
  }
  return rows;
}

export async function runAgent(
  env: Cloudflare.Env,
  req: AgentRequest,
  deps: AgentDeps = {},
): Promise<AgentResponse> {
  const generate = deps.generateText ?? ((o: GenerateOptions) => generateText(o));
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
  if (!result.steps.some((s) => s.toolCalls.length > 0)) {
    result = await generate({ ...base, toolChoice: "required" });
  }

  const toolCalls: AgentResponse["toolCalls"] = [];
  const returned: Source[] = [];
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      const res = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
      const count = (res?.output as { count?: unknown } | undefined)?.count;
      toolCalls.push({
        name: call.toolName,
        args: call.input,
        resultCount: typeof count === "number" ? count : 0,
      });
      if (res) returned.push(...sourcesOf(call, res.output));
    }
  }

  const answer = result.text.trim() || NO_ANSWER;
  return {
    answer,
    toolCalls,
    sources: extractSources(answer, returned),
    resolvedFilters: resolvedFiltersFromCalls(toolCalls),
  };
}
