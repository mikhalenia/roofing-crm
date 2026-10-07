import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchProvider, useSearch } from "../state/SearchContext";
import { AgentPanel } from "./AgentPanel";

const api = vi.hoisted(() => ({ askAgent: vi.fn() }));
vi.mock("../api/crm", () => ({
  ...api,
  CrmError: class CrmError extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  },
}));
vi.mock("./PropertyDrawer", () => ({
  PropertyDrawer: ({ apn }: { apn: string | null }) => (apn ? <div>drawer {apn}</div> : null),
}));

function Probe() {
  const { state } = useSearch();
  return <div data-testid="probe">{JSON.stringify({ pin: state.pin, r: state.radiusMiles, f: state.filters })}</div>;
}

function setup() {
  return render(
    <MemoryRouter initialEntries={["/agent"]}>
      <SearchProvider>
        <Routes>
          <Route path="/agent" element={<AgentPanel />} />
          <Route path="/" element={<div>prospect page</div>} />
        </Routes>
        <Probe />
      </SearchProvider>
    </MemoryRouter>,
  );
}

const response = {
  answer: "Found 2 roofs.\nSecond line.",
  toolCalls: [
    { name: "search_aged_roofs", args: { minRoofAgeYears: 15 }, resultCount: 2 },
    { name: "create_lead", args: { apn: "X" }, resultCount: 0, error: "lead exists" },
  ],
  sources: [{ apn: "A1", address: "1 Main St", permitNumber: "BLD-1" }, { apn: "A2" }],
  resolvedFilters: { lat: 37.35, lon: -122.0, radiusMiles: 8, minRoofAgeYears: 20, permitState: "any" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.askAgent.mockResolvedValue(response);
});

const ask = async (q = "Which roofs are oldest?") => {
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: q } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

describe("AgentPanel", () => {
  it("renders answer, tool calls (with error) and sources", async () => {
    setup();
    await ask();
    expect(await screen.findByText(/Found 2 roofs\./)).toBeInTheDocument();
    expect(api.askAgent).toHaveBeenCalledWith({
      question: "Which roofs are oldest?",
      context: { lat: 37.3382, lon: -121.8863, radiusMiles: 5 },
    });
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    expect(screen.getByText(/search_aged_roofs/)).toBeInTheDocument();
    expect(screen.getByText(/2 results/)).toBeInTheDocument();
    expect(screen.getByText("lead exists")).toBeInTheDocument();
    fireEvent.click(screen.getByText("1 Main St · BLD-1"));
    expect(screen.getByText("drawer A1")).toBeInTheDocument();
    expect(screen.getByText("A2")).toBeInTheDocument();
  });

  it("example chips fill the question", () => {
    setup();
    fireEvent.click(screen.getByText("Save the three oldest roofs near Cupertino as leads"));
    expect(screen.getByLabelText("Question")).toHaveValue("Save the three oldest roofs near Cupertino as leads");
    expect(screen.getByText("Which properties within 5 miles of San José have roofs older than 15 years?")).toBeInTheDocument();
    expect(screen.getByText("Open roofing permits open for more than 3 years near Sunnyvale, who is the contractor?")).toBeInTheDocument();
  });

  it("applies resolved filters to search state and navigates to Prospect", async () => {
    setup();
    await ask();
    fireEvent.click(await screen.findByRole("button", { name: "Apply to map" }));
    expect(await screen.findByText("prospect page")).toBeInTheDocument();
    const probe = JSON.parse(screen.getByTestId("probe").textContent ?? "{}");
    expect(probe.pin).toEqual({ lat: 37.35, lon: -122.0 });
    expect(probe.r).toBe(8);
    expect(probe.f).toMatchObject({ minRoofAgeYears: 20, permitState: "any", roofingOnly: true });
  });

  it("disables Apply to map without resolvedFilters", async () => {
    api.askAgent.mockResolvedValue({ ...response, resolvedFilters: null });
    setup();
    await ask();
    expect(await screen.findByRole("button", { name: "Apply to map" })).toBeDisabled();
  });

  it("shows a friendly message on 429", async () => {
    const { CrmError } = await import("../api/crm");
    api.askAgent.mockRejectedValue(new CrmError("x", 429));
    setup();
    await ask();
    expect(await screen.findByText("Too many requests, try again in a minute")).toBeInTheDocument();
  });
});
