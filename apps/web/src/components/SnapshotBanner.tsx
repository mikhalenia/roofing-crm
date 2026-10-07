import { Alert } from "@mui/material";

/** Search failures; the data source status lives in the DataStatus chip. */
export function SnapshotBanner({ searchError }: { searchError: string | null }) {
  if (!searchError) return null;
  return (
    <Alert severity="error" sx={{ mb: 1 }}>
      Search failed: {searchError}. Showing previous results.
    </Alert>
  );
}
