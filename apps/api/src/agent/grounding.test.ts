import { describe, expect, it } from "vitest";
import { type Evidence, ensureSources, fixCounts, groundStalled, nearPlace } from "./grounding";

const ev = (over: Partial<Evidence> = {}): Evidence => ({ places: [], cities: [], shown: 0, stalledShown: 0, ...over });
const aged = { name: "find_aged_roofs", args: {}, resultCount: 200, capped: true, shown: 25 };

describe("fixCounts (c)", () => {
  it("uses the fetched count for 'at least' when capped, never the shown count", () => {
    expect(fixCounts("At least 25 roofs match; showing 25.", [aged])).toBe("At least 200 roofs match; showing 25.");
    expect(fixCounts("at least 200 properties", [aged])).toBe("at least 200 properties");
    expect(fixCounts("roofs at least 15 years old", [aged])).toBe("roofs at least 15 years old");
  });
  it("drops 'at least' when nothing was capped", () => {
    expect(fixCounts("At least 3 permits matched.", [{ ...aged, resultCount: 3, capped: false }])).toBe("3 permits matched.");
  });
});

describe("groundStalled (a)", () => {
  it("rewrites 'stalled' when no shown record is stalled", () => {
    expect(groundStalled("These 25 roofs have stalled permits; one is stalled since 2003.", ev({ shown: 25, stalledShown: 0 }))).toBe(
      "These 25 roofs have permits that expired after all approvals were completed; one is expired (work approved) since 2003.",
    );
  });
  it("keeps 'stalled' when the results contain stalled records, or when nothing was shown", () => {
    const text = "3 stalled permits matched.";
    expect(groundStalled(text, ev({ shown: 3, stalledShown: 3 }))).toBe(text);
    expect(groundStalled(text, ev())).toBe(text);
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
});
