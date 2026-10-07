import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProspectPage } from "./ProspectPage";

const hoisted = vi.hoisted(() => ({
  handlers: {} as { click?: ((e: { latlng: { lat: number; lng: number } }) => void) | undefined },
  markerProps: [] as Record<string, unknown>[],
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  CircleMarker: (props: Record<string, unknown>) => {
    hoisted.markerProps.push(props);
    return null;
  },
  Tooltip: () => null,
  useMap: () => ({ getBounds: () => ({ contains: () => true }), getZoom: () => 11, setView: () => undefined }),
  useMapEvents: (h: typeof hoisted.handlers) => {
    hoisted.handlers.click = h.click;
    return null;
  },
}));

const snapshot = { runId: "r1", manifestCid: "cid", syncedAt: null };
const item = {
  apn: "A", lat: 37.3, lon: -121.9, bbbRating: null, distanceMiles: 1, situsAddress: "1 Main St",
  roofAgeYears: 22, permitState: "open", daysOpen: 300,
  provenance: { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" },
};
let failSearch = false;
const fetchMock = vi.fn(async (url: string) => {
  if (url.includes("/api/health")) return new Response(JSON.stringify({ ok: true, snapshot }));
  if (failSearch) return new Response("{}", { status: 500 });
  return new Response(JSON.stringify({ snapshot, items: [item] }));
});

beforeEach(() => {
  failSearch = false;
  fetchMock.mockClear();
  hoisted.markerProps.length = 0;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const searchCalls = () => fetchMock.mock.calls.filter(([u]) => u.includes("/api/leads/")).length;

describe("ProspectPage", () => {
  it("result markers do not bubble clicks to the map", async () => {
    render(<ProspectPage />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("1 Main St");
    const results = hoisted.markerProps.filter((p) => p["bubblingMouseEvents"] === false);
    expect(results.length).toBeGreaterThan(0);
    expect(hoisted.markerProps.filter((p) => p["eventHandlers"] && p["bubblingMouseEvents"] !== false)).toHaveLength(0);
  });

  it("a failed search keeps old rows and shows the banner", async () => {
    render(<ProspectPage />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("1 Main St");
    failSearch = true;
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/Search failed: Pipeline API error 500/)).toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
  });

  it("an out-of-bounds pin skips the search, shows the error and keeps rows", async () => {
    render(<ProspectPage />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("1 Main St");
    const before = searchCalls();
    act(() => hoisted.handlers.click?.({ latlng: { lat: 40, lng: -100 } }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText(/Pin must be inside Santa Clara County/)).toBeInTheDocument());
    expect(searchCalls()).toBe(before);
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
  });
});
