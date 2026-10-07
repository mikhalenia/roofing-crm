import { describe, expect, it } from "vitest";
import type { Signal } from "../state/search";
import { markerKind, markerStyle, tooltipPlacement } from "./mapStyle";

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
    expect(s.className).toBe(`result-marker result-marker--${kind}`);
    expect(s.pathOptions.className).toBeUndefined();
  });

  it("focused markers are larger with a saturated fill and a dark stroke", () => {
    const s = markerStyle(set("aged_roof"), true);
    expect(s.radius).toBe(9);
    expect(s.pathOptions).toMatchObject({ fillColor: "#D1495B", color: "#1f2933", weight: 2 });
    expect(markerStyle(set("open_permit"), true).pathOptions.fillColor).toBe("#E9A23B");
    expect(markerStyle(set("stalled_permit"), true).pathOptions.fillColor).toBe("#4F6D7A");
  });

  it("dense views shrink unfocused markers to radius 4", () => {
    expect(markerStyle(set("aged_roof", "open_permit"), false, true).radius).toBe(4);
    expect(markerStyle(set("aged_roof"), true, true).radius).toBe(9);
  });
});

describe("tooltipPlacement", () => {
  const size = { x: 680, y: 420 };
  it("keeps the hover card inside the map", () => {
    expect(tooltipPlacement({ x: 340, y: 8 }, size)).toEqual({ direction: "bottom", offset: [0, 8] });
    expect(tooltipPlacement({ x: 8, y: 200 }, size)).toEqual({ direction: "right", offset: [8, 0] });
    expect(tooltipPlacement({ x: 672, y: 200 }, size)).toEqual({ direction: "left", offset: [-8, 0] });
    expect(tooltipPlacement({ x: 340, y: 200 }, size)).toEqual({ direction: "top", offset: [0, -6] });
    expect(tooltipPlacement({ x: 8, y: 8 }, size)).toEqual({ direction: "right", offset: [8, 34] });
    // Near the bottom edge a side card moves up so it is not cut off.
    expect(tooltipPlacement({ x: 672, y: 398 }, size)).toEqual({ direction: "left", offset: [-8, -40] });
  });
});
