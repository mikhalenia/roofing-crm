import { describe, expect, it } from "vitest";
import type { PipelineLead } from "@crm/contracts";
import {
  confidenceLabel,
  daysText,
  displayAnswer,
  durationText,
  formatCount,
  friendlyDate,
  hoverLines,
  humanizeToolCall,
  leadStatusLabel,
  permitStateHint,
  permitStateLabel,
  permitStateText,
  roofAgeText,
  roofBasisLabel,
  signalLabel,
  toolLabel,
} from "./labels";

const lead = (over: Partial<PipelineLead> = {}) =>
  ({ apn: "A1", situsAddress: "1 Main St", lat: 37.3, lon: -121.9, bbbRating: null, distanceMiles: 1,
    provenance: { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" }, ...over }) as PipelineLead;

describe("labels", () => {
  it("names permit states", () => {
    expect(permitStateLabel("open")).toBe("Open");
    expect(permitStateLabel("expired_unfinaled")).toBe("Stalled");
    expect(permitStateLabel("finaled")).toBe("Completed");
    expect(permitStateLabel(null)).toBe("No permit");
    expect(permitStateLabel("weird")).toBe("Unknown state");
    expect(permitStateHint("expired_unfinaled")).toBe("Permit expired without a final inspection or completed approvals");
    expect(permitStateLabel("expired_unfinaled", true)).toBe("Expired (work approved)");
    expect(permitStateLabel("expired_unfinaled", false)).toBe("Stalled");
    expect(permitStateText("expired_unfinaled", null, true)).toBe(
      "Expired (work approved): expired without a final inspection, but all approvals were completed (not counted as stalled)",
    );
    expect(hoverLines(lead({ permitState: "expired_unfinaled", approvalsComplete: true }))[2]).toBe("Expired (work approved)");
    expect(permitStateText("expired_unfinaled")).toBe("Stalled (permit expired without a final inspection)");
    expect(permitStateText("expired_unfinaled", "Stalled (expired without a final inspection)")).toBe("Stalled (expired without a final inspection)");
    expect(roofBasisLabel("final_date", "API basis")).toBe("API basis");
    expect(confidenceLabel("medium", null)).toBe("estimated");
  });

  it("names roof-age basis, confidence, lead status, signals and tools", () => {
    expect(roofBasisLabel("final_date")).toBe("final inspection date");
    expect(roofBasisLabel("approval_complete_issue_date")).toBe("approval completed (issue date)");
    expect(confidenceLabel("high")).toBe("high confidence");
    expect(confidenceLabel("medium")).toBe("estimated");
    expect(["new", "contacted", "qualified", "lost"].map(leadStatusLabel)).toEqual(["New", "Contacted", "Qualified", "Lost"]);
    expect(["aged_roof", "open_permit", "stalled_permit"].map(signalLabel)).toEqual(["Aged roof", "Open permit", "Stalled permit (expired, no approvals)"]);
    expect(
      ["find_aged_roofs", "find_open_roofing_permits", "search_properties_in_radius", "get_property", "geocode_place", "create_lead"].map(toolLabel),
    ).toEqual(["Searched aged roofs", "Searched roofing permits", "Searched properties", "Looked up a property", "Located a place", "Saved a lead"]);
  });

  it("formats numbers, durations and dates", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(durationText(8492)).toBe("23 years, 2 months");
    expect(durationText(400)).toBe("1 year, 1 month");
    expect(durationText(12)).toBe("12 days");
    expect(daysText(8492)).toBe("8,492 days");
    expect(friendlyDate("2026-10-07T00:00:00Z")).toBe("Oct 7, 2026");
    expect(friendlyDate("2026-10-07T17-10-54Z")).toBe("Oct 7, 2026");
    expect(friendlyDate("run-1")).toBeNull();
  });

  it("describes roof age and the hover lines", () => {
    expect(roofAgeText(lead({ roofAgeYears: 22, roofAgeConfidence: "medium", roofAgeAnchor: "approval_complete_issue_date" }))).toBe(
      "Roof 22 yrs, estimated, based on the approval completed (issue date)",
    );
    expect(roofAgeText(lead())).toBe("Roof age unknown");
    expect(hoverLines(lead({ roofAgeYears: 21, roofAgeConfidence: "medium", permitState: "expired_unfinaled", daysOpen: 8492 }))).toEqual([
      "1 Main St",
      "Roof 21 yrs (estimated)",
      "Stalled · open 23 years, 2 months",
    ]);
    expect(hoverLines(lead({ situsAddress: null }))).toEqual(["A1", "Roof age unknown", "No permit"]);
  });

  it("strips the SOURCES line and raw tokens from agent prose", () => {
    expect(displayAnswer("Permit 1 is expired_unfinaled, roof by final_date.\nSOURCES: 47223005, 47223006")).toBe(
      "Permit 1 is expired without a final inspection, roof by final inspection date.",
    );
    expect(displayAnswer("No sources here.")).toBe("No sources here.");
    expect(displayAnswer("Two roofs match.\nSources: County of Santa Clara parcels.")).toBe(
      "Two roofs match.\nSources: County of Santa Clara parcels.",
    );
    expect(displayAnswer("They have expired, unfinaled permits.\nSOURCES: A1")).toBe(
      "They have expired without a final inspection permits.",
    );
  });

  it("humanizes tool calls", () => {
    expect(
      humanizeToolCall({ name: "find_aged_roofs", args: { lat: 37.33821, lon: -121.88634, radiusMiles: 5, minRoofAgeYears: 15 }, resultCount: 200, capped: true }),
    ).toBe("Searched aged roofs · 5 mi around 37.3382, -121.8863, roof at least 15 yrs · at least 200 results");
    expect(humanizeToolCall({ name: "find_open_roofing_permits", args: { lat: 37.3, lon: -121.9, state: "expired_unfinaled", minOpenYears: 3 }, resultCount: 1 })).toBe(
      "Searched roofing permits · 5 mi around 37.3000, -121.9000, open at least 3 yrs, stalled permits · 1 result",
    );
    expect(humanizeToolCall({ name: "geocode_place", args: { name: "Sunnyvale" }, resultCount: 1 })).toBe('Located a place · "Sunnyvale" · 1 result');
    expect(humanizeToolCall({ name: "create_lead", args: { apn: "X" }, resultCount: 0, error: "lead exists" })).toBe("Saved a lead · APN X · failed");
  });
});
