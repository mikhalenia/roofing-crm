import { useState, type ComponentProps } from "react";
import { Box, Button, Drawer, IconButton, Paper, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import TuneIcon from "@mui/icons-material/Tune";
import { initialState } from "../state/search";
import { SearchControls, activeFilterCount } from "./SearchControls";

type Props = Omit<ComponentProps<typeof SearchControls>, "layout">;

/** Filters as one bar above the map; on phones a "Filters (N active)" button opens a bottom sheet. */
export function FilterBar(props: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(props.state, initialState);

  if (!phone) {
    return (
      <Paper variant="outlined" sx={{ mb: 2, borderRadius: 2 }} component="section" aria-label="Search filters">
        <SearchControls {...props} layout="bar" />
      </Paper>
    );
  }
  return (
    <Box sx={{ mb: 2 }}>
      <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setOpen(true)}>
        {active ? `Filters (${active} active)` : "Filters"}
      </Button>
      <Drawer anchor="bottom" open={open} onClose={() => setOpen(false)}>
        <Box role="dialog" aria-label="Search filters">
          <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", px: 2, pt: 1 }}>
            <Typography variant="subtitle1" component="h2">Filters</Typography>
            <IconButton aria-label="Close filters" onClick={() => setOpen(false)}><CloseIcon /></IconButton>
          </Stack>
          <SearchControls {...props} layout="stack" />
        </Box>
      </Drawer>
    </Box>
  );
}
