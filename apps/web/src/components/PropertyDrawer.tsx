import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { PipelineError, fetchProperty, type PropertyDetail } from "../api/pipeline";
import { ProvenanceChip } from "./ProvenanceChip";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
      {children}
    </Box>
  );
}

const dash = (v: unknown) => (v == null || v === "" ? "-" : String(v));

export function PropertyDrawer({ apn, onClose }: { apn: string | null; onClose: () => void }) {
  const [result, setResult] = useState<{
    apn: string;
    detail: PropertyDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!apn) return;
    let cancelled = false;
    fetchProperty(apn).then(
      (detail) => !cancelled && setResult({ apn, detail, error: null }),
      (e: unknown) =>
        !cancelled &&
        setResult({
          apn,
          detail: null,
          error: e instanceof PipelineError ? e.message : "Failed to load property",
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [apn]);

  // Ignore a result that belongs to a previously selected property.
  const current = result?.apn === apn ? result : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;

  const p = detail?.property;
  return (
    <Drawer anchor="right" open={apn != null} onClose={onClose}>
      <Box sx={{ width: { xs: "100vw", sm: 440 }, p: 2 }} role="complementary" aria-label="Property details">
        <Stack sx={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6">{p?.situsAddress ?? apn}</Typography>
          <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
        </Stack>
        {!detail && !error && <CircularProgress size={24} />}
        {error && <Alert severity="error">{error}</Alert>}
        {detail && p && (
          <>
            <Tooltip title="Available after leads API">
              <span>
                <Button variant="contained" disabled sx={{ my: 1 }}>Save as lead</Button>
              </span>
            </Tooltip>
            <Section title="Property">
              <Typography variant="body2">APN {p.apn}</Typography>
              <Typography variant="body2">
                {dash(p.situsAddress)}, {dash(p.situsCity)} {p.situsZip ?? ""}
              </Typography>
              <Typography variant="body2">Jurisdiction: {dash(p.jurisdiction)}</Typography>
            </Section>
            <Section title="Roof age basis">
              {detail.roofAge ? (
                <Typography variant="body2">
                  {dash(detail.roofAge.roofAgeYears)} yrs (roof date {dash(detail.roofAge.roofDate)}) based on{" "}
                  {dash(detail.roofAge.anchor)}, {dash(detail.roofAge.confidence)} confidence, permit{" "}
                  {dash(detail.roofAge.permitNumber)}
                </Typography>
              ) : (
                <Typography variant="body2">No roof age on record.</Typography>
              )}
            </Section>
            <Section title="Permits">
              {detail.permits.length === 0 && <Typography variant="body2">None.</Typography>}
              {detail.permits.map((pm) => (
                <Typography key={pm.permitNumber} variant="body2">
                  {pm.permitNumber} · {dash(pm.permitState)} · issued {dash(pm.issueDate)} · final{" "}
                  {dash(pm.finalDate)} · {dash(pm.daysOpen)} days open · {dash(pm.workDescription)}
                </Typography>
              ))}
            </Section>
            <Section title="Contractor">
              {detail.contractors.length === 0 && <Typography variant="body2">None on record.</Typography>}
              {detail.contractors.map((c, i) => (
                <Typography key={c.contractorId ?? i} variant="body2">
                  {dash(c.companyName)} · CSLB {dash(c.cslbLicenseNumber)} ({dash(c.cslbStatus)}) · BBB: not
                  available (no public source)
                </Typography>
              ))}
            </Section>
            <Section title="Owners">
              {detail.owners.length === 0 && <Typography variant="body2">None observed.</Typography>}
              {detail.owners.map((o, i) => (
                <Typography key={i} variant="body2">
                  {dash(o.ownerName)} · observed {dash(o.observedOn)} (permit {dash(o.permitNumber)})
                </Typography>
              ))}
            </Section>
            <Divider sx={{ mb: 1 }} />
            <Section title="Provenance">
              <Stack sx={{ flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
                <ProvenanceChip label="Property source" url={p.sourceUrl} version={p.sourceVersion} fetchedAt={p.fetchedAt} />
                {detail.permits.map((pm) => (
                  <ProvenanceChip key={pm.permitNumber} label={`Permit ${pm.permitNumber}`} url={pm.sourceUrl} version={pm.sourceVersion} fetchedAt={pm.fetchedAt} />
                ))}
              </Stack>
              <Typography variant="caption" component="div">
                Source: {dash(p.sourceUrl)} · version {dash(p.sourceVersion)} · fetched {dash(p.fetchedAt)} ·
                manifest CID {dash(detail.snapshot.manifestCid)}
              </Typography>
            </Section>
          </>
        )}
      </Box>
    </Drawer>
  );
}
