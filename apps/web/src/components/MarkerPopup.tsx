import { Alert, Box, Button, Portal, Snackbar, Stack, Typography } from "@mui/material";
import type { PipelineLead } from "@crm/contracts";
import { daysText, durationText, permitStateText, roofAgeText } from "../labels";
import { useLeadSave } from "./useLeadSave";

interface Props {
  lead: PipelineLead;
  onDetails: (apn: string) => void;
  onAsk: (lead: PipelineLead) => void;
}

/** Content of the map popup for one result: summary plus Details, Save as lead and Ask agent. */
export function MarkerPopup({ lead: l, onDetails, onAsk }: Props) {
  const { isKnown, saving, saved, clearSaved, error, save } = useLeadSave(l.apn);
  const known = isKnown(l.apn);
  const noCoords = !Number.isFinite(l.lat) || !Number.isFinite(l.lon);
  const permit = l.permitNumber
    ? `Permit ${l.permitNumber}: ${permitStateText(l.permitState, l.permitStateLabel)}`
    : "No permit on record";
  return (
    <Box sx={{ minWidth: 240, maxWidth: 300 }} role="dialog" aria-label={`Property ${l.situsAddress ?? l.apn}`}>
      <Typography variant="subtitle2" component="h3">{l.situsAddress ?? l.apn}</Typography>
      <Typography component="div" variant="body2" sx={{ color: "text.secondary", mb: 0.5 }}>
        {l.situsCity ?? "City unknown"}, APN {l.apn}
      </Typography>
      <Typography component="div" variant="body2">{roofAgeText(l)}</Typography>
      <Typography component="div" variant="body2">{permit}</Typography>
      {l.daysOpen != null && (
        <Typography component="div" variant="body2" title={daysText(l.daysOpen)}>
          Open {durationText(l.daysOpen)}
        </Typography>
      )}
      <Typography component="div" variant="body2">Contractor: {l.contractorCompany ?? "unknown"}</Typography>
      <Typography component="div" variant="body2">Owner: {l.ownerName ?? "unknown"}</Typography>
      <Stack sx={{ flexDirection: "row", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
        <Button size="small" variant="outlined" onClick={() => onDetails(l.apn)}>Details</Button>
        <Button
          size="small"
          variant="contained"
          disabled={saving || known || noCoords}
          onClick={() => save(l)}
        >
          {known ? "Already a lead" : "Save as lead"}
        </Button>
        <Button size="small" onClick={() => onAsk(l)}>Ask agent</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {/* Leaflet popups are transformed, which would trap a fixed Snackbar inside the popup. */}
      <Portal>
        <Snackbar open={saved} autoHideDuration={4000} onClose={clearSaved} message="Saved as lead" />
      </Portal>
    </Box>
  );
}
