import { Box, Paper, Stack, Typography } from "@mui/material";
import { SIGNAL_STYLE, type MarkerKind } from "./mapStyle";

const ORDER: MarkerKind[] = ["aged_roof", "open_permit", "stalled_permit", "other"];

const Dot = ({ kind, r = 5 }: { kind: MarkerKind; r?: number }) => (
  <Box component="svg" width={16} height={16} viewBox="0 0 16 16" aria-hidden sx={{ flexShrink: 0 }}>
    <circle cx={8} cy={8} r={r} fill={SIGNAL_STYLE[kind].fill} stroke={SIGNAL_STYLE[kind].stroke} strokeWidth={1.5} />
  </Box>
);

/** Explains marker colors; sits over the bottom-left corner of the map. */
export function MapLegend() {
  return (
    <Paper
      elevation={2}
      role="note"
      aria-label="Map legend"
      sx={{ position: "absolute", left: 10, bottom: 22, zIndex: 500 /* above markers (400), below tooltips and popups */, px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.94)", borderRadius: 1.5 }}
    >
      <Stack spacing={0.25}>
        {ORDER.map((k) => (
          <Stack key={k} sx={{ flexDirection: "row", alignItems: "center", gap: 0.75 }}>
            <Dot kind={k} />
            <Typography variant="caption">{SIGNAL_STYLE[k].label}</Typography>
          </Stack>
        ))}
        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 0.75 }}>
          <Dot kind="aged_roof" r={6.5} />
          <Typography variant="caption">Larger dot: aged roof and a permit</Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}
