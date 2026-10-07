import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchProvider, useSearch } from "../state/SearchContext";
import { AgentProvider, useAgent } from "../state/AgentContext";
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
  const { state, dispatch } = useSearch();
  const seed = () =>
    dispatch({
      type: "searchSucceeded",
      aged: { snapshot: { runId: "r", manifestCid: null, syncedAt: null }, items: [{ apn: "A1", lat: 37.3, lon: -121.9, bbbRating: null, distanceMiles: 1, provenance: { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" } }] },
      open: { snapshot: { runId: "r", manifestCid: null, syncedAt: null }, items: [] },
    });
  return (
    <>
      <div data-testid="probe">{JSON.stringify({ pin: state.pin, r: state.radiusMiles, f: state.filters, focus: state.focus })}</div>
      <button type="button" onClick={seed}>seed</button>
    </>
  );
}

function AskAboutButton() {
  const { askAbout } = useAgent();
  const lead = { apn: "A1", situsAddress: "1 Main St" } as Parameters<typeof askAbout>[0];
  return <button type="button" onClick={() => askAbout(lead)}>ask about</button>;
}

function setup() {
  return render(
    <MemoryRouter initialEntries={["/agent"]}>
      <SearchProvider>
        <AgentProvider>
        <Routes>
          <Route path="/agent" element={<AgentPanel />} />
          <Route path="/" element={<div>prospect page</div>} />
        </Routes>
        <AskAboutButton />
        </AgentProvider>
        <Probe />
      </SearchProvider>
    </MemoryRouter>,
  );
}

const response = {
  answer: "Found 2 roofs.\nSecond line.",
  toolCalls: [
    { name: "find_aged_roofs", args: { minRoofAgeYears: 15 }, resultCount: 2 },
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
    expect(screen.getByRole("button", { name: /How this was answered · 2 tool calls/ })).toBeInTheDocument();
    expect(screen.queryByText(/find_aged_roofs/)).toBeNull();
    expect(screen.getByText("Searched aged roofs · roof at least 15 yrs · 2 results")).toBeInTheDocument();
    expect(screen.getByText("Saved a lead · APN X · failed")).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "Show all 2 on map" }));
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

  it("Ask agent prefills the question and sends the selected property, highlighting its source", async () => {
    api.askAgent.mockResolvedValue({ ...response, sources: [{ apn: "A1", address: "1 Main St" }, { apn: "A2" }] });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "ask about" }));
    expect(screen.getByLabelText("Question")).toHaveValue(
      "Tell me about 1 Main St (APN A1): roof age, permits, contractor, and whether it is a good roofing lead",
    );
    expect(screen.getByText("About 1 Main St")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Found 2 roofs\./);
    expect(api.askAgent).toHaveBeenCalledWith({
      question: expect.stringContaining("APN A1"),
      context: { lat: 37.3382, lon: -121.8863, radiusMiles: 5, apn: "A1", address: "1 Main St" },
    });
    expect(screen.getByRole("button", { name: "1 Main St" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "A2" })).not.toHaveAttribute("aria-current");
  });

  it("an example question clears the selected property", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "ask about" }));
    fireEvent.click(screen.getByText("Save the three oldest roofs near Cupertino as leads"));
    expect(screen.queryByText("About 1 Main St")).toBeNull();
  });

  it("a source in the current results focuses it on the map", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "seed" }));
    await ask();
    fireEvent.click(await screen.findByText("1 Main St · BLD-1"));
    expect(await screen.findByText("prospect page")).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId("probe").textContent ?? "{}").focus).toEqual({ apn: "A1" });
    expect(screen.queryByText("drawer A1")).toBeNull();
  });
});
