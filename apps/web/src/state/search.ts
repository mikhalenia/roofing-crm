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
  /** searchKey() of the last search started; auto-search runs when the current key differs. */
  lastSearchKey: string | null;
  /** A property to show on the map (agent source chip, Leads "On map"); MapView consumes it. */
  focus: Focus | null;
  /** The result hovered in the table or on the map; both highlight it. */
  hoverApn: string | null;
}

export interface Focus {
  apn: string;
  /** Known coordinates, used to pan when the APN is not in the current results. */
  lat?: number | undefined;
  lon?: number | undefined;
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
  lastSearchKey: null,
  focus: null,
  hoverApn: null,
};

export type SearchAction =
  | { type: "setPin"; pin: { lat: number; lon: number } }
  | { type: "setRadius"; radiusMiles: number }
  | { type: "setFilters"; filters: Partial<Filters> }
  | { type: "applyParams"; params: PartialSearchParams }
  | { type: "searchStarted"; key?: string }
  | { type: "focusProperty"; focus: Focus }
  | { type: "focusDone" }
  | { type: "hover"; apn: string | null }
  /** `key` is the searchKey of the request; a response for an older search is dropped. */
  | {
      type: "searchSucceeded";
      aged: PipelineSearchResponse;
      open: PipelineSearchResponse;
      key?: string;
      /** The permit-state filter the request was made with; the shown rows follow it. */
      permitState?: Filters["permitState"];
    }
  | { type: "searchFailed"; error: string; key?: string }
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

/** A response whose search is no longer the latest one started (any mount of the page). */
const isStale = (state: SearchState, key: string | undefined) => key !== undefined && key !== state.lastSearchKey;

/** A permit the pipeline counts as stalled: expired without a final inspection and approvals not all completed. */
export function isStalledPermit(lead: PipelineLead): boolean {
  if (lead.permitState !== "expired_unfinaled") return false;
  return lead.isStalled ?? lead.approvalsComplete !== true;
}

/**
 * The rows the Prospect page shows for a permit-state filter. "Any" keeps every row (aged roofs
 * and permits). "Open" or "Stalled" keep only rows from the permit search whose permit is in that
 * state: an aged roof stays only when its permit matches too, so a work-approved expired permit
 * never appears under "Stalled".
 */
export function visibleResults(rows: ResultRow[], permitState: Filters["permitState"]): ResultRow[] {
  if (permitState === "any") return rows;
  return rows.filter((r) => {
    const fromPermitSearch = r.signals.has("open_permit") || r.signals.has("stalled_permit");
    if (!fromPermitSearch) return false;
    return permitState === "open" ? r.lead.permitState === "open" : isStalledPermit(r.lead);
  });
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
      return {
        ...state,
        loading: true,
        error: null,
        pendingSearch: false,
        lastSearchKey: action.key ?? state.lastSearchKey,
      };
    case "focusProperty":
      return { ...state, focus: action.focus };
    case "focusDone":
      return { ...state, focus: null };
    case "hover":
      return state.hoverApn === action.apn ? state : { ...state, hoverApn: action.apn };
    case "searchSucceeded": {
      if (isStale(state, action.key)) return state;
      const requested = action.permitState ?? state.filters.permitState;
      return {
        ...state,
        loading: false,
        error: null,
        results: visibleResults(mergeResults(action.aged, action.open), requested),
        // With a state filter only permit-search rows are shown, so only that search can be capped.
        capped:
          action.open.items.length >= SEARCH_LIMIT ||
          (requested === "any" && action.aged.items.length >= SEARCH_LIMIT),
        snapshot: action.aged.snapshot ?? action.open.snapshot,
      };
    }
    case "searchFailed":
      if (isStale(state, action.key)) return state;
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

/** Identifies a search by its parameters; auto-search compares it with lastSearchKey. */
export function searchKey(state: SearchState): string {
  return JSON.stringify(toSearchParams(state));
}
