import { useEffect, useRef, useState } from "react";
import { Button, IconButton, MenuItem, Select, TableCell, TableRow, TextField } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { LeadStatus, type LeadRecord } from "@crm/contracts";

const DEBOUNCE_MS = 500;

interface Props {
  lead: LeadRecord;
  onStatus: (apn: string, status: LeadStatus) => void;
  onNotes: (apn: string, notes: string) => void;
  onDelete: (lead: LeadRecord) => void;
  onShowOnMap: (lead: LeadRecord) => void;
}

export function LeadRow({ lead, onStatus, onNotes, onDelete, onShowOnMap }: Props) {
  const [notes, setNotes] = useState(lead.notes);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const onNotesRef = useRef(onNotes);
  useEffect(() => {
    onNotesRef.current = onNotes;
  });
  const { apn, snapshot: s } = lead;
  const label = s.situsAddress ?? apn;

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      onNotesRef.current(apn, pending.current);
      pending.current = null;
    }
  };
  // Do not lose an edit made within the debounce window when the row unmounts.
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell>
        <Select
          size="small"
          value={lead.status}
          inputProps={{ "aria-label": `Status for ${label}` }}
          onChange={(e) => onStatus(apn, e.target.value)}
        >
          {LeadStatus.options.map((st) => (
            <MenuItem key={st} value={st}>{st}</MenuItem>
          ))}
        </Select>
      </TableCell>
      <TableCell sx={{ minWidth: 220 }}>
        <TextField
          size="small"
          fullWidth
          value={notes}
          slotProps={{ htmlInput: { "aria-label": `Notes for ${label}` } }}
          onChange={(e) => {
            setNotes(e.target.value);
            pending.current = e.target.value;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, DEBOUNCE_MS);
          }}
        />
      </TableCell>
      <TableCell>{s.roofAgeYears != null ? `${s.roofAgeYears} yrs` : "-"}</TableCell>
      <TableCell>{s.permitState ?? "-"}</TableCell>
      <TableCell>{s.daysOpen ?? "-"}</TableCell>
      <TableCell>{lead.createdAt.slice(0, 10)}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Button size="small" aria-label={`Show ${label} on map`} onClick={() => onShowOnMap(lead)}>
          On map
        </Button>
        <IconButton aria-label={`Delete ${label}`} onClick={() => onDelete(lead)}>
          <DeleteIcon />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}
