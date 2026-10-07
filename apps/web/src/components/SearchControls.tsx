import { useState, type ReactNode } from "react";
import { Box, Button, IconButton, Slider, Stack, Switch, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import type { Filters, SearchState } from "../state/search";
import { SegmentedControl } from "./SegmentedControl";

interface Props {
  state: SearchState;
  onRadius: (miles: number) => void;
  onFilters: (f: Partial<Filters>) => void;
  onSearch: () => void;
  onLocation: (pin: { lat: number; lon: number }) => void;
}

/** Half the thumb width on each side keeps the thumb inside the column at min and max. */
const INSET = { mx: 1.25, width: "calc(100% - 20px)" };

/** A caption label with the current value right-aligned on the same row. */
function Field({ id, label, value, children }: { id: string; label: string; value?: string; children: ReactNode }) {
  return (
    <Box>
      <Stack sx={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography id={id} variant="caption" sx={{ color: "text.secondary", fontSize: 12, userSelect: "none" }}>{label}</Typography>
        {value && <Typography variant="body2" sx={{ fontWeight: 600, userSelect: "none" }}>{value}</Typography>}
      </Stack>
      {children}
    </Box>
  );
}

export function SearchControls({ state, onRadius, onFilters, onSearch, onLocation }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const { filters } = state;
  const coords = `${state.pin.lat.toFixed(4)}, ${state.pin.lon.toFixed(4)}`;

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
    <Stack spacing={2.5} sx={{ p: 2 }}>
      <Box>
        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>Pin: {coords}</Typography>
          <Tooltip title="Copy coordinates">
            <IconButton size="small" aria-label="Copy coordinates" onClick={() => void navigator.clipboard?.writeText(coords)}>
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Button size="small" variant="outlined" startIcon={<MyLocationIcon />} onClick={useMyLocation} sx={{ mt: 0.5 }}>
          Use my location
        </Button>
        {notice && <Typography variant="caption" component="div" color="warning.main" sx={{ mt: 0.5 }}>{notice}</Typography>}
      </Box>

      <Field id="radius-label" label="Radius" value={`${state.radiusMiles} mi`}>
        <Slider
          sx={INSET}
          aria-labelledby="radius-label"
          valueLabelDisplay="auto"
          min={0.5}
          max={25}
          step={0.5}
          value={state.radiusMiles}
          onChange={(_, v) => onRadius(v)}
        />
      </Field>
      <Field id="age-label" label="Min roof age" value={`${filters.minRoofAgeYears} yrs`}>
        <Slider
          sx={INSET}
          aria-labelledby="age-label"
          valueLabelDisplay="auto"
          min={5}
          max={40}
          step={1}
          value={filters.minRoofAgeYears}
          onChange={(_, v) => onFilters({ minRoofAgeYears: v })}
        />
      </Field>
      <Field id="state-label" label="Permit state">
        <Box sx={{ mt: 0.5 }}>
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
      <Field id="open-label" label="Min open years" value={String(filters.minOpenYears)}>
        <Slider
          sx={INSET}
          aria-labelledby="open-label"
          valueLabelDisplay="auto"
          min={0}
          max={20}
          step={1}
          value={filters.minOpenYears}
          onChange={(_, v) => onFilters({ minOpenYears: v })}
        />
      </Field>
      <Stack sx={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Typography id="roofing-label" variant="caption" sx={{ color: "text.secondary", fontSize: 12 }}>
          Roofing permits only
        </Typography>
        <Switch
          size="small"
          checked={filters.roofingOnly}
          onChange={(e) => onFilters({ roofingOnly: e.target.checked })}
          slotProps={{ input: { "aria-labelledby": "roofing-label" } }}
        />
      </Stack>
      <Box>
        <Button variant="outlined" size="small" onClick={onSearch} disabled={state.loading}>
          Refresh
        </Button>
        <Typography variant="caption" component="div" sx={{ color: "text.secondary", mt: 0.5 }}>
          Searches update automatically.
        </Typography>
      </Box>
    </Stack>
  );
}
