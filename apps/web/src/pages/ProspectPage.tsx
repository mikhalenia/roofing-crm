import { useCallback, useMemo, useState } from "react";
import { Box, Drawer, Paper, useMediaQuery, useTheme } from "@mui/material";
import { useAgent } from "../state/AgentContext";
import { useSearch } from "../state/SearchContext";
import { AgentPanel } from "../components/AgentPanel";
import { MapCard } from "../components/MapCard";
import { hasBothSignals } from "../components/mapStyle";
import { MapView } from "../components/MapView";
import { PropertyDrawer } from "../components/PropertyDrawer";
import { ResultsTable } from "../components/ResultsTable";
import { SearchControls } from "../components/SearchControls";
import { SnapshotBanner } from "../components/SnapshotBanner";
import { useProspectSearch } from "./useProspectSearch";

const AGENT_WIDTH = 380;

export function ProspectPage() {
  const { state, dispatch } = useSearch();
  const { agent, setOpen, askAbout } = useAgent();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const [selected, setSelected] = useState<string | null>(null);
  const search = useProspectSearch();
  const [inView, setInView] = useState(0);
  const matching = useMemo(() => state.results.filter((r) => hasBothSignals(r.signals)).length, [state.results]);

  const hover = useCallback((apn: string | null) => dispatch({ type: "hover", apn }), [dispatch]);
  const onPin = useCallback((pin: { lat: number; lon: number }) => dispatch({ type: "setPin", pin }), [dispatch]);
  const panel = <AgentPanel embedded onClose={() => setOpen(false)} />;
  const focus = state.focus;
  return (
    <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
      <Paper sx={{ width: { md: 300 }, flexShrink: 0 }}>
        <SearchControls
          state={state}
          onRadius={(radiusMiles) => dispatch({ type: "setRadius", radiusMiles })}
          onFilters={(filters) => dispatch({ type: "setFilters", filters })}
          onSearch={search}
          onLocation={onPin}
        />
      </Paper>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SnapshotBanner snapshot={state.snapshot} healthError={state.healthError} searchError={state.error} />
        <MapCard
          radiusMiles={state.radiusMiles}
          pin={state.pin}
          total={state.results.length}
          capped={state.capped}
          matching={matching}
          inView={inView}
          loading={state.loading}
          agentOpen={agent.open}
          onToggleAgent={() => setOpen(!agent.open)}
        >
          <MapView
            pin={state.pin}
            radiusMiles={state.radiusMiles}
            rows={state.results}
            onPin={onPin}
            onSelect={setSelected}
            onAsk={askAbout}
            focus={focus}
            hoverApn={state.hoverApn}
            onHover={hover}
            onFocusDone={(found) => {
              if (!found && focus) setSelected(focus.apn);
              dispatch({ type: "focusDone" });
            }}
            onViewCount={setInView}
          />
        </MapCard>
        <Box sx={{ overflowX: "auto" }}>
          <ResultsTable
            rows={state.results}
            capped={state.capped}
            onSelect={setSelected}
            selectedApn={selected}
            hoverApn={state.hoverApn}
            onHover={hover}
          />
        </Box>
      </Box>
      {wide && agent.open && (
        <Paper
          sx={{ width: AGENT_WIDTH, flexShrink: 0, p: 2, alignSelf: "flex-start", position: "sticky", top: 80, maxHeight: "calc(100vh - 96px)", overflowY: "auto" }}
        >
          {panel}
        </Paper>
      )}
      {!wide && (
        <Drawer anchor="right" open={agent.open} onClose={() => setOpen(false)}>
          <Box sx={{ width: { xs: "100vw", sm: AGENT_WIDTH }, p: 2 }}>{panel}</Box>
        </Drawer>
      )}
      <PropertyDrawer apn={selected} snapshot={state.results.find((r) => r.lead.apn === selected)?.lead} onClose={() => setSelected(null)} />
    </Box>
  );
}
