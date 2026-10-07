import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapCard, statusCaption } from "./MapCard";

describe("MapCard", () => {
  it("frames the map with title, radius chip, legend and status", () => {
    const onToggleAgent = vi.fn();
    render(
      <MapCard radiusMiles={5} pin={{ lat: 37.3382, lon: -121.8863 }} total={203} capped={false} inView={150} loading={false} agentOpen={false} onToggleAgent={onToggleAgent}>
        <div>map</div>
      </MapCard>,
    );
    expect(screen.getByRole("heading", { name: "Santa Clara County" })).toBeInTheDocument();
    expect(screen.getByText("5-mile radius")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Map legend" })).toHaveTextContent(/Aged roof.*Open permit.*Stalled permit.*Other.*Larger dot/);
    expect(screen.getByTestId("map-status")).toHaveTextContent("203 matching properties in this radius");
    expect(screen.getByText(/Search center: 37.3382, -121.8863/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    expect(onToggleAgent).toHaveBeenCalled();
  });

  it("words capped and dense views", () => {
    expect(statusCaption({ total: 395, capped: true, inView: 120 })).toBe(
      "395 properties shown · each search returns at most 200 records per signal, so more match in this radius",
    );
    expect(statusCaption({ total: 1, capped: false, inView: 401 })).toBe(
      "1 matching property in this radius · 401 markers in view, zoom in for detail",
    );
  });
});
