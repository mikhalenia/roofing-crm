import { List, ListItem, ListItemButton, ListItemText, Tooltip } from "@mui/material";

const FUTURE = ["Campaigns", "Outreach", "Estimates & Quotes", "Crew Scheduling", "Reporting"];

export function FutureNav() {
  return (
    <List dense>
      {FUTURE.map((label) => (
        <Tooltip key={label} title="Coming later — this release is lead identification">
          <ListItem disablePadding aria-disabled="true">
            <ListItemButton disabled>
              <ListItemText primary={label} />
            </ListItemButton>
          </ListItem>
        </Tooltip>
      ))}
    </List>
  );
}
