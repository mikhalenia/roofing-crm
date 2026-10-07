import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineLead } from "@crm/contracts";
import { MarkerPopup } from "./MarkerPopup";

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

const lead = {
  apn: "A1", situsAddress: "1 Main St", situsCity: "SAN JOSE", lat: 37.3, lon: -121.9, bbbRating: null,
  distanceMiles: 1, roofAgeYears: 22, roofAgeAnchor: "final_date", permitNumber: "BLD-1",
  permitState: "expired_unfinaled", daysOpen: 900, contractorCompany: "Acme Roofing", ownerName: "Jane Doe",
  provenance: { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" },
} as PipelineLead;

beforeEach(() => {
  crm.createLead.mockReset().mockResolvedValue({});
  crm.getLead.mockReset().mockResolvedValue(null);
});

describe("MarkerPopup", () => {
  it("shows the summary and wires Details and Ask agent", () => {
    const onDetails = vi.fn();
    const onAsk = vi.fn();
    render(<MarkerPopup lead={lead} onDetails={onDetails} onAsk={onAsk} />);
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    // A labelled group, not a dialog: the popup does not take focus or trap it.
    expect(screen.getByRole("group", { name: "Property 1 Main St" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("SAN JOSE, APN A1")).toBeInTheDocument();
    expect(screen.getByText("Roof 22 yrs, based on the final inspection date")).toBeInTheDocument();
    expect(screen.getByText("Permit BLD-1: Stalled (permit expired without a final inspection)")).toBeInTheDocument();
    expect(screen.getByText("Open 2 years, 5 months")).toHaveAttribute("title", "900 days");
    expect(screen.getByText("Contractor: Acme Roofing")).toBeInTheDocument();
    expect(screen.getByText("Owner: Jane Doe")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(onDetails).toHaveBeenCalledWith("A1");
    fireEvent.click(screen.getByRole("button", { name: "Ask agent" }));
    expect(onAsk).toHaveBeenCalledWith(lead);
  });

  it("saves as lead and shows the toast", async () => {
    render(<MarkerPopup lead={lead} onDetails={vi.fn()} onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save as lead" }));
    expect(await screen.findByText("Saved as lead")).toBeInTheDocument();
    expect(crm.createLead).toHaveBeenCalledWith({ apn: "A1", snapshot: lead });
    expect(screen.getByRole("button", { name: "Already a lead" })).toBeDisabled();
  });

  it("marks a 409 as already a lead", async () => {
    const { CrmError } = await import("../api/crm");
    crm.createLead.mockRejectedValue(new CrmError("exists", 409));
    render(<MarkerPopup lead={lead} onDetails={vi.fn()} onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save as lead" }));
    expect(await screen.findByRole("button", { name: "Already a lead" })).toBeDisabled();
  });

  it("shows an existing lead as already a lead on open", async () => {
    crm.getLead.mockResolvedValue({ apn: "A1" });
    render(<MarkerPopup lead={lead} onDetails={vi.fn()} onAsk={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Already a lead" })).toBeDisabled();
  });

  it("refuses to save without coordinates", async () => {
    render(<MarkerPopup lead={{ ...lead, lat: Number.NaN }} onDetails={vi.fn()} onAsk={vi.fn()} />);
    await waitFor(() => expect(crm.getLead).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Save as lead" })).toBeDisabled();
  });
});
