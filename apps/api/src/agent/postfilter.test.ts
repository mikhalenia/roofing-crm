import { describe, expect, it } from "vitest";
import { extractSources, isDegenerateAnswer, resolvedFiltersFromCalls } from "./postfilter";

const results = [
  { apn: "264-12-034", address: "1 Main St" },
  { apn: "264-12-035", permitNumber: "2019-123456-RS", address: "3 Oak Ave" },
  { apn: "264-12-036" },
];

describe("extractSources", () => {
  it("keeps only identifiers both mentioned and returned", () => {
    const answer =
      "Top picks: 264-12-034 and 999-99-999 (invented).\nSOURCES: 264-12-034, 999-99-999";
    expect(extractSources(answer, results)).toEqual([{ apn: "264-12-034", address: "1 Main St" }]);
  });

  it("dedupes repeated mentions and duplicate tool rows", () => {
    const answer = "264-12-036 appears twice: 264-12-036";
    expect(extractSources(answer, [...results, { apn: "264-12-036" }])).toEqual([
      { apn: "264-12-036" },
    ]);
  });

  it("matches by permit number", () => {
    const answer = "Permit 2019-123456-RS expired without a final inspection.";
    expect(extractSources(answer, results)).toEqual([
      { apn: "264-12-035", permitNumber: "2019-123456-RS", address: "3 Oak Ave" },
    ]);
  });

  it("does not match an apn that is a prefix of a longer token", () => {
    expect(extractSources("264-12-0345", results)).toEqual([]);
  });
});

describe("resolvedFiltersFromCalls", () => {
  it("returns null without a spatial call", () => {
    expect(
      resolvedFiltersFromCalls([{ name: "geocode_place", args: { name: "Cupertino" } }]),
    ).toBeNull();
  });

  it("uses the last spatial call and fills defaults the tool applied", () => {
    const filters = resolvedFiltersFromCalls([
      {
        name: "find_aged_roofs",
        args: { lat: 37.3, lon: -121.9, radiusMiles: 3, minRoofAgeYears: 20 },
      },
      { name: "find_open_roofing_permits", args: { lat: 37.33, lon: -121.88, minOpenYears: 2 } },
      { name: "get_property", args: { apn: "264-12-034" } },
    ]);
    expect(filters).toEqual({
      lat: 37.33,
      lon: -121.88,
      radiusMiles: 5,
      permitState: "any",
      minOpenYears: 2,
    });
  });

  it("returns null when the args fall outside the search bounds", () => {
    expect(
      resolvedFiltersFromCalls([{ name: "find_aged_roofs", args: { lat: 10, lon: 10 } }]),
    ).toBeNull();
  });
});

describe("isDegenerateAnswer", () => {
  it.each([
    ["", true],
    ["   ", true],
    ["SOURCES: 47223005, 25946066", true],
    ["  sources: none", true],
    ["Found some.\nSOURCES: 1", true],
    ["Found some", true],
    ["3 matched within 5 miles. 1 Main St has a 22-year-old roof.\nSOURCES: 1", false],
    ["3 matched! Roof ages run 20 to 30 years.", false],
  ])("%j -> %s", (text, expected) => {
    expect(isDegenerateAnswer(text)).toBe(expected);
  });

  it("sets permitState any for aged-roof or radius results without a permit search", () => {
    expect(resolvedFiltersFromCalls([{ name: "find_aged_roofs", args: { lat: 37.3, lon: -121.9 } }])).toMatchObject({
      permitState: "any",
      minRoofAgeYears: 15,
    });
    expect(
      resolvedFiltersFromCalls([{ name: "search_properties_in_radius", args: { lat: 37.3, lon: -121.9, radiusMiles: 2 } }]),
    ).toMatchObject({ permitState: "any", radiusMiles: 2 });
  });

  it("keeps the permit search's state when aged roofs were searched last", () => {
    expect(
      resolvedFiltersFromCalls([
        { name: "find_open_roofing_permits", args: { lat: 37.3, lon: -121.9, state: "expired_unfinaled" } },
        { name: "find_aged_roofs", args: { lat: 37.3, lon: -121.9 } },
      ]),
    ).toMatchObject({ permitState: "expired_unfinaled" });
  });
});
