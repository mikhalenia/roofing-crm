import { useMemo, useState } from "react";
import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
} from "@mui/material";
import type { ResultRow } from "../state/search";

type SortKey = "address" | "city" | "roofAge" | "state" | "daysOpen" | "distance";

const ANCHOR_LABEL: Record<string, string> = {
  final_date: "Based on final inspection date",
  approval_complete_issue_date: "Based on approval-complete issue date",
};

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
}

export function ResultsTable({ rows, onSelect, selectedApn = null }: Props) {
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
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          {header("address", "Address")}
          {header("city", "City")}
          {header("roofAge", "Roof age")}
          <TableCell>Permit</TableCell>
          {header("state", "State")}
          {header("daysOpen", "Days open")}
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
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(l.apn);
              }
            }}
            sx={{ cursor: "pointer" }}
          >
            <TableCell>{l.situsAddress ?? "-"}</TableCell>
            <TableCell>{l.situsCity ?? "-"}</TableCell>
            <TableCell>
              {l.roofAgeYears != null ? (
                <Tooltip
                  title={`${ANCHOR_LABEL[l.roofAgeAnchor ?? ""] ?? "Unknown basis"} (${l.roofAgeConfidence ?? "unknown"} confidence)`}
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
            <TableCell>{l.permitState ?? "-"}</TableCell>
            <TableCell>{l.daysOpen ?? "-"}</TableCell>
            <TableCell>{l.contractorCompany ?? "-"}</TableCell>
            <TableCell>{l.cslbStatus ?? "-"}</TableCell>
            <TableCell>not available</TableCell>
            <TableCell>{l.ownerName ?? "-"}</TableCell>
            <TableCell>{l.distanceMiles.toFixed(1)} mi</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
