import type { PipelineLead } from "@crm/contracts";

const PERMIT_STATE: Record<string, string> = {
  open: "Open",
  expired_unfinaled: "Stalled (expired, no final inspection)",
  finaled: "Finaled",
};

const ROOF_BASIS: Record<string, string> = {
  final_date: "final inspection date",
  approval_complete_issue_date: "completed-approval issue date",
};

export const roofBasisLabel = (anchor: string | null | undefined) =>
  (anchor && ROOF_BASIS[anchor]) ?? "unknown basis";

export const permitStateLabel = (s: string | null | undefined) => (s ? (PERMIT_STATE[s] ?? s) : "No permit");

export function roofAgeText(l: PipelineLead): string {
  if (l.roofAgeYears == null) return "Roof age unknown";
  const basis = l.roofAgeAnchor ? roofBasisLabel(l.roofAgeAnchor) : null;
  return `Roof ${l.roofAgeYears} yrs${basis ? ` (based on ${basis})` : ""}`;
}

/** One-line hover summary: address, roof age, permit state, days open. */
export function hoverText(l: PipelineLead): string {
  return [
    l.situsAddress ?? l.apn,
    l.roofAgeYears != null ? `roof ${l.roofAgeYears} yrs` : "roof age unknown",
    permitStateLabel(l.permitState),
    l.daysOpen != null ? `${l.daysOpen} days open` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Oct 7, 2026" from an ISO timestamp or a run id like "2026-10-07T17-10-54Z"; null when unparseable. */
export function friendlyDate(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
