import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapCard, statusCaption } from "./MapCard";

describe("MapCard", () => {
  it("frames the map with title, radius chip, legend and status", () => {
    const onToggleAgent = vi.fn();
    render(
      <MapCard radiusMiles={5} pin={{ lat: 37.3382, lon: -121.8863 }} total={203} capped={false} matching={12} inView={150} loading={false} agentOpen={false} onToggleAgent={onToggleAgent}>
        <div>map</div>
      </MapCard>,
    );
    expect(screen.getByRole("heading", { name: "Santa Clara County" })).toBeInTheDocument();
    expect(screen.getByText("5-mile radius")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Map legend" })).toHaveTextContent(/Aged roof.*Open permit.*Stalled permit.*Other.*Larger dot/);
    expect(screen.getByTestId("map-status")).toHaveTextContent("Showing 203 properties in this radius · 12 match the current filters");
    expect(screen.getByText(/Search center: 37.3382, -121.8863/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    expect(onToggleAgent).toHaveBeenCalled();
  });

  it("words capped and dense views", () => {
    expect(statusCaption({ total: 400, capped: true, matching: 3, inView: 120 })).toBe(
      "Showing at least 400 properties in this radius · 3 match the current filters",
    );
    expect(statusCaption({ total: 1, capped: false, matching: 0, inView: 401 })).toBe(
      "Showing 1 property in this radius · 0 match the current filters · 401 markers — zoom in for detail",
    );
  });
});
