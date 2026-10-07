import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import type { AgentResponse } from "@crm/contracts";
import { askAgent } from "../api/crm";
import { errorText } from "../api/errors";
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

export function AgentPanel() {
  const { state, dispatch } = useSearch();
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const send = () => {
    setLoading(true);
    setError(null);
    askAgent({
      question: question.trim(),
      context: { lat: state.pin.lat, lon: state.pin.lon, radiusMiles: state.radiusMiles },
    }).then(
      (r) => {
        setResult(r);
        setLoading(false);
      },
      (e: unknown) => {
        setError(errorText(e));
        setLoading(false);
      },
    );
  };

  const apply = () => {
    if (!result?.resolvedFilters) return;
    dispatch({ type: "applyParams", params: result.resolvedFilters });
    navigate("/");
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 800 }}>
      <Typography variant="h5" component="h2">Agent</Typography>
      <Stack sx={{ flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
        {EXAMPLES.map((q) => (
          <Chip key={q} label={q} variant="outlined" onClick={() => setQuestion(q)} />
        ))}
      </Stack>
      <Stack sx={{ flexDirection: "row", gap: 1 }}>
        <TextField
          fullWidth
          multiline
          label="Question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <Button variant="contained" disabled={loading || question.trim().length < 3} onClick={send}>
          Send
        </Button>
      </Stack>
      {loading && <CircularProgress size={24} aria-label="Loading" />}
      {error && <Alert severity="error">{error}</Alert>}
      {result && (
        <>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Tool calls</Typography>
            {result.toolCalls.length === 0 && <Typography variant="body2">None.</Typography>}
            {result.toolCalls.map((t, i) => (
              <Box key={i} sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                  {t.name} {compact(t.args)} · {t.resultCount} results
                </Typography>
                {t.error && (
                  <Typography variant="body2" sx={{ color: "error.main" }}>{t.error}</Typography>
                )}
              </Box>
            ))}
          </Box>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{result.answer}</Typography>
          {result.sources.length > 0 && (
            <Stack sx={{ flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
              {result.sources.map((s) => (
                <Chip
                  key={`${s.apn}:${s.permitNumber ?? ""}`}
                  label={[s.address ?? s.apn, s.permitNumber].filter(Boolean).join(" · ")}
                  onClick={() => setSelected(s.apn)}
                />
              ))}
            </Stack>
          )}
          <Box>
            <Button variant="outlined" disabled={result.resolvedFilters == null} onClick={apply}>
              Apply to map
            </Button>
          </Box>
        </>
      )}
      <PropertyDrawer apn={selected} pin={state.pin} onClose={() => setSelected(null)} />
    </Stack>
  );
}
