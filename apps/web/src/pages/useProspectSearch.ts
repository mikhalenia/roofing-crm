import { useCallback, useEffect, useRef } from "react";
import { SearchParams } from "@crm/contracts";
import { PipelineError, fetchAgedRoofs, fetchHealth, fetchOpenPermits } from "../api/pipeline";
import { searchKey, toSearchParams } from "../state/search";
import { useSearch } from "../state/SearchContext";

/** Pin, radius and filter changes within this window coalesce into one search. */
export const AUTO_SEARCH_DEBOUNCE_MS = 400;

const message = (e: unknown) =>
  e instanceof PipelineError || e instanceof Error ? e.message : "Unknown error";

/**
 * Loads the snapshot banner, searches automatically (debounced) whenever the pin, radius or
 * filters differ from the last search, and returns the search action for "Refresh".
 * Stale responses are ignored.
 */
export function useProspectSearch(): () => void {
  const { state, dispatch } = useSearch();
  const requestId = useRef(0);

  useEffect(() => {
    fetchHealth().then(
      (h) => dispatch({ type: "healthLoaded", snapshot: h.snapshot }),
      (e: unknown) => dispatch({ type: "healthFailed", error: message(e) }),
    );
  }, [dispatch]);

  const search = useCallback(() => {
    const parsed = SearchParams.safeParse(toSearchParams(state));
    if (!parsed.success) {
      dispatch({
        type: "searchFailed",
        error: "Pin must be inside Santa Clara County; click the map to move it",
      });
      return;
    }
    const id = ++requestId.current;
    dispatch({ type: "searchStarted", key: searchKey(state) });
    Promise.all([fetchAgedRoofs(parsed.data), fetchOpenPermits(parsed.data)]).then(
      ([aged, open]) => {
        if (id === requestId.current) dispatch({ type: "searchSucceeded", aged, open });
      },
      (e: unknown) => {
        if (id === requestId.current) dispatch({ type: "searchFailed", error: message(e) });
      },
    );
  }, [state, dispatch]);

  // "Apply to map" on the agent panel queues a search; run it once.
  useEffect(() => {
    if (state.pendingSearch) search();
  }, [state.pendingSearch, search]);

  const key = searchKey(state);
  const latest = useRef(search);
  useEffect(() => {
    latest.current = search;
  });
  // Also runs on the first visit; returning to the page with unchanged parameters does not re-search.
  useEffect(() => {
    if (key === state.lastSearchKey) return;
    const timer = setTimeout(() => latest.current(), AUTO_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, state.lastSearchKey]);

  return search;
}
