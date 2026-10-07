import { describe, expect, it } from "vitest";
import type { Signal } from "../state/search";
import { markerKind, markerStyle } from "./mapStyle";

const set = (...s: Signal[]) => new Set<Signal>(s);

describe("markerStyle", () => {
  it.each([
    [set("aged_roof"), "aged_roof", "#F2B8A2", "#B8432F", 5],
    [set("stalled_permit"), "stalled_permit", "#C9D6DF", "#4F6D7A", 5],
    [set("open_permit"), "open_permit", "#F6D58A", "#B07A12", 5],
    [set(), "other", "#E3E7EB", "#7B8794", 5],
    [set("aged_roof", "stalled_permit"), "aged_roof", "#F2B8A2", "#B8432F", 6],
    [set("aged_roof", "open_permit"), "aged_roof", "#F2B8A2", "#B8432F", 6],
    [set("open_permit", "stalled_permit"), "open_permit", "#F6D58A", "#B07A12", 5],
  ])("%s -> %s", (signals, kind, fill, stroke, radius) => {
    expect(markerKind(signals)).toBe(kind);
    const s = markerStyle(signals, false);
    expect(s.radius).toBe(radius);
    expect(s.pathOptions).toMatchObject({ fillColor: fill, color: stroke, weight: 1.5, fillOpacity: 0.7 });
    expect(s.pathOptions.className).toBe(`result-marker result-marker--${kind}`);
  });

  it("focused markers are larger with a saturated fill and a dark stroke", () => {
    const s = markerStyle(set("aged_roof"), true);
    expect(s.radius).toBe(9);
    expect(s.pathOptions).toMatchObject({ fillColor: "#D1495B", color: "#1f2933", weight: 2 });
    expect(s.pathOptions.className).toContain("result-marker--focused");
    expect(markerStyle(set("open_permit"), true).pathOptions.fillColor).toBe("#E9A23B");
    expect(markerStyle(set("stalled_permit"), true).pathOptions.fillColor).toBe("#4F6D7A");
  });

  it("dense views shrink unfocused markers to radius 4", () => {
    expect(markerStyle(set("aged_roof", "open_permit"), false, true).radius).toBe(4);
    expect(markerStyle(set("aged_roof"), true, true).radius).toBe(9);
  });
});
