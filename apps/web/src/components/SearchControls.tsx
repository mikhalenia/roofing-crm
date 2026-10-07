import { useState, type ReactNode } from "react";
import { Box, IconButton, Slider, Stack, Switch, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Filters, SearchState } from "../state/search";
import { SegmentedControl } from "./SegmentedControl";

interface Props {
  state: SearchState;
  onRadius: (miles: number) => void;
  onFilters: (f: Partial<Filters>) => void;
  onSearch: () => void;
  onLocation: (pin: { lat: number; lon: number }) => void;
  /** "bar": one wrapping row above the map; "stack": a column (the phone filter sheet). */
  layout?: "bar" | "stack";
}

/** Half the thumb width on each side keeps the thumb inside its box at min and max. */
const INSET = { mx: 1.25, width: "calc(100% - 20px)" };

/** A caption label with the current value right-aligned on the same row. */
function Field({ id, label, value, width, children }: { id: string; label: string; value?: string; width?: number; children: ReactNode }) {
  return (
    <Box sx={{ width: width ?? "100%", flexShrink: 0 }}>
      <Stack sx={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography id={id} variant="caption" sx={{ color: "text.secondary", fontSize: 12, userSelect: "none" }}>{label}</Typography>
        {value && <Typography variant="body2" sx={{ fontWeight: 600, userSelect: "none" }}>{value}</Typography>}
      </Stack>
      {children}
    </Box>
  );
}

export function SearchControls({ state, onRadius, onFilters, onSearch, onLocation, layout = "stack" }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const { filters } = state;
  const bar = layout === "bar";
  const coords = `${state.pin.lat.toFixed(4)}, ${state.pin.lon.toFixed(4)}`;
  const w = (n: number) => (bar ? n : undefined);

  const useMyLocation = () => {
    setNotice(null);
    if (!("geolocation" in navigator)) {
      setNotice("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => onLocation({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setNotice("Location permission denied. Click the map to place the pin instead."),
    );
  };

  return (
    <Box>
      <Stack
        sx={
          bar
            ? { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", columnGap: 3, rowGap: 1.5, px: 2, py: 1.5 }
            : { flexDirection: "column", gap: 2.5, p: 2 }
        }
      >
        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 0.25, flexShrink: 0, pb: bar ? 0.5 : 0 }}>
          <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>Pin: {coords}</Typography>
          <Tooltip title="Copy coordinates">
            <IconButton size="small" aria-label="Copy coordinates" onClick={() => void navigator.clipboard?.writeText(coords)}>
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Use my location">
            <IconButton size="small" color="primary" aria-label="Use my location" onClick={useMyLocation}>
              <MyLocationIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Field id="radius-label" label="Radius" value={`${state.radiusMiles} mi`} {...(bar && { width: 160 })}>
          <Slider
            sx={INSET}
            size={bar ? "small" : "medium"}
            aria-labelledby="radius-label"
            valueLabelDisplay="auto"
            min={0.5}
            max={25}
            step={0.5}
            value={state.radiusMiles}
            onChange={(_, v) => onRadius(v)}
          />
        </Field>
        <Field id="age-label" label="Min roof age" value={`${filters.minRoofAgeYears} yrs`} {...(bar && { width: 160 })}>
          <Slider
            sx={INSET}
            size={bar ? "small" : "medium"}
            aria-labelledby="age-label"
            valueLabelDisplay="auto"
            min={5}
            max={40}
            step={1}
            value={filters.minRoofAgeYears}
            onChange={(_, v) => onFilters({ minRoofAgeYears: v })}
          />
        </Field>
        <Field id="state-label" label="Permit state" {...(bar && { width: 230 })}>
          <Box sx={{ mt: 0.5, pb: bar ? 0.5 : 0 }}>
            <SegmentedControl<Filters["permitState"]>
              name="permit-state"
              label="Permit state"
              value={filters.permitState}
              onChange={(permitState) => onFilters({ permitState })}
              options={[
                { value: "open", label: "Open", hint: "Open = permit still active" },
                { value: "expired_unfinaled", label: "Stalled", hint: "Stalled = expired without a final inspection or completed approvals" },
                { value: "any", label: "Any", hint: "Any = open or stalled" },
              ]}
            />
          </Box>
        </Field>
        <Field id="open-label" label="Min open years" value={String(filters.minOpenYears)} {...(bar && { width: 140 })}>
          <Slider
            sx={INSET}
            size={bar ? "small" : "medium"}
            aria-labelledby="open-label"
            valueLabelDisplay="auto"
            min={0}
            max={20}
            step={1}
            value={filters.minOpenYears}
            onChange={(_, v) => onFilters({ minOpenYears: v })}
          />
        </Field>
        <Stack sx={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 0.5, pb: bar ? 0.5 : 0, width: w(150) }}>
          <Typography id="roofing-label" variant="caption" sx={{ color: "text.secondary", fontSize: 12, whiteSpace: "nowrap" }}>
            Roofing permits only
          </Typography>
          <Switch
            size="small"
            checked={filters.roofingOnly}
            onChange={(e) => onFilters({ roofingOnly: e.target.checked })}
            slotProps={{ input: { "aria-labelledby": "roofing-label" } }}
          />
        </Stack>
        <Box sx={{ pb: bar ? 0.25 : 0, ml: bar ? "auto" : 0 }}>
          <Tooltip title="Searches update automatically; refresh to run the same search again">
            <span>
              <IconButton aria-label="Refresh" onClick={onSearch} disabled={state.loading}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Stack>
      {notice && (
        <Typography variant="caption" component="div" color="warning.main" sx={{ px: 2, pb: 1 }}>
          {notice}
        </Typography>
      )}
    </Box>
  );
}

/** Filters that differ from the defaults, for the phone "Filters (N active)" button. */
export function activeFilterCount(state: SearchState, defaults: { radiusMiles: number; filters: Filters }): number {
  const f = state.filters;
  const d = defaults.filters;
  return [
    state.radiusMiles !== defaults.radiusMiles,
    f.minRoofAgeYears !== d.minRoofAgeYears,
    f.permitState !== d.permitState,
    f.minOpenYears !== d.minOpenYears,
    f.roofingOnly !== d.roofingOnly,
  ].filter(Boolean).length;
}
