import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";
import { useAgent } from "../state/AgentContext";
import { useSearch } from "../state/SearchContext";
import { PropertyDrawer } from "./PropertyDrawer";

const EXAMPLES = [
  "Which properties within 5 miles of San José have roofs older than 15 years?",
  "Open roofing permits open for more than 3 years near Sunnyvale, who is the contractor?",
  "Save the three oldest roofs near Cupertino as leads",
];

const compact = (v: unknown) => {
  const s = JSON.stringify(v) ?? "";
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

interface Props {
  /** Rendered next to the map on the Prospect page (narrow column, close button). */
  embedded?: boolean;
  onClose?: () => void;
}

export function AgentPanel({ embedded = false, onClose }: Props) {
  const { state, dispatch } = useSearch();
  const { agent, setQuestion, send, askAbout } = useAgent();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const { question, target, loading, error, result, answeredTarget } = agent;

  const apply = () => {
    if (!result?.resolvedFilters) return;
    dispatch({ type: "applyParams", params: result.resolvedFilters });
    if (!embedded) navigate("/");
  };

  // A source in the current results is shown on the map with its popup; any other opens the drawer.
  const showSource = (apn: string) => {
    if (state.results.some((r) => r.lead.apn === apn)) {
      dispatch({ type: "focusProperty", focus: { apn } });
      if (!embedded) navigate("/");
    } else {
      setSelected(apn);
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: embedded ? "none" : 800 }} role="region" aria-label="Agent">
      <Stack sx={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h5" component="h2">Agent</Typography>
        {onClose && (
          <IconButton aria-label="Close agent" onClick={onClose}><CloseIcon /></IconButton>
        )}
      </Stack>
      <Stack sx={{ flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
        {EXAMPLES.map((q) => (
          <Chip key={q} label={q} variant="outlined" onClick={() => setQuestion(q, null)} />
        ))}
      </Stack>
      {target && (
        <Box>
          <Chip
            color="primary"
            label={`About ${target.address ?? target.apn}`}
            onDelete={() => setQuestion(question, null)}
          />
        </Box>
      )}
      <Stack sx={{ flexDirection: embedded ? "column" : "row", gap: 1 }}>
        <TextField
          fullWidth
          multiline
          label="Question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <Button
          variant="contained"
          disabled={loading || question.trim().length < 3}
          onClick={() => send({ lat: state.pin.lat, lon: state.pin.lon, radiusMiles: state.radiusMiles })}
        >
          Send
        </Button>
      </Stack>
      {loading && <CircularProgress size={24} aria-label="Loading" />}
      {error && <Alert severity="error">{error}</Alert>}
      {result && (
        <>
          <Box data-testid="agent-tool-calls">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Tool calls</Typography>
            {result.toolCalls.length === 0 && <Typography variant="body2">None.</Typography>}
            {result.toolCalls.map((t, i) => (
              <Box key={i} sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>
                  {t.name} {compact(t.args)} · {t.resultCount} results
                </Typography>
                {t.error && (
                  <Typography variant="body2" sx={{ color: "error.main" }}>{t.error}</Typography>
                )}
              </Box>
            ))}
          </Box>
          <Typography data-testid="agent-answer" sx={{ whiteSpace: "pre-wrap" }}>{result.answer}</Typography>
          {result.sources.length > 0 && (
            <Stack data-testid="agent-sources" sx={{ flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
              {result.sources.map((s) => {
                const isTarget = s.apn === answeredTarget?.apn;
                return (
                  <Chip
                    key={`${s.apn}:${s.permitNumber ?? ""}`}
                    label={[s.address ?? s.apn, s.permitNumber].filter(Boolean).join(" · ")}
                    color={isTarget ? "primary" : "default"}
                    variant={isTarget ? "filled" : "outlined"}
                    aria-current={isTarget ? "true" : undefined}
                    onClick={() => showSource(s.apn)}
                  />
                );
              })}
            </Stack>
          )}
          <Box>
            <Button variant="outlined" disabled={result.resolvedFilters == null} onClick={apply}>
              Apply to map
            </Button>
          </Box>
        </>
      )}
      <PropertyDrawer apn={selected} pin={state.pin} onClose={() => setSelected(null)} onAsk={askAbout} />
    </Stack>
  );
}
