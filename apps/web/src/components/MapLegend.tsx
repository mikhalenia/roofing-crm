import { Box, Stack, Typography } from "@mui/material";
import { signalLabel } from "../labels";
import { SIGNAL_STYLE, type MarkerKind } from "./mapStyle";

const ORDER: MarkerKind[] = ["aged_roof", "open_permit", "stalled_permit", "other"];

const Dot = ({ kind, r = 4.5 }: { kind: MarkerKind; r?: number }) => (
  <Box component="svg" width={14} height={14} viewBox="0 0 14 14" aria-hidden sx={{ flexShrink: 0 }}>
    <circle cx={7} cy={7} r={r} fill={SIGNAL_STYLE[kind].fill} stroke={SIGNAL_STYLE[kind].stroke} strokeWidth={1.5} />
  </Box>
);

const Item = ({ kind, r, label }: { kind: MarkerKind; r?: number; label: string }) => (
  <Stack component="li" sx={{ flexDirection: "row", alignItems: "center", gap: 0.5 }}>
    <Dot kind={kind} {...(r ? { r } : {})} />
    <Typography variant="caption" sx={{ fontSize: 12 }}>{label}</Typography>
  </Stack>
);

/** One compact row under the map explaining marker colors and size. */
export function MapLegend() {
  return (
    <Stack
      component="ul"
      aria-label="Map legend"
      sx={{ flexDirection: "row", flexWrap: "wrap", columnGap: 1.75, rowGap: 0.5, listStyle: "none", m: 0, p: 0 }}
    >
      {ORDER.map((k) => (
        <Item key={k} kind={k} label={signalLabel(k)} />
      ))}
      <Item kind="aged_roof" r={6} label="Larger dot: aged roof and a permit" />
    </Stack>
  );
}
