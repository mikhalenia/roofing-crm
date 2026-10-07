import type { ReactNode } from "react";
import { Box, Button, Chip, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { formatCount } from "../labels";
import { SEARCH_LIMIT } from "../state/search";
import { DENSE_MARKERS } from "./mapStyle";
import { MapLegend } from "./MapLegend";

interface Props {
  radiusMiles: number;
  pin: { lat: number; lon: number };
  /** Properties returned for this radius. */
  total: number;
  /** A search hit the fetch limit, so `total` is a lower bound. */
  capped: boolean;
  /** The permit-state filter; "open" and "expired_unfinaled" switch the caption to permit wording. */
  permitState?: "open" | "expired_unfinaled" | "any";
  /** Result markers inside the visible map bounds. */
  inView: number;
  loading: boolean;
  agentOpen: boolean;
  onToggleAgent: () => void;
  children: ReactNode;
}

const STATE_NOUN: Record<string, [string, string]> = {
  open: ["open permit", "open permits"],
  expired_unfinaled: ["stalled permit", "stalled permits"],
};

/** What the map shows and, when a search hit its fetch limit, that more match. */
export function statusCaption({
  total,
  capped,
  inView,
  permitState = "any",
}: Pick<Props, "total" | "capped" | "inView" | "permitState">): string {
  const noun = STATE_NOUN[permitState];
  const count = formatCount(total);
  const shown = noun
    ? `${count} ${total === 1 ? noun[0] : noun[1]} shown${capped ? ` · each search returns at most ${SEARCH_LIMIT} records per signal, so more match in this radius` : " in this radius"}`
    : capped
      ? `${count} properties shown · each search returns at most ${SEARCH_LIMIT} records per signal, so more match in this radius`
      : `${count} matching ${total === 1 ? "property" : "properties"} in this radius`;
  return inView > DENSE_MARKERS ? `${shown} · ${formatCount(inView)} markers in view, zoom in for detail` : shown;
}

/** The map framed as a card: title, radius chip, agent toggle, legend and a status caption. */
export function MapCard(props: Props) {
  const { radiusMiles, pin, loading, agentOpen, onToggleAgent, children } = props;
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }} component="section" aria-label="Map">
      <Stack sx={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
        <Box>
          <Typography variant="overline" component="div" sx={{ color: "text.secondary", lineHeight: 1.6 }}>
            Map
          </Typography>
          <Typography variant="h6" component="h2" sx={{ lineHeight: 1.2 }}>Santa Clara County</Typography>
        </Box>
        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
          <Chip size="small" label={`${radiusMiles}-mile radius`} />
          <Button
            size="small"
            variant={agentOpen ? "contained" : "outlined"}
            aria-pressed={agentOpen}
            onClick={onToggleAgent}
          >
            Agent
          </Button>
        </Stack>
      </Stack>
      <Box sx={{ height: 4 }}>{loading && <LinearProgress aria-label="Searching" />}</Box>
      <Box sx={{ position: "relative", height: 420, borderRadius: 1.5, overflow: "hidden" }}>
        {children}
      </Box>
      <Box sx={{ mt: 1 }}>
        <MapLegend />
      </Box>
      <Typography variant="body2" sx={{ mt: 0.75 }} data-testid="map-status">
        {statusCaption(props)}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Search center: {pin.lat.toFixed(4)}, {pin.lon.toFixed(4)} (click the map or drag the pin to move it)
      </Typography>
    </Paper>
  );
}
