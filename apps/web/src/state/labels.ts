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

export const permitStateLabel = (s: PipelineLead["permitState"]) => (s ? (PERMIT_STATE[s] ?? s) : "No permit");

export function roofAgeText(l: PipelineLead): string {
  if (l.roofAgeYears == null) return "Roof age unknown";
  const basis = l.roofAgeAnchor ? ROOF_BASIS[l.roofAgeAnchor] : null;
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
