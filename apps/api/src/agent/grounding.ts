import type { AgentResponse } from "@crm/contracts";
import type { Source } from "./postfilter";

/**
 * Code-level safety nets that keep the answer consistent with the tool results, applied after
 * the model wrote it. Each one is small and only rewrites what the results contradict.
 */

type ToolCall = AgentResponse["toolCalls"][number];

/** What the search tools returned, collected by runAgent for these checks. */
export interface Evidence {
  /** Names passed to geocode_place, in call order. */
  places: string[];
  /** City of every record a search tool showed the model. */
  cities: string[];
  /** Records a search tool showed the model, and how many the pipeline counts as stalled. */
  shown: number;
  stalledShown: number;
}

const COUNTED = "properties|property|roofs|permits|matches|results|records|homes|parcels|leads";

/**
 * Prompt rule 9 in code. With a capped search, "at least N" must use the fetched count, never
 * the shown count ("at least 25" when 200 were fetched). Without one, "at least" is dropped.
 * Thresholds such as "roofs at least 15 years old" are left alone.
 */
export function fixCounts(answer: string, toolCalls: ReadonlyArray<ToolCall>): string {
  const capped = toolCalls.filter((t) => t.capped === true && !t.error);
  const re = new RegExp(`\\bat least (\\d[\\d,]*) (${COUNTED})\\b`, "gi");
  if (capped.length === 0) return answer.replace(re, "$1 $2");
  const fetched = Math.max(...capped.map((t) => t.resultCount));
  return answer.replace(re, (m, n: string, what: string) => {
    const value = Number(n.replace(/,/g, ""));
    return value < fetched ? `${m.slice(0, 8)} ${fetched.toLocaleString("en-US")} ${what}` : m;
  });
}

/**
 * Prompt rule 5 in code: when the search results include no stalled record (isStalled false
 * for all of them), "stalled" in the answer is wrong; those permits expired after every
 * approval was completed ("Expired (work approved)").
 */
export function groundStalled(answer: string, evidence: Evidence): string {
  if (evidence.shown === 0 || evidence.stalledShown > 0) return answer;
  return answer
    .replace(/\bstalled\s+(permits?)\b/gi, (_m, noun: string) => `${noun} that expired after all approvals were completed`)
    .replace(/\bstalled\b/gi, "expired (work approved)");
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Prompt rule 10 in code: a radius around a geocoded place reaches other cities. When none of
 * the shown records is in the asked place, "in <place>" becomes
 * "near <place> (records are in <city>)".
 */
export function nearPlace(answer: string, evidence: Evidence): string {
  const place = evidence.places.at(-1);
  if (!place || evidence.cities.length === 0) return answer;
  const cities = [...new Set(evidence.cities.map((c) => title(c)))];
  if (cities.some((c) => fold(c) === fold(place))) return answer;
  const where = cities.slice(0, 2).join(" and ") + (cities.length > 2 ? " and other cities" : "");
  const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return answer.replace(new RegExp(`\\bin ${escaped}\\b`, "gi"), `near ${place} (records are in ${where})`);
}

const sourcesLine = /(^|\n)[ \t]*SOURCES:[^\n]*\s*$/;

/**
 * Prompt rule "SOURCES line" in code. When the model named records by address but cited no
 * returned identifier, the records it named become the sources, and the SOURCES line lists
 * their APNs, so an answer about returned records is never uncited.
 */
export function ensureSources(
  answer: string,
  extracted: Source[],
  returned: ReadonlyArray<Source>,
): { answer: string; sources: Source[] } {
  let sources = extracted;
  if (sources.length === 0) {
    const prose = answer.replace(sourcesLine, "").toLowerCase();
    const seen = new Set<string>();
    sources = returned.filter((r) => {
      if (!r.address || seen.has(r.apn) || !prose.includes(r.address.toLowerCase())) return false;
      seen.add(r.apn);
      return true;
    });
  }
  if (sources.length === 0) return { answer, sources };
  const line = `SOURCES: ${[...new Set(sources.map((s) => s.apn))].slice(0, 10).join(", ")}`;
  const current = sourcesLine.exec(answer)?.[0] ?? "";
  const empty = !/SOURCES:\s*\S/.test(current) || /SOURCES:\s*none\b/i.test(current);
  if (current && !empty) return { answer, sources };
  return { answer: `${answer.replace(sourcesLine, "").trimEnd()}\n${line}`, sources };
}
