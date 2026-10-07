import { Alert } from "@mui/material";
import type { PipelineSnapshot } from "@crm/contracts";
import { apiBase } from "../api/pipeline";

interface Props {
  snapshot: PipelineSnapshot | null;
  healthError: string | null;
  searchError: string | null;
}

export function SnapshotBanner({ snapshot, healthError, searchError }: Props) {
  const info = snapshot
    ? `Snapshot run ${snapshot.runId} · manifest ${snapshot.manifestCid ?? "none"} · API ${apiBase() || "(same origin)"}`
    : null;
  return (
    <>
      {healthError && (
        <Alert severity="error" sx={{ mb: 1 }}>
          Pipeline health check failed: {healthError}
          {info ? ` Last known: ${info}` : ""}
        </Alert>
      )}
      {searchError && (
        <Alert severity="error" sx={{ mb: 1 }}>
          Search failed: {searchError}. Showing previous results.
        </Alert>
      )}
      {!healthError && info && (
        <Alert severity="info" sx={{ mb: 1 }}>
          {info}
        </Alert>
      )}
    </>
  );
}
