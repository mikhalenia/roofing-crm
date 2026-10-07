import {
  AppBar,
  Box,
  Drawer,
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

const NAV_WIDTH = 220;
const NAV = [
  { to: "/", label: "Prospect" },
  { to: "/leads", label: "Leads" },
  { to: "/agent", label: "Agent" },
];

export function App() {
  const { pathname } = useLocation();
  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" component="h1">Roofing CRM</Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{ width: NAV_WIDTH, flexShrink: 0, "& .MuiDrawer-paper": { width: NAV_WIDTH, boxSizing: "border-box" } }}
      >
        <Toolbar />
        <List component="nav" aria-label="Main">
          {NAV.map((n) => (
            <ListItemButton key={n.to} component={Link} to={n.to} selected={pathname === n.to}>
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
        </List>
        <FutureNav />
      </Drawer>
      <Box component="main" sx={{ flex: 1, minWidth: 0, p: 2 }}>
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

export default App;
