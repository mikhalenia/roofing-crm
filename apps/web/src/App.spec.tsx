import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import App from "./App";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  CircleMarker: () => null,
  Marker: () => null,
  Tooltip: () => null,
  useMap: () => ({
    getBounds: () => ({ contains: () => true }),
    getZoom: () => 11,
    setView: () => undefined,
    flyTo: () => undefined,
    fitBounds: () => undefined,
    on: () => undefined,
    off: () => undefined,
  }),
  useMapEvents: () => null,
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 500 })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("renders the app title and nav", async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Roofing CRM");
    expect(screen.getByText("Prospect")).toBeInTheDocument();
    const campaigns = screen.getByText("Campaigns").closest("[aria-disabled='true']");
    expect(campaigns).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Data unavailable" })).toBeInTheDocument();
  });
});
