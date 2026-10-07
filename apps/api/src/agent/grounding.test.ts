import { describe, expect, it } from "vitest";
import { type Evidence, ensureSources, fixCounts, groundStalled, nearPlace } from "./grounding";

const ev = (over: Partial<Evidence> = {}): Evidence => ({
  places: [],
  cities: [],
  shown: 0,
  stalledShown: 0,
  approvedShown: 0,
  ...over,
});
const allApproved = (n: number) => ev({ shown: n, stalledShown: 0, approvedShown: n });
const aged = { name: "find_aged_roofs", args: {}, resultCount: 200, capped: true, shown: 25 };

describe("fixCounts (c)", () => {
  it("uses the fetched count for 'at least' when capped, never the shown count", () => {
    expect(fixCounts("At least 25 roofs match; showing 25.", [aged])).toBe("At least 200 roofs match; showing 25.");
    expect(fixCounts("at least 200 properties", [aged])).toBe("at least 200 properties");
    expect(fixCounts("roofs at least 15 years old", [aged])).toBe("roofs at least 15 years old");
    expect(fixCounts("at least 25 aged roof properties", [aged])).toBe("at least 200 aged roof properties");
  });
  it("drops 'at least' when nothing was capped", () => {
    expect(fixCounts("At least 3 permits matched.", [{ ...aged, resultCount: 3, capped: false }])).toBe("3 permits matched.");
    expect(fixCounts("At least 5 open roofing permits were found.", [{ ...aged, resultCount: 5, capped: false }])).toBe(
      "5 open roofing permits were found.",
    );
  });
});

describe("groundStalled (a)", () => {
  it("rewrites a positive claim about listed records when every shown record is work-approved", () => {
    expect(groundStalled("These 25 properties have stalled permits.", allApproved(25))).toBe(
      "These 25 properties have permits that expired after all approvals were completed.",
    );
    expect(groundStalled("Stalled permits at 670 10TH ST and 597 ORVIS AV.", allApproved(25))).toBe(
      "Permits that expired after all approvals were completed at 670 10TH ST and 597 ORVIS AV.",
    );
    expect(groundStalled("670 10TH ST is stalled.", allApproved(1))).toBe("670 10TH ST is expired (work approved).");
  });
  it("never rewrites a denial or a zero count", () => {
    for (const text of [
      "I found 0 stalled permits.",
      "None of the permits are stalled.",
      "None of these 25 permits are stalled.",
      "These 25 open permits exclude stalled ones.",
      "The 25 permits aren't stalled.",
      "No stalled permits among the 25.",
    ]) {
      expect(groundStalled(text, allApproved(25))).toBe(text);
    }
  });
  it("leaves general statements, mixed result sets and empty results alone", () => {
    expect(groundStalled("Stalled permits are rare.", allApproved(25))).toBe("Stalled permits are rare.");
    const claim = "These 25 properties have stalled permits.";
    // Some shown records are open: the work-approved wording would be false for them.
    expect(groundStalled(claim, ev({ shown: 25, stalledShown: 0, approvedShown: 20 }))).toBe(claim);
    expect(groundStalled(claim, ev({ shown: 3, stalledShown: 3, approvedShown: 0 }))).toBe(claim);
    expect(groundStalled(claim, ev())).toBe(claim);
  });
});

describe("nearPlace (d)", () => {
  it("says near <place> (records are in <city>) when no record is in the asked place", () => {
    expect(nearPlace("5 open roofing permits in Campbell were found.", ev({ places: ["Campbell"], cities: ["SAN JOSE", "SAN JOSE"] }))).toBe(
      "5 open roofing permits near Campbell (records are in San Jose) were found.",
    );
  });
  it("leaves the answer alone when the records are in the place", () => {
    const text = "Roofs in San José:";
    expect(nearPlace(text, ev({ places: ["San José"], cities: ["SAN JOSE"] }))).toBe(text);
    expect(nearPlace(text, ev({ cities: ["SAN JOSE"] }))).toBe(text);
  });
});

describe("ensureSources (b)", () => {
  const returned = [
    { apn: "A1", address: "1 MAIN ST" },
    { apn: "A2", address: "2 OAK AVE" },
  ];
  it("cites records named by address when the model cited no identifier, and fills the SOURCES line", () => {
    const out = ensureSources("Roofs at 1 Main St and 2 Oak Ave are old.\nSOURCES:", [], returned);
    expect(out.sources.map((s) => s.apn)).toEqual(["A1", "A2"]);
    expect(out.answer).toBe("Roofs at 1 Main St and 2 Oak Ave are old.\nSOURCES: A1, A2");
  });
  it("adds a missing SOURCES line and keeps a non-empty one", () => {
    expect(ensureSources("A1 is old.", [{ apn: "A1" }], returned).answer).toBe("A1 is old.\nSOURCES: A1");
    expect(ensureSources("A1 is old.\nSOURCES: A1", [{ apn: "A1" }], returned).answer).toBe("A1 is old.\nSOURCES: A1");
    expect(ensureSources("Nothing matched.\nSOURCES: none", [], returned)).toEqual({ answer: "Nothing matched.\nSOURCES: none", sources: [] });
  });
  it("matches addresses on word boundaries, case-insensitively", () => {
    const out = ensureSources("The roof at 11 Main St is old.\nSOURCES:", [], returned);
    expect(out.sources).toEqual([]);
    expect(ensureSources("The roof at 1 main st is old.", [], returned).sources.map((s) => s.apn)).toEqual(["A1"]);
  });
  it("adds records named by address to a partial SOURCES line", () => {
    const out = ensureSources("A1 at 1 Main St and also 2 Oak Ave.\nSOURCES: A1, 259", [{ apn: "A1", address: "1 MAIN ST" }], returned);
    expect(out.sources.map((s) => s.apn)).toEqual(["A1", "A2"]);
    expect(out.answer).toBe("A1 at 1 Main St and also 2 Oak Ave.\nSOURCES: A1, A2");
  });
});
