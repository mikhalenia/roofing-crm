import { FormControlLabel, MenuItem, Stack, Switch, TextField } from "@mui/material";
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

interface Props {
  value: LeadFilterValue;
  onChange: (v: LeadFilterValue) => void;
}

export function LeadFilters({ value, onChange }: Props) {
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
        <MenuItem value="open">open</MenuItem>
        <MenuItem value="expired_unfinaled">expired_unfinaled</MenuItem>
        <MenuItem value="any">open or expired</MenuItem>
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
        label="Within current radius"
      />
    </Stack>
  );
}
