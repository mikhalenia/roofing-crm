import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadRecord } from "@crm/contracts";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SearchProvider, useSearch } from "../state/SearchContext";
import { LeadsPage } from "./LeadsPage";

const api = vi.hoisted(() => ({
  listLeads: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
}));
vi.mock("../api/crm", () => api);

const mk = (apn: string, address: string): LeadRecord => ({
  apn, status: "new", notes: "", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  snapshot: {
    apn, situsAddress: address, lat: 37.3, lon: -121.9, bbbRating: null, distanceMiles: 1,
    roofAgeYears: 22, permitState: "open", daysOpen: 800,
    provenance: { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" },
  },
});

function FocusProbe() {
  const { state } = useSearch();
  return <div data-testid="focus">{JSON.stringify({ focus: state.focus, pin: state.pin })}</div>;
}

function setup() {
  return render(
    <MemoryRouter initialEntries={["/leads"]}>
      <SearchProvider>
        <Routes>
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/" element={<FocusProbe />} />
        </Routes>
      </SearchProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listLeads.mockResolvedValue([mk("A1", "1 Main St"), mk("A2", "2 Oak Ave")]);
  api.updateLead.mockResolvedValue(undefined);
  api.deleteLead.mockResolvedValue(undefined);
});

describe("LeadsPage", () => {
  it("renders leads", async () => {
    setup();
    expect(await screen.findByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByText("2 Oak Ave")).toBeInTheDocument();
    expect(screen.getAllByText("22 yrs")).toHaveLength(2);
    expect(api.listLeads).toHaveBeenCalledWith({});
  });

  it("shows an empty state", async () => {
    api.listLeads.mockResolvedValue([]);
    setup();
    expect(await screen.findByText(/No leads yet/)).toBeInTheDocument();
  });

  it("filters by status", async () => {
    setup();
    await screen.findByText("1 Main St");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Status" }));
    fireEvent.click(await screen.findByRole("option", { name: "qualified" }));
    await waitFor(() => expect(api.listLeads).toHaveBeenLastCalledWith({ status: "qualified" }));
  });

  it("scopes the list to the current pin and radius", async () => {
    setup();
    await screen.findByText("1 Main St");
    fireEvent.click(screen.getByLabelText("Within 5 mi of the Prospect pin (default: downtown San José)"));
    await waitFor(() =>
      expect(api.listLeads).toHaveBeenLastCalledWith({ lat: 37.3382, lon: -121.8863, radiusMiles: 5 }),
    );
  });

  it("debounces notes into a single PATCH", async () => {
    setup();
    const box = await screen.findByLabelText("Notes for 1 Main St");
    fireEvent.change(box, { target: { value: "ca" } });
    fireEvent.change(box, { target: { value: "call back" } });
    expect(api.updateLead).not.toHaveBeenCalled();
    await waitFor(() => expect(api.updateLead).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(api.updateLead).toHaveBeenCalledWith("A1", { notes: "call back" });
  });

  it("changes status via PATCH", async () => {
    setup();
    await screen.findByText("1 Main St");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Status for 1 Main St" }));
    fireEvent.click(await screen.findByRole("option", { name: "contacted" }));
    await waitFor(() => expect(api.updateLead).toHaveBeenCalledWith("A1", { status: "contacted" }));
  });

  it("deletes after confirmation", async () => {
    setup();
    await screen.findByText("1 Main St");
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 Main St" }));
    expect(api.deleteLead).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteLead).toHaveBeenCalledWith("A1"));
  });

  it("On map focuses the lead on the Prospect page without moving the pin", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Show 2 Oak Ave on map" }));
    const probe = JSON.parse((await screen.findByTestId("focus")).textContent ?? "{}");
    expect(probe.focus).toEqual({ apn: "A2", lat: 37.3, lon: -121.9 });
    expect(probe.pin).toEqual({ lat: 37.3382, lon: -121.8863 });
  });

  it("shows readable state, days open and created date", async () => {
    api.listLeads.mockResolvedValue([
      { ...mk("A3", "3 Elm St"), snapshot: { ...mk("A3", "3 Elm St").snapshot, permitState: "expired_unfinaled", daysOpen: 7842 } },
    ]);
    setup();
    expect(await screen.findByText("Stalled")).toBeInTheDocument();
    expect(screen.queryByText("expired_unfinaled")).toBeNull();
    expect(screen.getByText("7,842")).toBeInTheDocument();
    expect(screen.getByText("Oct 1, 2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes for 3 Elm St")).toHaveAttribute("placeholder", "Add a note…");
  });

  it("labels the radius switch with a moved pin and links to the map", async () => {
    const { radiusLabel } = await import("../components/LeadFilters");
    expect(radiusLabel({ lat: 37.35123, lon: -121.95678 }, 3)).toBe("Within 3 mi of the Prospect pin (37.351, -121.957)");
    setup();
    await screen.findByText("1 Main St");
    fireEvent.click(screen.getByRole("button", { name: "Change on map" }));
    expect(await screen.findByTestId("focus")).toBeInTheDocument();
  });

  it("shows a saved check after the debounced note PATCH", async () => {
    setup();
    const box = await screen.findByLabelText("Notes for 1 Main St");
    fireEvent.change(box, { target: { value: "call back" } });
    expect(await screen.findByLabelText("Note saved", {}, { timeout: 2000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText("Note saved")).toBeNull(), { timeout: 3000 });
  });
});
