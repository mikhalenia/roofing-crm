import { Chip, Link, Tooltip } from "@mui/material";

interface Props {
  label: string;
  url?: string | null | undefined;
  version?: string | null | undefined;
  fetchedAt?: string | null | undefined;
}

export function ProvenanceChip({ label, url, version, fetchedAt }: Props) {
  const detail = [version && `version ${version}`, fetchedAt && `fetched ${fetchedAt}`]
    .filter(Boolean)
    .join(" · ");
  const chip = <Chip size="small" variant="outlined" label={label} />;
  return (
    <Tooltip title={detail || "No provenance recorded"}>
      {url ? (
        <Link href={url} target="_blank" rel="noreferrer" underline="none">
          {chip}
        </Link>
      ) : (
        <span>{chip}</span>
      )}
    </Tooltip>
  );
}
