import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyDrawer } from "./PropertyDrawer";

const crm = vi.hoisted(() => ({ createLead: vi.fn(), getLead: vi.fn() }));
vi.mock("../api/crm", () => ({
  ...crm,
  CrmError: class CrmError extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  },
}));

const detail = {
  snapshot: { runId: "r1", manifestCid: "bafyMANIFEST", syncedAt: null },
  property: { apn: "A1", situsAddress: "1 Main St", situsCity: "San Jose", situsZip: "95112", jurisdiction: "San Jose", lat: 37.3, lon: -121.9, sourceUrl: "https://src.test/p", sourceVersion: "v9", fetchedAt: "2026-10-01" },
  permits: [{ permitNumber: "BLD-1", permitState: "open", issueDate: "2020-01-01", finalDate: null, daysOpen: 700, workDescription: "Re-roof", sourceUrl: "https://src.test/b", sourceVersion: "v2", fetchedAt: "2026-10-01" }],
  roofAge: { roofDate: "2004-05-01", roofAgeYears: 22, anchor: "final_date", confidence: "high", permitNumber: "BLD-0" },
  owners: [{ ownerName: "Jane Doe", observedOn: "2025-02-01", permitNumber: "BLD-1" }],
  contractors: [{ contractorId: "c1", companyName: "Acme Roofing", cslbLicenseNumber: "123456", cslbStatus: "active" }],
};

beforeEach(() => {
  crm.createLead.mockReset().mockResolvedValue({});
  crm.getLead.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("PropertyDrawer", () => {
  it("renders all sections, provenance and an enabled save button", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string) => new Response(JSON.stringify(detail))));
    render(<PropertyDrawer apn="A1" onClose={() => undefined} />);
    expect(await screen.findByText("Property")).toBeInTheDocument();
    for (const t of ["Roof age basis", "Permits", "Contractor", "Owners", "Provenance"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText(/22 yrs/)).toBeInTheDocument();
    expect(screen.getByText("BLD-1 · Open · issued 2020-01-01 · 700 days open · Re-roof")).toBeInTheDocument();
    expect(screen.queryByText(/final -/)).toBeNull();
    expect(screen.getByText(/based on the final inspection date, high confidence, permit BLD-0/)).toBeInTheDocument();
    expect(screen.getByText(/Acme Roofing · CSLB 123456 \(active\) · BBB: not available \(no public source\)/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe · observed 2025-02-01/)).toBeInTheDocument();
    expect(screen.getByText(/manifest CID bafyMANIFEST/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as lead" })).toBeEnabled();
  });

  const open = async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string) => new Response(JSON.stringify(detail))));
    render(<PropertyDrawer apn="A1" onClose={() => undefined} />);
    return screen.findByRole("button", { name: /Save as lead|Already a lead/ });
  };

  it("saves a lead and shows a snackbar", async () => {
    fireEvent.click(await open());
    expect(await screen.findByText("Saved as lead")).toBeInTheDocument();
    expect(crm.createLead).toHaveBeenCalledWith(
      expect.objectContaining({ apn: "A1", snapshot: expect.objectContaining({ apn: "A1" }) }),
    );
    expect(await screen.findByRole("button", { name: "Already a lead" })).toBeDisabled();
  });

  it("checks the CRM on open and shows Already a lead for a saved apn", async () => {
    crm.getLead.mockResolvedValue({ apn: "A1", status: "new" });
    vi.stubGlobal("fetch", vi.fn(async (_u: string) => new Response(JSON.stringify(detail))));
    render(<PropertyDrawer apn="A1" onClose={() => undefined} />);
    expect(await screen.findByRole("button", { name: "Already a lead" })).toBeDisabled();
    expect(crm.getLead).toHaveBeenCalledWith("A1");
    expect(crm.createLead).not.toHaveBeenCalled();
  });

  it("keeps Save as lead enabled when the CRM lookup fails", async () => {
    crm.getLead.mockRejectedValue(new Error("network"));
    fireEvent.click(await open());
    expect(await screen.findByText("Saved as lead")).toBeInTheDocument();
  });

  it("flips to Already a lead on 409", async () => {
    const { CrmError } = await import("../api/crm");
    crm.createLead.mockRejectedValue(new CrmError("conflict", 409));
    fireEvent.click(await open());
    const done = await screen.findByRole("button", { name: "Already a lead" });
    expect(done).toBeDisabled();
  });

  it("is disabled and never saves when the property has no coordinates", async () => {
    const noCoords = { ...detail, property: { ...detail.property, lat: null, lon: null } };
    vi.stubGlobal("fetch", vi.fn(async (_u: string) => new Response(JSON.stringify(noCoords))));
    render(<PropertyDrawer apn="A1" onClose={() => undefined} />);
    const btn = await screen.findByRole("button", { name: "Save as lead" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(crm.createLead).not.toHaveBeenCalled();
  });

  it("has a header with the address, APN, close button and actions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string) => new Response(JSON.stringify(detail))));
    const onClose = vi.fn();
    const onAsk = vi.fn();
    render(<PropertyDrawer apn="A1" onClose={onClose} onAsk={onAsk} />);
    const header = within(await screen.findByRole("banner"));
    expect(header.getByRole("heading", { name: "1 Main St" })).toBeInTheDocument();
    expect(header.getByText("APN A1")).toBeInTheDocument();
    expect(await header.findByRole("button", { name: "Save as lead" })).toBeEnabled();
    fireEvent.click(header.getByRole("button", { name: "Ask agent" }));
    expect(onAsk).toHaveBeenCalledWith({ apn: "A1", situsAddress: "1 Main St" });
    fireEvent.click(header.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("maps raw values to readable labels and truncates the source link", async () => {
    const raw = {
      ...detail,
      permits: [{ ...detail.permits[0], permitState: "expired_unfinaled", finalDate: null }],
      roofAge: { ...detail.roofAge, anchor: "approval_complete_issue_date", confidence: "medium" },
      contractors: [{ contractorId: "c2", companyName: "Bob Roofing", cslbLicenseNumber: null, cslbStatus: null }],
    };
    vi.stubGlobal("fetch", vi.fn(async (_u: string) => new Response(JSON.stringify(raw))));
    render(<PropertyDrawer apn="A1" onClose={() => undefined} />);
    expect(await screen.findByText(/BLD-1 · Stalled \(expired, no final inspection\) · issued/)).toBeInTheDocument();
    expect(screen.queryByText(/expired_unfinaled/)).toBeNull();
    expect(screen.getByText(/based on the completed-approval issue date, medium confidence/)).toBeInTheDocument();
    expect(screen.queryByText(/approval_complete_issue_date/)).toBeNull();
    expect(screen.getByText(/Bob Roofing · CSLB license: not matched · BBB: not available \(no public source\)/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "https://src.test/p" });
    expect(link).toHaveAttribute("title", "https://src.test/p");
    expect(link).toHaveStyle({ textOverflow: "ellipsis" });
  });
});
