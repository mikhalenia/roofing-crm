import { describe, expect, it } from "vitest";
import type { PipelineLead } from "@crm/contracts";
import { formatCount, friendlyDate, hoverLines, shortStateLabel, permitStateLabel, roofAgeText } from "./labels";

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
  it("builds the three hover lines with short state labels and separators", () => {
    expect(
      hoverLines(lead({ roofAgeYears: 21, roofAgeConfidence: "medium", permitState: "expired_unfinaled", daysOpen: 7842 })),
    ).toEqual(["1 Main St", "Roof 21 yrs (medium confidence)", "Stalled · 7,842 days open"]);
    expect(hoverLines(lead({ situsAddress: null }))).toEqual(["A1", "Roof age unknown", "No permit"]);
    expect(formatCount(1234567)).toBe("1,234,567");
  });
  it("has short permit state labels", () => {
    expect(shortStateLabel("expired_unfinaled")).toBe("Stalled");
    expect(shortStateLabel("open")).toBe("Open");
    expect(shortStateLabel("finaled")).toBe("Finaled");
    expect(shortStateLabel(null)).toBe("No permit");
  });
  it("formats dates for people", () => {
    expect(friendlyDate("2026-10-07T00:00:00Z")).toBe("Oct 7, 2026");
    expect(friendlyDate("2026-10-07T17-10-54Z")).toBe("Oct 7, 2026");
    expect(friendlyDate("2026-10-07 17:10:54.93")).toBe("Oct 7, 2026");
    expect(friendlyDate("run-1")).toBeNull();
    expect(friendlyDate(null)).toBeNull();
  });
});
