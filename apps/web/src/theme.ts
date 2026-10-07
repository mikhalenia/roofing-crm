import { createTheme } from "@mui/material";

export const theme = createTheme({
  palette: { primary: { main: "#1565c0" } },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: "none" } } },
  },
});
