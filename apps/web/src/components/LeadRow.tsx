import { useEffect, useRef, useState } from "react";
import { Button, IconButton, InputAdornment, MenuItem, Select, TableCell, TableRow, TextField, Tooltip } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
import { LeadStatus, type LeadRecord } from "@crm/contracts";
import { formatCount, friendlyDate, permitStateLabel, shortStateLabel } from "../state/labels";

const DEBOUNCE_MS = 500;
const SAVED_MS = 1500;

interface Props {
  lead: LeadRecord;
  onStatus: (apn: string, status: LeadStatus) => void;
  /** Resolves true when the note was saved. */
  onNotes: (apn: string, notes: string) => Promise<boolean> | void;
  onDelete: (lead: LeadRecord) => void;
  onShowOnMap: (lead: LeadRecord) => void;
}

export function LeadRow({ lead, onStatus, onNotes, onDelete, onShowOnMap }: Props) {
  const [notes, setNotes] = useState(lead.notes);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);
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
      const done = onNotesRef.current(apn, pending.current);
      pending.current = null;
      void done?.then((ok) => {
        if (!ok) return;
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), SAVED_MS);
      });
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
          placeholder="Add a note…"
          slotProps={{
            htmlInput: { "aria-label": `Notes for ${label}` },
            input: {
              endAdornment: saved ? (
                <InputAdornment position="end">
                  <CheckIcon fontSize="small" color="success" aria-label="Note saved" />
                </InputAdornment>
              ) : undefined,
            },
          }}
          onChange={(e) => {
            setNotes(e.target.value);
            pending.current = e.target.value;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, DEBOUNCE_MS);
          }}
        />
      </TableCell>
      <TableCell>{s.roofAgeYears != null ? `${s.roofAgeYears} yrs` : "-"}</TableCell>
      <TableCell>
        {s.permitState ? (
          <Tooltip title={permitStateLabel(s.permitState)}>
            <span>{shortStateLabel(s.permitState)}</span>
          </Tooltip>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell>{s.daysOpen != null ? formatCount(s.daysOpen) : "-"}</TableCell>
      <TableCell>{friendlyDate(lead.createdAt) ?? lead.createdAt}</TableCell>
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
