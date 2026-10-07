/**
 * Every user-facing name for a pipeline or CRM value. No raw token (expired_unfinaled,
 * final_date, aged_roof, ...) may reach the screen; route all display text through here.
 */
import {
  CONFIDENCE_LABELS,
  PERMIT_STATE_HINTS,
  PERMIT_STATE_LABELS,
  ROOF_BASIS_LABELS,
  SIGNAL_LABELS,
  replaceRawTokens,
  type AgentResponse,
  type PipelineLead,
} from "@crm/contracts";

const PERMIT_STATE = PERMIT_STATE_LABELS;
const PERMIT_HINT = PERMIT_STATE_HINTS;
const ROOF_BASIS = ROOF_BASIS_LABELS;
const CONFIDENCE = CONFIDENCE_LABELS;
const LEAD_STATUS: Record<string, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", lost: "Lost" };
const SIGNAL: Record<string, string> = { ...SIGNAL_LABELS, other: "Other" };
const TOOL: Record<string, string> = {
  find_aged_roofs: "Searched aged roofs",
  find_open_roofing_permits: "Searched roofing permits",
  search_properties_in_radius: "Searched properties",
  get_property: "Looked up a property",
  geocode_place: "Located a place",
  create_lead: "Saved a lead",
};

const pick = (map: Record<string, string>, v: string | null | undefined, fallback: string) =>
  (v ? map[v] : undefined) ?? fallback;

/** "Open", "Stalled", "Completed"; "No permit" when empty. */
export const permitStateLabel = (s: string | null | undefined) => (s ? pick(PERMIT_STATE, s, "Unknown state") : "No permit");
/** One-sentence meaning of a permit state, for tooltips and secondary text. */
export const permitStateHint = (s: string | null | undefined) => pick(PERMIT_HINT, s, "");
/**
 * Long form, "Stalled (permit expired without a final inspection)". The pipeline API's own
 * label wins when present (`apiLabel`); the local mapping is the fallback.
 */
export const permitStateText = (s: string | null | undefined, apiLabel?: string | null) =>
  apiLabel ||
  (s === "expired_unfinaled" ? `${permitStateLabel(s)} (permit expired without a final inspection)` : permitStateLabel(s));

export const roofBasisLabel = (anchor: string | null | undefined, apiLabel?: string | null) =>
  apiLabel || pick(ROOF_BASIS, anchor, "unknown basis");
export const confidenceLabel = (c: string | null | undefined, apiLabel?: string | null) =>
  apiLabel || pick(CONFIDENCE, c, "unknown confidence");
export const leadStatusLabel = (s: string) => pick(LEAD_STATUS, s, s);
export const signalLabel = (s: string) => pick(SIGNAL, s, "Other");
export const toolLabel = (name: string) => pick(TOOL, name, "Used a tool");

/** 7842 -> "7,842". */
export const formatCount = (n: number) => n.toLocaleString("en-US");

/** 8492 -> "23 years, 3 months"; under a month -> "12 days". */
export function durationText(days: number): string {
  const years = Math.floor(days / 365.25);
  const months = Math.floor((days - years * 365.25) / 30.44);
  const parts = [
    years > 0 && `${years} ${years === 1 ? "year" : "years"}`,
    months > 0 && `${months} ${months === 1 ? "month" : "months"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : `${days} ${days === 1 ? "day" : "days"}`;
}

/** Tooltip text for a duration: "8,492 days". */
export const daysText = (days: number) => `${formatCount(days)} ${days === 1 ? "day" : "days"}`;

/** "Oct 7, 2026" from an ISO timestamp, a date or a run id like "2026-10-07T17-10-54Z"; null when unparseable. */
export function friendlyDate(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function roofAgeText(l: PipelineLead): string {
  if (l.roofAgeYears == null) return "Roof age unknown";
  const extra = [
    l.roofAgeConfidence && confidenceLabel(l.roofAgeConfidence, l.roofAgeConfidenceLabel),
    l.roofAgeAnchor && `based on the ${roofBasisLabel(l.roofAgeAnchor, l.roofAgeBasisLabel)}`,
  ]
    .filter(Boolean)
    .join(", ");
  return `Roof ${l.roofAgeYears} yrs${extra ? `, ${extra}` : ""}`;
}

/** Three short lines for the marker hover card: address, roof age, permit state and time open. */
export function hoverLines(l: PipelineLead): [string, string, string] {
  const roof =
    l.roofAgeYears != null
      ? `Roof ${l.roofAgeYears} yrs${l.roofAgeConfidence ? ` (${confidenceLabel(l.roofAgeConfidence, l.roofAgeConfidenceLabel)})` : ""}`
      : "Roof age unknown";
  const state = permitStateLabel(l.permitState);
  const permit = l.daysOpen != null ? `${state} · open ${durationText(l.daysOpen)}` : state;
  return [l.situsAddress ?? l.apn, roof, permit];
}

/** The answer as shown: raw tokens replaced and the trailing "SOURCES: ..." line removed (sources are chips). */
export function displayAnswer(answer: string): string {
  // Case-sensitive: the prompt mandates "SOURCES:", and a prose line "Sources: ..." must stay.
  const prose = answer.replace(/(^|\n)[ \t]*SOURCES:[^\n]*\s*$/, "");
  return replaceRawTokens(prose).trim();
}

type ToolCall = AgentResponse["toolCalls"][number];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "Searched aged roofs: 5 mi around 37.3382, -121.8863, roof at least 15 yrs: 200 results". */
export function humanizeToolCall(t: ToolCall): string {
  const a = (t.args ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  const lat = num(a["lat"]);
  const lon = num(a["lon"]);
  if (lat != null && lon != null) parts.push(`${num(a["radiusMiles"]) ?? 5} mi around ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  if (typeof a["name"] === "string") parts.push(`"${a["name"]}"`);
  if (typeof a["apn"] === "string") parts.push(`APN ${a["apn"]}`);
  const age = num(a["minRoofAgeYears"]);
  if (age != null) parts.push(`roof at least ${age} yrs`);
  const open = num(a["minOpenYears"]);
  if (open != null && open > 0) parts.push(`open at least ${open} yrs`);
  const state = a["permitState"] ?? a["state"];
  if (typeof state === "string") parts.push(state === "any" ? "open or stalled permits" : `${permitStateLabel(state).toLowerCase()} permits`);
  const count = t.error ? "failed" : `${t.capped ? "at least " : ""}${formatCount(t.resultCount)} ${t.resultCount === 1 ? "result" : "results"}`;
  return [toolLabel(t.name), ...(parts.length ? [parts.join(", ")] : []), count].join(" · ");
}
