import type {
  PipelineLead,
  PipelineSearchResponse,
  PipelineSnapshot,
  SearchParamsOutput,
} from "@crm/contracts";

import type { z } from "zod";
import type { PartialSearchParams as PartialSearchParamsSchema } from "@crm/contracts";
type PartialSearchParams = z.infer<typeof PartialSearchParamsSchema>;

export type Signal = "aged_roof" | "open_permit" | "stalled_permit";

export interface ResultRow {
  lead: PipelineLead;
  signals: Set<Signal>;
}

export interface Filters {
  minRoofAgeYears: number;
  permitState: "open" | "expired_unfinaled" | "any";
  minOpenYears: number;
  roofingOnly: boolean;
}

export interface SearchState {
  pin: { lat: number; lon: number };
  radiusMiles: number;
  filters: Filters;
  results: ResultRow[];
  loading: boolean;
  error: string | null;
  snapshot: PipelineSnapshot | null;
  healthError: string | null;
  /** A search hit the fetch limit, so the results are a lower bound. */
  capped: boolean;
  /** Set by applyParams; ProspectPage runs one search and the search actions clear it. */
  pendingSearch: boolean;
}

/** Records fetched per endpoint; a response this long may be truncated. */
export const SEARCH_LIMIT = 200;

export const initialState: SearchState = {
  pin: { lat: 37.3382, lon: -121.8863 },
  radiusMiles: 5,
  filters: {
    minRoofAgeYears: 15,
    // open + expired_unfinaled: stalled permits are the most common signal.
    permitState: "any",
    minOpenYears: 0,
    roofingOnly: true,
  },
  results: [],
  loading: false,
  error: null,
  snapshot: null,
  healthError: null,
  capped: false,
  pendingSearch: false,
};

export type SearchAction =
  | { type: "setPin"; pin: { lat: number; lon: number } }
  | { type: "setRadius"; radiusMiles: number }
  | { type: "setFilters"; filters: Partial<Filters> }
  | { type: "applyParams"; params: PartialSearchParams }
  | { type: "searchStarted" }
  | { type: "searchSucceeded"; aged: PipelineSearchResponse; open: PipelineSearchResponse }
  | { type: "searchFailed"; error: string }
  | { type: "healthLoaded"; snapshot: PipelineSnapshot }
  | { type: "healthFailed"; error: string };

export function mergeResults(
  aged: PipelineSearchResponse,
  open: PipelineSearchResponse,
): ResultRow[] {
  const byApn = new Map<string, ResultRow>();
  for (const lead of aged.items) {
    byApn.set(lead.apn, { lead, signals: new Set<Signal>(["aged_roof"]) });
  }
  for (const lead of open.items) {
    const signal: Signal =
      lead.permitState === "expired_unfinaled" ? "stalled_permit" : "open_permit";
    const existing = byApn.get(lead.apn);
    if (!existing) {
      byApn.set(lead.apn, { lead, signals: new Set<Signal>([signal]) });
      continue;
    }
    // Permit fields come from the open-permit row, roof-age fields from the aged row.
    existing.lead = {
      ...lead,
      roofAgeYears: existing.lead.roofAgeYears,
      roofAgeAnchor: existing.lead.roofAgeAnchor,
      roofAgeConfidence: existing.lead.roofAgeConfidence,
      roofDate: existing.lead.roofDate,
    };
    existing.signals.add(signal);
  }
  return [...byApn.values()];
}

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "setPin":
      return { ...state, pin: action.pin };
    case "setRadius":
      return { ...state, radiusMiles: action.radiusMiles };
    case "setFilters":
      return { ...state, filters: { ...state.filters, ...action.filters } };
    case "applyParams": {
      const { lat, lon, radiusMiles, limit: _limit, ...filters } = action.params;
      return {
        ...state,
        pendingSearch: true,
        pin: lat != null && lon != null ? { lat, lon } : state.pin,
        radiusMiles: radiusMiles ?? state.radiusMiles,
        filters: {
          ...state.filters,
          ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)),
        },
      };
    }
    case "searchStarted":
      return { ...state, loading: true, error: null, pendingSearch: false };
    case "searchSucceeded":
      return {
        ...state,
        loading: false,
        error: null,
        results: mergeResults(action.aged, action.open),
        capped: action.aged.items.length >= SEARCH_LIMIT || action.open.items.length >= SEARCH_LIMIT,
        snapshot: action.aged.snapshot ?? action.open.snapshot,
      };
    case "searchFailed":
      // Keep previous results so a transient failure does not blank the table.
      return { ...state, loading: false, error: action.error, pendingSearch: false };
    case "healthLoaded":
      return { ...state, snapshot: action.snapshot, healthError: null };
    case "healthFailed":
      return { ...state, healthError: action.error };
  }
}

export function toSearchParams(state: SearchState): SearchParamsOutput {
  return {
    lat: state.pin.lat,
    lon: state.pin.lon,
    radiusMiles: state.radiusMiles,
    ...state.filters,
    limit: SEARCH_LIMIT,
  };
}

export function markerColor(row: ResultRow, minRoofAgeYears: number): string {
  const { lead, signals } = row;
  if ((lead.roofAgeYears ?? 0) >= minRoofAgeYears && signals.has("aged_roof")) return "#d32f2f";
  if (signals.has("open_permit")) return "#ed6c02";
  if (signals.has("stalled_permit")) return "#757575";
  return "#1976d2";
}
