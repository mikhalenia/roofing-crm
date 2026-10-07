import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { LeadRecord, LeadStatus, UpdateLead } from "@crm/contracts";
import { deleteLead, listLeads, updateLead } from "../api/crm";
import { errorText } from "../api/errors";
import { LeadFilters, emptyLeadFilter, toLeadFilter } from "../components/LeadFilters";
import { LeadRow } from "../components/LeadRow";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../state/SearchContext";

export function LeadsPage() {
  const { state, dispatch } = useSearch();
  const navigate = useNavigate();
  const [value, setValue] = useState(emptyLeadFilter);
  const [leads, setLeads] = useState<LeadRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<LeadRecord | null>(null);
  const requestId = useRef(0);

  const { pin, radiusMiles } = state;
  const load = useCallback(() => {
    const id = ++requestId.current;
    listLeads(toLeadFilter(value, pin, radiusMiles)).then(
      (list) => {
        if (id !== requestId.current) return;
        setLeads(list);
        setError(null);
      },
      (e: unknown) => {
        if (id === requestId.current) setError(errorText(e));
      },
    );
  }, [value, pin, radiusMiles]);

  useEffect(load, [load]);

  /** Resolves true when the PATCH succeeded. */
  const patch = (apn: string, body: UpdateLead) =>
    updateLead(apn, body).then(
      () => {
        load();
        return true;
      },
      (e: unknown) => {
        setError(errorText(e));
        return false;
      },
    );

  const confirmDelete = () => {
    const lead = toDelete;
    setToDelete(null);
    if (!lead) return;
    deleteLead(lead.apn).then(load, (e: unknown) => setError(errorText(e)));
  };

  return (
    <>
      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>Leads</Typography>
      <LeadFilters value={value} onChange={setValue} pin={pin} radiusMiles={radiusMiles} onChangeOnMap={() => navigate("/")} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {leads && leads.length === 0 && (
        <Typography>No leads yet. Save properties from the Prospect page or ask the agent.</Typography>
      )}
      {leads && leads.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Address</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell>Roof age</TableCell>
              <TableCell>Permit state</TableCell>
              <TableCell>Days open</TableCell>
              <TableCell>Created</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {leads.map((l) => (
              <LeadRow
                key={l.apn}
                lead={l}
                onStatus={(apn, status: LeadStatus) => void patch(apn, { status })}
                onNotes={(apn, notes) => patch(apn, { notes })}
                onDelete={setToDelete}
                onShowOnMap={(l) => {
                  // The pin stays; the map pans to the lead and opens its popup or drawer.
                  dispatch({ type: "focusProperty", focus: { apn: l.apn, lat: l.snapshot.lat, lon: l.snapshot.lon } });
                  navigate("/");
                }}
              />
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={toDelete != null} onClose={() => setToDelete(null)}>
        <DialogTitle>Delete lead?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete the lead for {toDelete?.snapshot.situsAddress ?? toDelete?.apn}? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button color="error" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
