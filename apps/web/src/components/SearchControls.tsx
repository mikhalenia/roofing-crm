import { useState } from "react";
import {
  Button,
  FormControlLabel,
  Slider,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { Filters, SearchState } from "../state/search";

interface Props {
  state: SearchState;
  onRadius: (miles: number) => void;
  onFilters: (f: Partial<Filters>) => void;
  onSearch: () => void;
  onLocation: (pin: { lat: number; lon: number }) => void;
}

export function SearchControls({ state, onRadius, onFilters, onSearch, onLocation }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const { filters } = state;

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
    <Stack spacing={1.5} sx={{ p: 2 }}>
      <Typography variant="subtitle2">
        Pin: {state.pin.lat.toFixed(4)}, {state.pin.lon.toFixed(4)}
      </Typography>
      <Button size="small" onClick={useMyLocation}>
        Use my location
      </Button>
      {notice && <Typography variant="caption" color="warning.main">{notice}</Typography>}

      <div>
        <Typography id="radius-label" variant="body2">Radius: {state.radiusMiles} mi</Typography>
        <Slider
          aria-labelledby="radius-label"
          min={0.5}
          max={25}
          step={0.5}
          value={state.radiusMiles}
          onChange={(_, v) => onRadius(v)}
        />
      </div>
      <div>
        <Typography id="age-label" variant="body2">Min roof age: {filters.minRoofAgeYears} yrs</Typography>
        <Slider
          aria-labelledby="age-label"
          min={5}
          max={40}
          step={1}
          value={filters.minRoofAgeYears}
          onChange={(_, v) => onFilters({ minRoofAgeYears: v })}
        />
      </div>
      <div>
        <Typography variant="body2">Permit state</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={filters.permitState}
          onChange={(_, v: Filters["permitState"] | null) => v && onFilters({ permitState: v })}
        >
          <ToggleButton value="open">Open</ToggleButton>
          <ToggleButton value="expired_unfinaled">Stalled expired</ToggleButton>
          <ToggleButton value="any">Any</ToggleButton>
        </ToggleButtonGroup>
      </div>
      <div>
        <Typography id="open-label" variant="body2">Min open years: {filters.minOpenYears}</Typography>
        <Slider
          aria-labelledby="open-label"
          min={0}
          max={20}
          step={1}
          value={filters.minOpenYears}
          onChange={(_, v) => onFilters({ minOpenYears: v })}
        />
      </div>
      <FormControlLabel
        control={
          <Switch
            checked={filters.roofingOnly}
            onChange={(e) => onFilters({ roofingOnly: e.target.checked })}
          />
        }
        label="Roofing permits only"
      />
      <Button variant="contained" onClick={onSearch} disabled={state.loading}>
        {state.loading ? "Searching…" : "Search"}
      </Button>
    </Stack>
  );
}
