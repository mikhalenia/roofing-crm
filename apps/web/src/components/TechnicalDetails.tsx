import { useState, type ReactNode } from "react";
import { Box, Button, Collapse, IconButton, Link, Stack, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/** Raw identifiers and URLs, collapsed by default. */
export function TechnicalDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Button
        size="small"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        endIcon={<ExpandMoreIcon sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />}
        sx={{ px: 0 }}
      >
        Technical details
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={0.75} sx={{ pt: 0.5 }}>{children}</Stack>
      </Collapse>
    </Box>
  );
}

export const CID_EXPLANATION =
  "A CID is a fingerprint of the published data; anyone can fetch the same bytes from the IPFS network with it.";

/** The manifest CID with a copy button, the plain-language explanation and a public gateway link. */
export function CidLine({ cid }: { cid: string | null | undefined }) {
  if (!cid) return <Typography variant="caption">Manifest CID: not published</Typography>;
  return (
    <Box>
      <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 0.5, minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>
          Manifest CID {cid}
        </Typography>
        <Tooltip title="Copy CID">
          <IconButton size="small" aria-label="Copy CID" onClick={() => void navigator.clipboard?.writeText(cid)}>
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
        {CID_EXPLANATION}{" "}
        <Link href={`https://ipfs.io/ipfs/${cid}`} target="_blank" rel="noreferrer">
          Open on a public gateway
        </Link>
      </Typography>
    </Box>
  );
}
