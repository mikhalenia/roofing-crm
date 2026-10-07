import { useMemo, useState } from "react";
import {
  Chip,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
} from "@mui/material";
import type { ResultRow } from "../state/search";
import { confidenceLabel, daysText, formatCount, durationText, permitStateHint, permitStateLabel, roofBasisLabel } from "../labels";

type SortKey = "address" | "city" | "roofAge" | "state" | "daysOpen" | "distance";

function sortValue(r: ResultRow, key: SortKey): string | number {
  const l = r.lead;
  switch (key) {
    case "address":
      return l.situsAddress ?? "";
    case "city":
      return l.situsCity ?? "";
    case "roofAge":
      return l.roofAgeYears ?? -1;
    case "state":
      return l.permitState ?? "";
    case "daysOpen":
      return l.daysOpen ?? -1;
    case "distance":
      return l.distanceMiles;
  }
}

interface Props {
  rows: ResultRow[];
  onSelect: (apn: string) => void;
  selectedApn?: string | null;
  /** A search hit the fetch limit, so more records may match. */
  capped?: boolean;
  /** The result hovered here or on the map; its row is highlighted. */
  hoverApn?: string | null;
  onHover?: (apn: string | null) => void;
}

export function ResultsTable({ rows, onSelect, selectedApn = null, capped = false, hoverApn = null, onHover }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "daysOpen",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === bv) return 0;
      return (av < bv ? -1 : 1) * factor;
    });
  }, [rows, sort]);

  const header = (key: SortKey, label: string) => (
    <TableCell sortDirection={sort.key === key ? sort.dir : false}>
      <TableSortLabel
        active={sort.key === key}
        direction={sort.key === key ? sort.dir : "asc"}
        onClick={() =>
          setSort((s) =>
            s.key === key
              ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
              : { key, dir: key === "address" || key === "city" ? "asc" : "desc" },
          )
        }
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  return (
    <>
    <Typography variant="body2" sx={{ px: 1, py: 0.5 }} data-testid="results-count">
      {capped
        ? `${formatCount(rows.length)} properties shown · more match (search limit reached)`
        : `${formatCount(rows.length)} ${rows.length === 1 ? "result" : "results"}`}
    </Typography>
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          {header("address", "Address")}
          {header("city", "City")}
          {header("roofAge", "Roof age")}
          <TableCell>Permit</TableCell>
          {header("state", "State")}
          {header("daysOpen", "Open for")}
          <TableCell>Contractor</TableCell>
          <TableCell>CSLB</TableCell>
          <TableCell>BBB</TableCell>
          <TableCell>Owner</TableCell>
          {header("distance", "Distance")}
        </TableRow>
      </TableHead>
      <TableBody>
        {sorted.map(({ lead: l }) => (
          <TableRow
            key={l.apn}
            hover
            selected={l.apn === selectedApn}
            tabIndex={0}
            role="button"
            aria-label={`Open details for ${l.situsAddress ?? l.apn}`}
            onClick={() => onSelect(l.apn)}
            onMouseEnter={() => onHover?.(l.apn)}
            onMouseLeave={() => onHover?.(null)}
            data-hovered={l.apn === hoverApn ? "true" : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(l.apn);
              }
            }}
            sx={{ cursor: "pointer", ...(l.apn === hoverApn && { bgcolor: "action.hover" }) }}
          >
            <TableCell>{l.situsAddress ?? "-"}</TableCell>
            <TableCell>{l.situsCity ?? "-"}</TableCell>
            <TableCell>
              {l.roofAgeYears != null ? (
                <Tooltip
                  title={`Based on the ${roofBasisLabel(l.roofAgeAnchor, l.roofAgeBasisLabel)} (${confidenceLabel(l.roofAgeConfidence, l.roofAgeConfidenceLabel)})`}
                >
                  <Chip
                    size="small"
                    label={`${l.roofAgeYears} yrs`}
                    color={l.roofAgeConfidence === "high" ? "error" : "warning"}
                  />
                </Tooltip>
              ) : (
                "-"
              )}
            </TableCell>
            <TableCell>{l.permitNumber ?? "-"}</TableCell>
            <TableCell>
              {l.permitState ? (
                <Tooltip title={l.permitStateLabel || permitStateHint(l.permitState, l.approvalsComplete)}>
                  <span>{permitStateLabel(l.permitState, l.approvalsComplete)}</span>
                </Tooltip>
              ) : (
                "-"
              )}
            </TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>
              {l.daysOpen != null ? <span title={daysText(l.daysOpen)}>{durationText(l.daysOpen)}</span> : "-"}
            </TableCell>
            <TableCell>{l.contractorCompany ?? "-"}</TableCell>
            <TableCell>
              <Tooltip title={l.cslbStatus ? `CSLB status: ${l.cslbStatus}` : "CSLB status unknown"}>
                <span>{l.cslbLicenseNumber ?? "—"}</span>
              </Tooltip>
              {l.cslbStatus && (
                <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                  {l.cslbStatus}
                </Typography>
              )}
            </TableCell>
            <TableCell>not available</TableCell>
            <TableCell>{l.ownerName ?? "-"}</TableCell>
            <TableCell>{l.distanceMiles.toFixed(1)} mi</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </>
  );
}
