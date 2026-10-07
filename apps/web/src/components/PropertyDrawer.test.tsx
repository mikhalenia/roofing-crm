import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyDrawer } from "./PropertyDrawer";

const detail = {
  snapshot: { runId: "r1", manifestCid: "bafyMANIFEST", syncedAt: null },
  property: { apn: "A1", situsAddress: "1 Main St", situsCity: "San Jose", situsZip: "95112", jurisdiction: "San Jose", sourceUrl: "https://src.test/p", sourceVersion: "v9", fetchedAt: "2026-10-01" },
  permits: [{ permitNumber: "BLD-1", permitState: "open", issueDate: "2020-01-01", finalDate: null, daysOpen: 700, workDescription: "Re-roof", sourceUrl: "https://src.test/b", sourceVersion: "v2", fetchedAt: "2026-10-01" }],
  roofAge: { roofDate: "2004-05-01", roofAgeYears: 22, anchor: "final_date", confidence: "high", permitNumber: "BLD-0" },
  owners: [{ ownerName: "Jane Doe", observedOn: "2025-02-01", permitNumber: "BLD-1" }],
  contractors: [{ contractorId: "c1", companyName: "Acme Roofing", cslbLicenseNumber: "123456", cslbStatus: "active" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("PropertyDrawer", () => {
  it("renders all sections, provenance and a disabled save button", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string) => new Response(JSON.stringify(detail))));
    render(<PropertyDrawer apn="A1" onClose={() => undefined} />);
    expect(await screen.findByText("Property")).toBeInTheDocument();
    for (const t of ["Roof age basis", "Permits", "Contractor", "Owners", "Provenance"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText(/22 yrs/)).toBeInTheDocument();
    expect(screen.getByText(/BLD-1 · open/)).toBeInTheDocument();
    expect(screen.getByText(/Acme Roofing · CSLB 123456 \(active\) · BBB: not available \(no public source\)/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe · observed 2025-02-01/)).toBeInTheDocument();
    expect(screen.getByText(/manifest CID bafyMANIFEST/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as lead" })).toBeDisabled();
  });
});
