import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentPanel } from "./components/AgentPanel";
import { LeadsPage } from "./pages/LeadsPage";
import { ProspectPage } from "./pages/ProspectPage";
import { AgentProvider } from "./state/AgentContext";
import { SearchProvider } from "./state/SearchContext";

// Every raw pipeline token; none may reach the screen.
const RAW = ["expired_unfinaled", "approval_complete_issue_date", "final_date", "aged_roof", "stalled_permit", "open_permit"];

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  CircleMarker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMap: () => ({ getBounds: () => ({ contains: () => true }), getZoom: () => 11, setView: () => undefined, flyTo: () => undefined, fitBounds: () => undefined, on: () => undefined, off: () => undefined }),
  useMapEvents: () => null,
}));

const provenance = { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "2026-10-07 17:10:54" };
const stalled = {
  apn: "A1", situsAddress: "1 Main St", situsCity: "SAN JOSE", lat: 37.3, lon: -121.9, bbbRating: null, distanceMiles: 1,
  roofAgeYears: 23, roofAgeAnchor: "approval_complete_issue_date", roofAgeConfidence: "medium", roofDate: "2003-06-06",
  permitNumber: "P-1", permitState: "expired_unfinaled", daysOpen: 8492, contractorCompany: "ROOFCO", ownerName: "DOE", provenance,
};
const finaled = { ...stalled, apn: "A2", situsAddress: "2 Oak Ave", roofAgeAnchor: "final_date", roofAgeConfidence: "high", permitState: "finaled", permitNumber: "P-2", daysOpen: null };
const open = { ...stalled, apn: "A3", situsAddress: "3 Elm St", permitState: "open", permitNumber: "P-3", daysOpen: 400 };
const snapshot = { runId: "2026-10-07T17-10-54Z", manifestCid: "cid", syncedAt: null };
const detail = {
  snapshot,
  property: { apn: "A1", situsAddress: "1 Main St", situsCity: "SAN JOSE", lat: 37.3, lon: -121.9, sourceUrl: "https://src", sourceVersion: "v", fetchedAt: "2026-10-07" },
  permits: [{ permitNumber: "P-1", permitState: "expired_unfinaled", issueDate: "2003-06-06", finalDate: null, daysOpen: 8492, workDescription: "ReRoof" },
    { permitNumber: "P-2", permitState: "finaled", issueDate: "2001-01-01", finalDate: "2001-02-01", daysOpen: 31, workDescription: "ReRoof" }],
  roofAge: { roofDate: "2003-06-06", roofAgeYears: 23, anchor: "approval_complete_issue_date", confidence: "medium", permitNumber: "P-1" },
  owners: [{ ownerName: "DOE", observedOn: "2003-06-06", permitNumber: "P-1" }],
  contractors: [{ contractorId: "c", companyName: "ROOFCO", cslbLicenseNumber: null, cslbStatus: null }],
};
const agent = {
  answer: "P-1 is expired_unfinaled; roof from approval_complete_issue_date and final_date; aged_roof, open_permit, stalled_permit.\nSOURCES: A1",
  toolCalls: [{ name: "find_open_roofing_permits", args: { lat: 37.3, lon: -121.9, state: "expired_unfinaled" }, resultCount: 3 }],
  sources: [{ apn: "A1", address: "1 Main St", permitNumber: "P-1" }],
  resolvedFilters: { lat: 37.3, lon: -121.9, radiusMiles: 5, permitState: "expired_unfinaled" as const },
};
const leads = [stalled, finaled, open].map((s) => ({ apn: s.apn, status: "new", notes: "", createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z", snapshot: s }));

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => {
    if (u.includes("/api/health")) return json({ ok: true, snapshot });
    if (u.includes("/aged-roofs")) return json({ snapshot, items: [stalled, finaled] });
    if (u.includes("/open-permits")) return json({ snapshot, items: [stalled, open] });
    if (u.includes("/api/properties/")) return json(detail);
    if (u.endsWith("/agent") && init?.method === "POST") return json(agent);
    if (/\/leads\/[^/]+$/.test(u)) return new Response("{}", { status: 404 });
    if (u.includes("/leads")) return json(leads);
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const Wrap = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <SearchProvider>
      <AgentProvider>{children}</AgentProvider>
    </SearchProvider>
  </MemoryRouter>
);

const expectNoRawTokens = () => {
  const text = document.body.textContent ?? "";
  for (const t of RAW) expect(text, t).not.toContain(t);
};

describe("no raw pipeline tokens on screen", () => {
  it("Prospect page: table, markers, popups and the drawer", async () => {
    render(<Wrap><ProspectPage /></Wrap>);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findAllByText("1 Main St");
    fireEvent.click(screen.getByRole("button", { name: "Open details for 1 Main St" }));
    await screen.findByText(/approval completed \(issue date\)/);
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    expectNoRawTokens();
  });

  it("Leads page", async () => {
    render(<Wrap><LeadsPage /></Wrap>);
    await screen.findByText("2 Oak Ave");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Permit state" }));
    await screen.findByRole("option", { name: /Stalled/ });
    expectNoRawTokens();
  });

  it("Agent panel: prose, chips and tool calls", async () => {
    render(<Wrap><AgentPanel /></Wrap>);
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "stalled permits?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByTestId("agent-answer")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /How this was answered/ }));
    expectNoRawTokens();
  });
});
