import { useState } from "react";
import { Box, Button, Drawer, Link, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { LeadStatus, type LeadRecord, type UpdateLead } from "@crm/contracts";
import { daysText, durationText, leadStatusLabel, permitStateText, roofAgeText } from "../labels";

const MAX_NOTES = 2000;

interface Props {
  lead: LeadRecord | null;
  onClose: () => void;
  /** Resolves true when the PATCH succeeded. */
  onSave: (apn: string, patch: UpdateLead) => Promise<boolean>;
  onShowOnMap: (lead: LeadRecord) => void;
}

/** Right-side editor for one lead's notes and status; Save sends one PATCH. */
export function LeadEditor({ lead, onClose, onSave, onShowOnMap }: Props) {
  return (
    <Drawer
      anchor="right"
      open={lead != null}
      onClose={onClose}
      slotProps={{ paper: { sx: { top: { xs: 56, sm: 64 }, height: { xs: "calc(100% - 56px)", sm: "calc(100% - 64px)" } } } }}
    >
      {lead && <EditorBody key={lead.apn} lead={lead} onClose={onClose} onSave={onSave} onShowOnMap={onShowOnMap} />}
    </Drawer>
  );
}

function EditorBody({ lead, onClose, onSave, onShowOnMap }: Omit<Props, "lead"> & { lead: LeadRecord }) {
  const [notes, setNotes] = useState(lead.notes);
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [saving, setSaving] = useState(false);
  const s = lead.snapshot;
  const label = s.situsAddress ?? lead.apn;

  const save = () => {
    const patch: UpdateLead = {
      ...(notes !== lead.notes && { notes }),
      ...(status !== lead.status && { status }),
    };
    if (Object.keys(patch).length === 0) return onClose();
    setSaving(true);
    void onSave(lead.apn, patch).then((ok) => {
      setSaving(false);
      if (ok) onClose();
    });
  };

  return (
    <Stack spacing={2} sx={{ width: { xs: "100vw", sm: 420 }, p: 2 }} role="dialog" aria-label={`Lead: ${label}`}>
      <Typography variant="h6" component="h2">Lead: {label}</Typography>
      <Box>
        <Typography variant="body2">{roofAgeText(s)}</Typography>
        <Typography variant="body2">
          {s.permitNumber ? `Permit ${s.permitNumber}: ${permitStateText(s.permitState, s.permitStateLabel, s.approvalsComplete)}` : "No permit on record"}
        </Typography>
        {s.daysOpen != null && (
          <Typography variant="body2" title={daysText(s.daysOpen)}>Open {durationText(s.daysOpen)}</Typography>
        )}
        <Link component="button" type="button" variant="body2" onClick={() => onShowOnMap(lead)}>On map</Link>
      </Box>
      <TextField
        select
        size="small"
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as LeadStatus)}
      >
        {LeadStatus.options.map((st) => (
          <MenuItem key={st} value={st}>{leadStatusLabel(st)}</MenuItem>
        ))}
      </TextField>
      <TextField
        label="Notes"
        multiline
        rows={6}
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
        placeholder="Add a note…"
        helperText={`${notes.length}/${MAX_NOTES}`}
        slotProps={{ htmlInput: { maxLength: MAX_NOTES }, formHelperText: { sx: { textAlign: "right" } } }}
      />
      <Stack sx={{ flexDirection: "row", justifyContent: "flex-end", gap: 1 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
      </Stack>
    </Stack>
  );
}
