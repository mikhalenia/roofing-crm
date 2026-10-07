import { useCallback, useEffect, useRef } from "react";
import { SearchParams } from "@crm/contracts";
import { PipelineError, fetchAgedRoofs, fetchHealth, fetchOpenPermits } from "../api/pipeline";
import { toSearchParams } from "../state/search";
import { useSearch } from "../state/SearchContext";

const message = (e: unknown) =>
  e instanceof PipelineError || e instanceof Error ? e.message : "Unknown error";

/** Loads the snapshot banner and returns the search action; stale responses are ignored. */
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
    dispatch({ type: "searchStarted" });
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

  return search;
}
