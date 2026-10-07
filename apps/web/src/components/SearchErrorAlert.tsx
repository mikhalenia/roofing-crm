import { Alert } from "@mui/material";

/** A failed search; previous results stay on screen. */
export function SearchErrorAlert({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert severity="error" sx={{ mb: 1 }}>
      Search failed: {error}. Showing previous results.
    </Alert>
  );
}
