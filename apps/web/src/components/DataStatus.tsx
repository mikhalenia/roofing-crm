import { useState } from "react";
import { Alert, Box, ButtonBase, Popover, Stack, Tooltip, Typography } from "@mui/material";
import type { PipelineSnapshot } from "@crm/contracts";
import { apiBase } from "../api/pipeline";
import { friendlyDate } from "../labels";
import { CidLine, TechnicalDetails } from "./TechnicalDetails";

interface Props {
  snapshot: PipelineSnapshot | null;
  error: string | null;
}

const Dot = ({ color }: { color: string }) => (
  <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
);

/** A quiet "where the data comes from" chip; details and raw identifiers open on click. */
export function DataStatus({ snapshot, error }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const updated = friendlyDate(snapshot?.syncedAt) ?? friendlyDate(snapshot?.runId);
  const label = error
    ? "Data unavailable"
    : snapshot
      ? `Data: Santa Clara County${updated ? ` · updated ${updated}` : ""}`
      : "Data: checking…";
  return (
    <>
      <Tooltip describeChild title="Property and permit data come from a published, content-addressed snapshot. Click for details.">
        <ButtonBase
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="dialog"
          sx={{ gap: 1, px: 1.5, py: 0.5, borderRadius: 4, bgcolor: "rgba(255,255,255,0.14)", color: "inherit", fontSize: 13 }}
        >
          <Dot color={error ? "#ef5350" : snapshot ? "#66bb6a" : "#bdbdbd"} />
          <Box component="span" sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: { xs: 170, sm: "none" } }}>
            {label}
          </Box>
        </ButtonBase>
      </Tooltip>
      <Popover
        open={anchor != null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Stack spacing={1.25} sx={{ p: 2, maxWidth: 380 }} role="dialog" aria-label="About this data">
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>About this data</Typography>
          {error && <Alert severity="error">The data service is unreachable right now: {error}</Alert>}
          <Typography variant="body2">
            Properties and permits come from a published snapshot: a verifiable copy of public county
            records that every search on this page reads from.
          </Typography>
          <Typography variant="body2">
            {updated ? `Last updated ${updated}.` : "Update date unknown."} Sources: County of Santa Clara
            parcels and City of San José building permits.
          </Typography>
          <TechnicalDetails>
            <Typography variant="caption">Run id: {snapshot?.runId ?? "unknown"}</Typography>
            <CidLine cid={snapshot?.manifestCid} />
            <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>API: {apiBase() || "(same origin)"}</Typography>
          </TechnicalDetails>
        </Stack>
      </Popover>
    </>
  );
}
