import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentResponse } from "@crm/contracts";
import { AgentAnswer, sourcesHeader } from "./AgentAnswer";

const sources = Array.from({ length: 25 }, (_, i) => ({ apn: `472230${String(i).padStart(2, "0")}`, address: `${i + 1} Elm St` }));
const result: AgentResponse = {
  answer: "At least 200 roofs match; 25 shown. Permit P-1 is expired_unfinaled.\nSOURCES: 47223000, 47223001",
  toolCalls: [
    { name: "geocode_place", args: { name: "San José" }, resultCount: 1 },
    { name: "find_aged_roofs", args: { lat: 37.33821, lon: -121.88634, radiusMiles: 5, minRoofAgeYears: 15 }, resultCount: 200, capped: true, shown: 25 },
  ],
  sources,
  resolvedFilters: { lat: 37.3382, lon: -121.8863, radiusMiles: 5, minRoofAgeYears: 15 },
};

const setup = (over: Partial<AgentResponse> = {}) => {
  const props = { result: { ...result, ...over }, targetApn: "47223001", onSource: vi.fn(), onApply: vi.fn() };
  render(<AgentAnswer {...props} />);
  return props;
};

describe("AgentAnswer", () => {
  it("strips the SOURCES line and raw tokens from the prose", () => {
    setup();
    const answer = screen.getByTestId("agent-answer");
    expect(answer).toHaveTextContent("At least 200 roofs match; 25 shown. Permit P-1 is stalled.");
    expect(answer).not.toHaveTextContent("SOURCES");
  });

  it("explains how many sources out of how many matches", () => {
    setup();
    expect(screen.getByText("Sources · 25 of at least 200 matching properties (the agent reviewed the first 25)")).toBeInTheDocument();
    expect(sourcesHeader({ ...result, toolCalls: [] })).toBe("Sources · 25");
  });

  it("shows 8 chips and a +N more toggle, keeps chips clickable and highlights the target", () => {
    const props = setup();
    const chips = screen.getByTestId("agent-sources");
    expect(chips.querySelectorAll(".MuiChip-root")).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: "+17 more" }));
    expect(chips.querySelectorAll(".MuiChip-root")).toHaveLength(26);
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Elm St" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "3 Elm St" }));
    expect(props.onSource).toHaveBeenCalledWith("47223002");
  });

  it("offers Show all on map and humanized, collapsed tool calls", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Show all 200 on map" }));
    expect(props.onApply).toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: /How this was answered · 2 tool calls/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Searched aged roofs · 5 mi around 37.3382, -121.8863, roof at least 15 yrs · at least 200 results")).toBeInTheDocument();
    expect(screen.getByText('Located a place · "San José" · 1 result')).toBeInTheDocument();
  });
});
