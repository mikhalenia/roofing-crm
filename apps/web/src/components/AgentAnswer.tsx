import { useState } from "react";
import { Box, Button, Chip, Collapse, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { AgentResponse } from "@crm/contracts";
import { displayAnswer, formatCount, humanizeToolCall } from "../labels";

const SEARCH_TOOLS = new Set(["find_aged_roofs", "find_open_roofing_permits", "search_properties_in_radius"]);
const FIRST_CHIPS = 8;

/** The widest successful search: how many matched, whether that is a lower bound, and how many the model saw. */
export function searchSummary(result: AgentResponse): { matching: number; capped: boolean; reviewed: number } | null {
  const best = result.toolCalls
    .filter((t) => SEARCH_TOOLS.has(t.name) && !t.error)
    .reduce<AgentResponse["toolCalls"][number] | null>((a, t) => (a == null || t.resultCount > a.resultCount ? t : a), null);
  if (!best) return null;
  return { matching: best.resultCount, capped: best.capped ?? false, reviewed: best.shown ?? result.sources.length };
}

export function sourcesHeader(result: AgentResponse): string {
  const n = result.sources.length;
  const s = searchSummary(result);
  if (!s) return `Sources · ${n}`;
  return `Sources · ${n} of ${s.capped ? "at least " : ""}${formatCount(s.matching)} matching properties (the agent reviewed the first ${s.reviewed})`;
}

interface Props {
  result: AgentResponse;
  /** APN the question was about; its chip is highlighted. */
  targetApn: string | null;
  onSource: (apn: string) => void;
  onApply: () => void;
}

export function AgentAnswer({ result, targetApn, onSource, onApply }: Props) {
  const [showCalls, setShowCalls] = useState(false);
  const [allChips, setAllChips] = useState(false);
  const summary = searchSummary(result);
  const chips = allChips ? result.sources : result.sources.slice(0, FIRST_CHIPS);
  const hidden = result.sources.length - FIRST_CHIPS;
  const calls = result.toolCalls.length;

  return (
    <>
      <Typography data-testid="agent-answer" sx={{ whiteSpace: "pre-wrap" }}>{displayAnswer(result.answer)}</Typography>
      {result.sources.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>{sourcesHeader(result)}</Typography>
          <Stack data-testid="agent-sources" sx={{ flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
            {chips.map((s) => {
              const isTarget = s.apn === targetApn;
              return (
                <Chip
                  key={`${s.apn}:${s.permitNumber ?? ""}`}
                  label={[s.address ?? s.apn, s.permitNumber].filter(Boolean).join(" · ")}
                  color={isTarget ? "primary" : "default"}
                  variant={isTarget ? "filled" : "outlined"}
                  aria-current={isTarget ? "true" : undefined}
                  onClick={() => onSource(s.apn)}
                />
              );
            })}
            {hidden > 0 && (
              <Chip
                variant="outlined"
                color="primary"
                label={allChips ? "Show fewer" : `+${hidden} more`}
                onClick={() => setAllChips((v) => !v)}
              />
            )}
          </Stack>
        </Box>
      )}
      <Box>
        <Button
          variant={summary ? "contained" : "outlined"}
          disabled={result.resolvedFilters == null}
          onClick={onApply}
        >
          {/* When capped, the count is the fetch limit, not "all". */}
          {!summary || !result.resolvedFilters
            ? "Apply to map"
            : summary.capped
              ? "Show these results on map"
              : `Show all ${formatCount(summary.matching)} on map`}
        </Button>
      </Box>
      <Box data-testid="agent-tool-calls">
        <Button
          size="small"
          onClick={() => setShowCalls((v) => !v)}
          aria-expanded={showCalls}
          endIcon={<ExpandMoreIcon sx={{ transform: showCalls ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />}
          sx={{ px: 0, color: "text.secondary" }}
        >
          How this was answered · {calls} {calls === 1 ? "tool call" : "tool calls"}
        </Button>
        <Collapse in={showCalls}>
          {calls === 0 && <Typography variant="body2">No tools were used.</Typography>}
          {result.toolCalls.map((t, i) => (
            <Box key={i} sx={{ mb: 0.5 }}>
              <Typography variant="body2">{humanizeToolCall(t)}</Typography>
              {t.error && <Typography variant="body2" sx={{ color: "error.main" }}>{t.error}</Typography>}
            </Box>
          ))}
        </Collapse>
      </Box>
    </>
  );
}
