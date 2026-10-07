import type { PathOptions } from "leaflet";
import type { Signal } from "../state/search";

export type MarkerKind = Signal | "other";

/** Muted fill with a darker stroke of the same hue; `strong` is the saturated hover/focus fill. */
export const SIGNAL_STYLE: Record<MarkerKind, { fill: string; stroke: string; strong: string }> = {
  aged_roof: { fill: "#F2B8A2", stroke: "#B8432F", strong: "#D1495B" },
  stalled_permit: { fill: "#C9D6DF", stroke: "#4F6D7A", strong: "#4F6D7A" },
  open_permit: { fill: "#F6D58A", stroke: "#B07A12", strong: "#E9A23B" },
  other: { fill: "#E3E7EB", stroke: "#7B8794", strong: "#9AA5B1" },
};

/** Above this many markers in view, markers shrink and the caption asks to zoom in. */
export const DENSE_MARKERS = 400;
export const PIN_COLOR = "#1565c0";
const FOCUS_STROKE = "#1f2933";

/** The signal that colors a marker: aged roof, then open permit, then stalled permit. */
export function markerKind(signals: ReadonlySet<Signal>): MarkerKind {
  if (signals.has("aged_roof")) return "aged_roof";
  if (signals.has("open_permit")) return "open_permit";
  if (signals.has("stalled_permit")) return "stalled_permit";
  return "other";
}

export const hasBothSignals = (signals: ReadonlySet<Signal>) =>
  signals.has("aged_roof") && (signals.has("open_permit") || signals.has("stalled_permit"));

export interface MarkerStyle {
  radius: number;
  /**
   * Fixed at creation: react-leaflet applies later pathOptions with setStyle, which ignores
   * className, so it is passed as a CircleMarker prop and does not track focus.
   */
  className: string;
  pathOptions: PathOptions;
}

export function markerStyle(signals: ReadonlySet<Signal>, focused: boolean, dense = false): MarkerStyle {
  const kind = markerKind(signals);
  const s = SIGNAL_STYLE[kind];
  const className = `result-marker result-marker--${kind}`;
  if (focused) {
    return {
      radius: 9,
      className,
      pathOptions: { color: FOCUS_STROKE, weight: 2, fillColor: s.strong, fillOpacity: 0.95 },
    };
  }
  return {
    radius: dense ? 4 : hasBothSignals(signals) ? 6 : 5,
    className,
    pathOptions: { color: s.stroke, weight: 1.5, fillColor: s.fill, fillOpacity: 0.7 },
  };
}

export type TooltipDirection = "top" | "bottom" | "left" | "right";

/** Distance from the top edge, in px, below which a hover card opens downward. */
const TOP_ROOM = 80;
/** Distance from a side edge, in px, within which a hover card opens toward the map center. */
const SIDE_ROOM = 130;

/**
 * Where a marker's hover card goes so it stays inside the map: toward the center near a side
 * edge, below near the top edge, above otherwise.
 */
export function tooltipPlacement(
  point: { x: number; y: number },
  size: { x: number; y: number },
): { direction: TooltipDirection; offset: [number, number] } {
  if (point.x < SIDE_ROOM) return { direction: "right", offset: [8, 0] };
  if (point.x > size.x - SIDE_ROOM) return { direction: "left", offset: [-8, 0] };
  if (point.y < TOP_ROOM) return { direction: "bottom", offset: [0, 8] };
  return { direction: "top", offset: [0, -6] };
}
