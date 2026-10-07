import type { PathOptions } from "leaflet";
import type { Signal } from "../state/search";

export type MarkerKind = Signal | "other";

/** Muted fill with a darker stroke of the same hue; `strong` is the saturated hover/focus fill. */
export const SIGNAL_STYLE: Record<MarkerKind, { fill: string; stroke: string; strong: string; label: string }> = {
  aged_roof: { fill: "#F2B8A2", stroke: "#B8432F", strong: "#D1495B", label: "Aged roof" },
  stalled_permit: { fill: "#C9D6DF", stroke: "#4F6D7A", strong: "#4F6D7A", label: "Stalled permit (expired, no final)" },
  open_permit: { fill: "#F6D58A", stroke: "#B07A12", strong: "#E9A23B", label: "Open permit" },
  other: { fill: "#E3E7EB", stroke: "#7B8794", strong: "#9AA5B1", label: "Other" },
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
  pathOptions: PathOptions;
}

export function markerStyle(signals: ReadonlySet<Signal>, focused: boolean, dense = false): MarkerStyle {
  const kind = markerKind(signals);
  const s = SIGNAL_STYLE[kind];
  const className = `result-marker result-marker--${kind}${focused ? " result-marker--focused" : ""}`;
  if (focused) {
    return {
      radius: 9,
      pathOptions: { className, color: FOCUS_STROKE, weight: 2, fillColor: s.strong, fillOpacity: 0.95 },
    };
  }
  return {
    radius: dense ? 4 : hasBothSignals(signals) ? 6 : 5,
    pathOptions: { className, color: s.stroke, weight: 1.5, fillColor: s.fill, fillOpacity: 0.7 },
  };
}
