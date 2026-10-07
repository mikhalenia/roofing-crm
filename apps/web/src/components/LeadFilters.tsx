import { FormControlLabel, Link, MenuItem, Stack, Switch, TextField } from "@mui/material";
import { initialState } from "../state/search";
import { LeadStatus, type LeadFilter } from "@crm/contracts";

export interface LeadFilterValue {
  status: LeadStatus | "";
  minRoofAgeYears: string;
  permitState: "" | "open" | "expired_unfinaled" | "any";
  minOpenYears: string;
  withinRadius: boolean;
}

export const emptyLeadFilter: LeadFilterValue = {
  status: "",
  minRoofAgeYears: "",
  permitState: "",
  minOpenYears: "",
  withinRadius: false,
};

export function toLeadFilter(
  v: LeadFilterValue,
  pin: { lat: number; lon: number } | null,
  radiusMiles: number,
): LeadFilter {
  const f: LeadFilter = {};
  if (v.status) f.status = v.status;
  const age = Number(v.minRoofAgeYears);
  if (v.minRoofAgeYears !== "" && Number.isFinite(age)) f.minRoofAgeYears = age;
  if (v.permitState) f.permitState = v.permitState;
  const open = Number(v.minOpenYears);
  if (v.minOpenYears !== "" && Number.isFinite(open)) f.minOpenYears = open;
  if (v.withinRadius && pin) {
    f.lat = pin.lat;
    f.lon = pin.lon;
    f.radiusMiles = radiusMiles;
  }
  return f;
}

/** "Within 5 mi of the Prospect pin (37.338, -121.886)", or "(default: downtown San José)". */
export function radiusLabel(pin: { lat: number; lon: number }, radiusMiles: number): string {
  const isDefault = pin.lat === initialState.pin.lat && pin.lon === initialState.pin.lon;
  const where = isDefault ? "default: downtown San José" : `${pin.lat.toFixed(3)}, ${pin.lon.toFixed(3)}`;
  return `Within ${radiusMiles} mi of the Prospect pin (${where})`;
}

interface Props {
  value: LeadFilterValue;
  onChange: (v: LeadFilterValue) => void;
  pin: { lat: number; lon: number };
  radiusMiles: number;
  /** Opens the Prospect page to move the pin. */
  onChangeOnMap: () => void;
}

export function LeadFilters({ value, onChange, pin, radiusMiles, onChangeOnMap }: Props) {
  const set = (patch: Partial<LeadFilterValue>) => onChange({ ...value, ...patch });
  return (
    <Stack sx={{ flexDirection: "row", flexWrap: "wrap", gap: 2, alignItems: "center", mb: 2 }}>
      <TextField
        select
        size="small"
        label="Status"
        value={value.status}
        onChange={(e) => set({ status: e.target.value as LeadFilterValue["status"] })}
        sx={{ minWidth: 140 }}
      >
        <MenuItem value="">any</MenuItem>
        {LeadStatus.options.map((s) => (
          <MenuItem key={s} value={s}>{s}</MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        type="number"
        label="Min roof age (yrs)"
        value={value.minRoofAgeYears}
        onChange={(e) => set({ minRoofAgeYears: e.target.value })}
        sx={{ width: 160 }}
      />
      <TextField
        select
        size="small"
        label="Permit state"
        value={value.permitState}
        onChange={(e) => set({ permitState: e.target.value as LeadFilterValue["permitState"] })}
        sx={{ minWidth: 160 }}
      >
        <MenuItem value="">any</MenuItem>
        <MenuItem value="open">Open</MenuItem>
        <MenuItem value="expired_unfinaled">Stalled (expired, no final inspection)</MenuItem>
        <MenuItem value="any">Open or stalled</MenuItem>
      </TextField>
      <TextField
        size="small"
        type="number"
        label="Min open years"
        value={value.minOpenYears}
        onChange={(e) => set({ minOpenYears: e.target.value })}
        sx={{ width: 140 }}
      />
      <FormControlLabel
        control={
          <Switch
            checked={value.withinRadius}
            onChange={(e) => set({ withinRadius: e.target.checked })}
          />
        }
        label={radiusLabel(pin, radiusMiles)}
        sx={{ mr: 0 }}
      />
      <Link component="button" type="button" variant="body2" onClick={onChangeOnMap}>
        Change on map
      </Link>
    </Stack>
  );
}
