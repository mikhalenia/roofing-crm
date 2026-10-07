import { Box, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";

interface Option<T extends string> {
  value: T;
  label: string;
  /** Longer meaning, shown on hover. */
  hint?: string;
}

interface Props<T extends string> {
  name: string;
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}

/**
 * Equal-width segments over native radio inputs, so Tab focuses the group and the
 * arrow keys move the selection.
 */
export function SegmentedControl<T extends string>({ name, label, value, options, onChange }: Props<T>) {
  return (
    <Box
      role="radiogroup"
      aria-label={label}
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        p: 0.375,
        gap: 0.375,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        const segment = (
          <Box
            component="label"
            sx={(t) => ({
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 32,
              borderRadius: 1,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: selected ? 600 : 400,
              color: selected ? "primary.main" : "text.secondary",
              bgcolor: selected ? alpha(t.palette.primary.main, 0.1) : "transparent",
              "&:hover": { bgcolor: selected ? alpha(t.palette.primary.main, 0.14) : "action.hover" },
              "&:has(input:focus-visible)": { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 1 },
            })}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={selected}
              onChange={() => onChange(o.value)}
              style={{ position: "absolute", opacity: 0, width: 1, height: 1, margin: 0 }}
            />
            {o.label}
          </Box>
        );
        return o.hint ? (
          <Tooltip key={o.value} title={o.hint} describeChild>
            {segment}
          </Tooltip>
        ) : (
          <Box key={o.value} sx={{ display: "contents" }}>{segment}</Box>
        );
      })}
    </Box>
  );
}
