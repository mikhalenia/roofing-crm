import { describe, expect, it } from "vitest";
import type { PipelineLead } from "@crm/contracts";
import { friendlyDate, hoverText, permitStateLabel, roofAgeText } from "./labels";

const lead = (over: Partial<PipelineLead> = {}) =>
  ({ apn: "A1", situsAddress: "1 Main St", lat: 37.3, lon: -121.9, bbbRating: null, distanceMiles: 1,
    provenance: { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" }, ...over }) as PipelineLead;

describe("labels", () => {
  it("labels permit states", () => {
    expect(permitStateLabel("expired_unfinaled")).toBe("Stalled (expired, no final inspection)");
    expect(permitStateLabel("open")).toBe("Open");
    expect(permitStateLabel("finaled")).toBe("Finaled");
    expect(permitStateLabel(null)).toBe("No permit");
  });
  it("describes roof age with its basis or as unknown", () => {
    expect(roofAgeText(lead({ roofAgeYears: 22, roofAgeAnchor: "final_date" }))).toBe(
      "Roof 22 yrs (based on final inspection date)",
    );
    expect(roofAgeText(lead())).toBe("Roof age unknown");
  });
  it("builds the hover line", () => {
    expect(hoverText(lead({ roofAgeYears: 22, permitState: "open", daysOpen: 300 }))).toBe(
      "1 Main St · roof 22 yrs · Open · 300 days open",
    );
    expect(hoverText(lead({ situsAddress: null }))).toBe("A1 · roof age unknown · No permit");
  });
  it("formats dates for people", () => {
    expect(friendlyDate("2026-10-07T00:00:00Z")).toBe("Oct 7, 2026");
    expect(friendlyDate("2026-10-07T17-10-54Z")).toBe("Oct 7, 2026");
    expect(friendlyDate("2026-10-07 17:10:54.93")).toBe("Oct 7, 2026");
    expect(friendlyDate("run-1")).toBeNull();
    expect(friendlyDate(null)).toBeNull();
  });
});
