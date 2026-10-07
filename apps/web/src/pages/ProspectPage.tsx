import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Box, Paper } from "@mui/material";
import { SearchParams } from "@crm/contracts";
import { PipelineError, fetchAgedRoofs, fetchHealth, fetchOpenPermits } from "../api/pipeline";
import { initialState, searchReducer, toSearchParams } from "../state/search";
import { MapView } from "../components/MapView";
import { PropertyDrawer } from "../components/PropertyDrawer";
import { ResultsTable } from "../components/ResultsTable";
import { SearchControls } from "../components/SearchControls";
import { SnapshotBanner } from "../components/SnapshotBanner";

const message = (e: unknown) =>
  e instanceof PipelineError || e instanceof Error ? e.message : "Unknown error";

export function ProspectPage() {
  const [state, dispatch] = useReducer(searchReducer, initialState);
  const [selected, setSelected] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    fetchHealth().then(
      (h) => dispatch({ type: "healthLoaded", snapshot: h.snapshot }),
      (e: unknown) => dispatch({ type: "healthFailed", error: message(e) }),
    );
  }, []);

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
  }, [state]);

  return (
    <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
      <Paper sx={{ width: { md: 300 }, flexShrink: 0 }}>
        <SearchControls
          state={state}
          onRadius={(radiusMiles) => dispatch({ type: "setRadius", radiusMiles })}
          onFilters={(filters) => dispatch({ type: "setFilters", filters })}
          onSearch={search}
          onLocation={(pin) => dispatch({ type: "setPin", pin })}
        />
      </Paper>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SnapshotBanner snapshot={state.snapshot} healthError={state.healthError} searchError={state.error} />
        <Box sx={{ height: 420, mb: 2 }}>
          <MapView
            pin={state.pin}
            radiusMiles={state.radiusMiles}
            minRoofAgeYears={state.filters.minRoofAgeYears}
            rows={state.results}
            onPin={(pin) => dispatch({ type: "setPin", pin })}
            onSelect={setSelected}
          />
        </Box>
        <Box sx={{ overflowX: "auto" }}>
          <ResultsTable rows={state.results} onSelect={setSelected} selectedApn={selected} />
        </Box>
      </Box>
      <PropertyDrawer apn={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
