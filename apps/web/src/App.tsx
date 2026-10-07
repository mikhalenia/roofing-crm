import { useState } from "react";
import MenuIcon from "@mui/icons-material/Menu";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  useMediaQuery,
  useTheme,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { FutureNav } from "./components/FutureNav";
import { AgentPage } from "./pages/AgentPage";
import { LeadsPage } from "./pages/LeadsPage";
import { ProspectPage } from "./pages/ProspectPage";
import { AgentProvider } from "./state/AgentContext";
import { SearchProvider, useSearch } from "./state/SearchContext";
import { DataStatus } from "./components/DataStatus";
import { useHealth } from "./pages/useProspectSearch";

const NAV_WIDTH = 220;
const NAV = [
  { to: "/", label: "Prospect" },
  { to: "/leads", label: "Leads" },
  { to: "/agent", label: "Agent" },
];

function Shell() {
  const { pathname } = useLocation();
  const { state } = useSearch();
  const theme = useTheme();
  // Below md the sidebar becomes a menu so the map gets the full screen width.
  const compact = useMediaQuery(theme.breakpoints.down("md"));
  const [menuOpen, setMenuOpen] = useState(false);
  useHealth();
  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          {compact && (
            <IconButton color="inherit" edge="start" aria-label="Open menu" onClick={() => setMenuOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="h1" sx={{ flex: 1, whiteSpace: "nowrap" }}>Roofing CRM</Typography>
          <DataStatus snapshot={state.snapshot} error={state.healthError} />
        </Toolbar>
      </AppBar>
      <Drawer
        variant={compact ? "temporary" : "permanent"}
        open={compact ? menuOpen : true}
        onClose={() => setMenuOpen(false)}
        sx={{ width: compact ? 0 : NAV_WIDTH, flexShrink: 0, "& .MuiDrawer-paper": { width: NAV_WIDTH, boxSizing: "border-box" } }}
      >
        <Toolbar />
        <List component="nav" aria-label="Main">
          {NAV.map((n) => (
            <ListItemButton key={n.to} component={Link} to={n.to} selected={pathname === n.to} onClick={() => setMenuOpen(false)}>
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
        </List>
        <FutureNav />
      </Drawer>
      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 1.5, sm: 2 } }}>
        <Toolbar />
        <Routes>
          <Route path="/" element={<ProspectPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/agent" element={<AgentPage />} />
        </Routes>
      </Box>
    </Box>
  );
}

export function App() {
  return (
    <SearchProvider>
      <AgentProvider>
        <Shell />
      </AgentProvider>
    </SearchProvider>
  );
}

export default App;
