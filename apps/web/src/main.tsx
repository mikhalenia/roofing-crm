import { StrictMode } from "react";
import { BrowserRouter } from "react-router-dom";
import * as ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import "leaflet/dist/leaflet.css";
import App from "./App";
import { theme } from "./theme";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
