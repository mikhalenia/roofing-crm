import { Divider, List, ListItem, ListItemButton, ListItemText, ListSubheader, Tooltip } from "@mui/material";

const FUTURE = ["Campaigns", "Outreach", "Estimates & Quotes", "Crew Scheduling", "Reporting"];

/** Placeholder sections for later releases, grouped under a muted "Coming later" subheader. */
export function FutureNav() {
  return (
    <>
      <Divider sx={{ mt: 1 }} />
      <List
        dense
        aria-labelledby="future-nav-subheader"
        subheader={
          <ListSubheader id="future-nav-subheader" disableSticky sx={{ lineHeight: "32px", fontSize: 12, color: "text.disabled" }}>
            Coming later
          </ListSubheader>
        }
      >
        {FUTURE.map((label) => (
          <Tooltip key={label} title="Coming later — this release is lead identification">
            <ListItem disablePadding aria-disabled="true">
              <ListItemButton disabled>
                <ListItemText primary={label} slotProps={{ primary: { sx: { fontSize: 13 } } }} />
              </ListItemButton>
            </ListItem>
          </Tooltip>
        ))}
      </List>
    </>
  );
}
