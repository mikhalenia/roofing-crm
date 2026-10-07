import { Box, Button, IconButton, MenuItem, Select, TableCell, TableRow, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/EditOutlined";
import { LeadStatus, type LeadRecord } from "@crm/contracts";
import { daysText, durationText, friendlyDate, leadStatusLabel, permitStateHint, permitStateLabel } from "../labels";

const PREVIEW = 60;

interface Props {
  lead: LeadRecord;
  onStatus: (apn: string, status: LeadStatus) => void;
  onEdit: (lead: LeadRecord) => void;
  onDelete: (lead: LeadRecord) => void;
  onShowOnMap: (lead: LeadRecord) => void;
  /** Shows a check next to the note for a moment after it was saved. */
  justSaved?: boolean;
}

export function LeadRow({ lead, onStatus, onEdit, onDelete, onShowOnMap, justSaved = false }: Props) {
  const { apn, snapshot: s } = lead;
  const label = s.situsAddress ?? apn;
  const note = lead.notes.trim();

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
            <MenuItem key={st} value={st}>{leadStatusLabel(st)}</MenuItem>
          ))}
        </Select>
      </TableCell>
      <TableCell sx={{ minWidth: 220, maxWidth: 320 }}>
        <Box
          role="button"
          tabIndex={0}
          aria-label={`Edit notes for ${label}`}
          onClick={() => onEdit(lead)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onEdit(lead);
            }
          }}
          sx={{ display: "flex", alignItems: "center", gap: 0.5, cursor: "pointer", borderRadius: 1, px: 0.5, "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: 2, outlineColor: "primary.main" } }}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: note ? "text.primary" : "text.disabled", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {note ? (note.length > PREVIEW ? `${note.slice(0, PREVIEW)}…` : note) : "Add a note…"}
          </Typography>
          {justSaved ? <CheckIcon fontSize="small" color="success" aria-label="Note saved" /> : <EditIcon fontSize="small" sx={{ color: "action.active" }} />}
        </Box>
      </TableCell>
      <TableCell>{s.roofAgeYears != null ? `${s.roofAgeYears} yrs` : "-"}</TableCell>
      <TableCell>
        {s.permitState ? (
          <Tooltip title={s.permitStateLabel || permitStateHint(s.permitState)}>
            <span>{permitStateLabel(s.permitState)}</span>
          </Tooltip>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell>{s.daysOpen != null ? <span title={daysText(s.daysOpen)}>{durationText(s.daysOpen)}</span> : "-"}</TableCell>
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
