import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { haversineMiles, type PipelineLead } from "@crm/contracts";
import { CrmError, createLead } from "../api/crm";
import { errorText } from "../api/errors";
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

// Fallback when the drawer was opened without a search-result row (e.g. from the agent).
function leadFromDetail(
  d: PropertyDetail,
  pin: { lat: number; lon: number } | undefined,
): PipelineLead | null {
  const p = d.property;
  if (p.lat == null || p.lon == null) return null;
  const permit = d.permits.find((pm) => pm.permitState !== "finaled") ?? d.permits[0];
  const ra = d.roofAge;
  const anchor = ra?.anchor === "final_date" || ra?.anchor === "approval_complete_issue_date" ? ra.anchor : null;
  const conf = ra?.confidence === "high" || ra?.confidence === "medium" ? ra.confidence : null;
  const state = permit?.permitState;
  return {
    apn: p.apn,
    situsAddress: p.situsAddress ?? null,
    situsCity: p.situsCity ?? null,
    situsZip: p.situsZip ?? null,
    lat: p.lat,
    lon: p.lon,
    roofAgeYears: ra?.roofAgeYears ?? null,
    roofAgeAnchor: anchor,
    roofAgeConfidence: conf,
    roofDate: ra?.roofDate ?? null,
    permitNumber: permit?.permitNumber ?? null,
    permitState: state === "open" || state === "expired_unfinaled" || state === "finaled" ? state : null,
    daysOpen: permit?.daysOpen ?? null,
    workDescription: permit?.workDescription ?? null,
    contractorCompany: permit?.contractorCompany ?? null,
    bbbRating: null,
    distanceMiles: pin ? haversineMiles(pin, { lat: p.lat, lon: p.lon }) : 0,
    provenance: {
      propertySourceUrl: p.sourceUrl ?? "",
      propertySourceVersion: p.sourceVersion ?? "",
      fetchedAt: p.fetchedAt ?? "",
    },
  };
}

const dash = (v: unknown) => (v == null || v === "" ? "-" : String(v));

export function PropertyDrawer({
  apn,
  snapshot,
  pin,
  onClose,
}: {
  apn: string | null;
  snapshot?: PipelineLead | undefined;
  pin?: { lat: number; lon: number } | undefined;
  onClose: () => void;
}) {
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const markKnown = (a: string) => setKnown((k) => new Set([...k, a]));
  const save = (detail: PropertyDetail) => {
    const target = detail.property.apn;
    const lead = snapshot?.apn === target ? snapshot : leadFromDetail(detail, pin);
    if (!lead) return;
    setSaving(true);
    setSaveError(null);
    createLead({ apn: target, snapshot: lead }).then(
      () => {
        markKnown(target);
        setToast(true);
        setSaving(false);
      },
      (e: unknown) => {
        setSaving(false);
        if (e instanceof CrmError && e.status === 409) markKnown(target);
        else setSaveError(errorText(e, "Failed to save lead"));
      },
    );
  };

  // Ignore a result that belongs to a previously selected property.
  const current = result?.apn === apn ? result : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;

  const p = detail?.property;
  const noCoords = p != null && snapshot?.apn !== p.apn && (p.lat == null || p.lon == null);
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
            <Tooltip title={noCoords ? "No coordinates for this property" : ""}>
              <span>
                <Button
                  variant="contained"
                  disabled={saving || known.has(p.apn) || noCoords}
                  onClick={() => save(detail)}
                  sx={{ my: 1 }}
                >
                  {known.has(p.apn) ? "Already a lead" : "Save as lead"}
                </Button>
              </span>
            </Tooltip>
            {saveError && <Alert severity="error">{saveError}</Alert>}
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
      <Snackbar open={toast} autoHideDuration={4000} onClose={() => setToast(false)} message="Saved as lead" />
    </Drawer>
  );
}
