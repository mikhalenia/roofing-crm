import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Link,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { haversineMiles, type PipelineLead } from "@crm/contracts";
import { PipelineError, fetchProperty, type PropertyDetail } from "../api/pipeline";
import { permitStateLabel, roofBasisLabel } from "../state/labels";
import { ProvenanceChip } from "./ProvenanceChip";
import { useLeadSave } from "./useLeadSave";

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
  onAsk,
}: {
  apn: string | null;
  snapshot?: PipelineLead | undefined;
  pin?: { lat: number; lon: number } | undefined;
  onClose: () => void;
  /** Shows "Ask agent" in the header. */
  onAsk?: ((lead: Pick<PipelineLead, "apn" | "situsAddress">) => void) | undefined;
}) {
  const { isKnown, saving, saved, clearSaved, error: saveError, save: saveLead } = useLeadSave(apn);

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

  const save = (detail: PropertyDetail) => {
    const target = detail.property.apn;
    saveLead(snapshot?.apn === target ? snapshot : leadFromDetail(detail, pin));
  };

  // Ignore a result that belongs to a previously selected property.
  const current = result?.apn === apn ? result : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;

  const p = detail?.property;
  const noCoords = p != null && snapshot?.apn !== p.apn && (p.lat == null || p.lon == null);
  return (
    <Drawer
      anchor="right"
      open={apn != null}
      onClose={onClose}
      // Start below the fixed AppBar so the header and its actions stay visible.
      slotProps={{ paper: { sx: { top: { xs: 56, sm: 64 }, height: { xs: "calc(100% - 56px)", sm: "calc(100% - 64px)" } } } }}
    >
      <Box sx={{ width: { xs: "100vw", sm: 440 } }} role="complementary" aria-label="Property details">
        <Box
          component="header"
          sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider", px: 2, py: 1.5 }}
        >
          <Stack sx={{ flexDirection: "row", alignItems: "flex-start", gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ lineHeight: 1.3 }}>{p?.situsAddress ?? apn}</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>APN {p?.apn ?? apn}</Typography>
            </Box>
            <IconButton aria-label="Close" onClick={onClose} edge="end"><CloseIcon /></IconButton>
          </Stack>
          {detail && p && (
            <Stack sx={{ flexDirection: "row", justifyContent: "flex-end", gap: 1, mt: 1 }}>
              {onAsk && (
                <Button
                  variant="outlined"
                  onClick={() => {
                    onAsk({ apn: p.apn, situsAddress: p.situsAddress ?? null });
                    onClose();
                  }}
                >
                  Ask agent
                </Button>
              )}
              <Tooltip title={noCoords ? "No coordinates for this property" : ""}>
                <span>
                  <Button
                    variant="contained"
                    disabled={saving || isKnown(p.apn) || noCoords}
                    onClick={() => save(detail)}
                  >
                    {isKnown(p.apn) ? "Already a lead" : "Save as lead"}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          )}
        </Box>
        <Box sx={{ p: 2 }}>
        {!detail && !error && <CircularProgress size={24} />}
        {error && <Alert severity="error">{error}</Alert>}
        {detail && p && (
          <>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Section title="Property">
              <Typography variant="body2">
                {dash(p.situsAddress)}, {dash(p.situsCity)} {p.situsZip ?? ""}
              </Typography>
              <Typography variant="body2">Jurisdiction: {dash(p.jurisdiction)}</Typography>
            </Section>
            <Section title="Roof age basis">
              {detail.roofAge ? (
                <Typography variant="body2">
                  {dash(detail.roofAge.roofAgeYears)} yrs (roof date {dash(detail.roofAge.roofDate)}), based on the{" "}
                  {roofBasisLabel(detail.roofAge.anchor)}, {detail.roofAge.confidence ?? "unknown"} confidence
                  {detail.roofAge.permitNumber ? `, permit ${detail.roofAge.permitNumber}` : ""}
                </Typography>
              ) : (
                <Typography variant="body2">No roof age on record.</Typography>
              )}
            </Section>
            <Section title="Permits">
              {detail.permits.length === 0 && <Typography variant="body2">None.</Typography>}
              {detail.permits.map((pm) => (
                <Typography key={pm.permitNumber} variant="body2" sx={{ mb: 0.5 }}>
                  {[
                    pm.permitNumber,
                    pm.permitState ? permitStateLabel(pm.permitState) : "state unknown",
                    pm.issueDate && `issued ${pm.issueDate}`,
                    pm.finalDate && `final ${pm.finalDate}`,
                    pm.daysOpen != null && `${pm.daysOpen} days open`,
                    pm.workDescription,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              ))}
            </Section>
            <Section title="Contractor">
              {detail.contractors.length === 0 && <Typography variant="body2">None on record.</Typography>}
              {detail.contractors.map((c, i) => (
                <Typography key={c.contractorId ?? i} variant="body2">
                  {c.companyName ?? "Unknown company"} ·{" "}
                  {c.cslbLicenseNumber
                    ? `CSLB ${c.cslbLicenseNumber}${c.cslbStatus ? ` (${c.cslbStatus})` : ""}`
                    : "CSLB license: not matched"}{" "}
                  · BBB: not available (no public source)
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
              <Typography variant="caption" component="div" sx={{ mt: 1 }}>
                Source:{" "}
                {p.sourceUrl ? (
                  <Link
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={p.sourceUrl}
                    sx={{ display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
                  >
                    {p.sourceUrl}
                  </Link>
                ) : (
                  "-"
                )}
              </Typography>
              <Typography variant="caption" component="div">
                Version {dash(p.sourceVersion)} · fetched {dash(p.fetchedAt)} · manifest CID{" "}
                {dash(detail.snapshot.manifestCid)}
              </Typography>
            </Section>
          </>
        )}
        </Box>
      </Box>
      <Snackbar open={saved} autoHideDuration={4000} onClose={clearSaved} message="Saved as lead" />
    </Drawer>
  );
}
