import { type AgentResponse, PartialSearchParams } from "@crm/contracts";

export type Source = AgentResponse["sources"][number];
export type ToolCallSummary = { name: string; args: unknown };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `id` occurs in `text` as a whole token (not inside a longer identifier). */
function mentions(text: string, id: string): boolean {
  return new RegExp(`(?<![\\w-])${escapeRegExp(id)}(?![\\w-])`, "i").test(text);
}

/**
 * Sources are the tool-returned records whose APN or permit number the answer mentions.
 * Identifiers the model invented (not returned by any tool) are dropped.
 */
export function extractSources(answer: string, toolResults: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const r of toolResults) {
    const key = `${r.apn}|${r.permitNumber ?? ""}`;
    if (seen.has(key)) continue;
    if (mentions(answer, r.apn) || (r.permitNumber && mentions(answer, r.permitNumber))) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

/** Defaults each spatial tool applies when the model omits an argument. */
const SPATIAL_DEFAULTS: Record<string, Record<string, unknown>> = {
  search_properties_in_radius: { radiusMiles: 5 },
  find_aged_roofs: { radiusMiles: 5, minRoofAgeYears: 15 },
  find_open_roofing_permits: { radiusMiles: 5, permitState: "any", minOpenYears: 0 },
};

/** Map filters from the last spatial tool call, or null when there is none or it is out of bounds. */
export function resolvedFiltersFromCalls(
  toolCalls: ToolCallSummary[],
): AgentResponse["resolvedFilters"] {
  const last = [...toolCalls].reverse().find((c) => c.name in SPATIAL_DEFAULTS);
  if (!last) return null;
  const a = (last.args ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...SPATIAL_DEFAULTS[last.name] };
  for (const key of ["lat", "lon", "radiusMiles", "minRoofAgeYears", "minOpenYears"]) {
    if (a[key] !== undefined) merged[key] = a[key];
  }
  if (a["state"] !== undefined) merged["permitState"] = a["state"];
  const parsed = PartialSearchParams.safeParse(merged);
  return parsed.success && parsed.data.lat !== undefined && parsed.data.lon !== undefined
    ? parsed.data
    : null;
}
