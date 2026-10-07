import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineLead } from "@crm/contracts";
import type { ResultRow } from "../state/search";
import { MapView } from "./MapView";

const h = vi.hoisted(() => ({
  markers: [] as Record<string, unknown>[],
  popups: [] as Record<string, unknown>[],
  map: {
    getBounds: () => ({ contains: () => true }),
    getZoom: () => 11,
    setView: vi.fn(),
    flyTo: vi.fn(),
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  CircleMarker: (props: Record<string, unknown>) => {
    h.markers.push(props);
    return null;
  },
  Marker: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Popup: (props: { children: ReactNode; position: [number, number] }) => {
    h.popups.push(props);
    return <div data-testid="popup" data-position={props.position.join(",")}>{props.children}</div>;
  },
  useMap: () => h.map,
  useMapEvents: () => null,
}));
vi.mock("./MarkerPopup", () => ({
  MarkerPopup: ({ lead, onAsk }: { lead: PipelineLead; onAsk: (l: PipelineLead) => void }) => (
    <button type="button" onClick={() => onAsk(lead)}>popup {lead.apn}</button>
  ),
}));

const row = (apn: string, lat: number, lon: number): ResultRow => ({
  lead: {
    apn, situsAddress: `${apn} Main St`, lat, lon, bbbRating: null, distanceMiles: 1, roofAgeYears: 22,
    provenance: { propertySourceUrl: "u", propertySourceVersion: "v", fetchedAt: "t" },
  } as PipelineLead,
  signals: new Set(["aged_roof"]),
});
const rows = [row("A1", 37.31, -121.91), row("A2", 37.32, -121.92)];

const markerFor = (apn: string) =>
  [...h.markers].reverse().find((p) => {
    const c = p["center"] as [number, number];
    const r = rows.find((x) => x.lead.apn === apn)!;
    return c[0] === r.lead.lat && c[1] === r.lead.lon;
  })!;

const props = {
  pin: { lat: 37.3, lon: -121.9 },
  radiusMiles: 5,
  minRoofAgeYears: 15,
  rows,
  onPin: vi.fn(),
  onSelect: vi.fn(),
  onAsk: vi.fn(),
};

beforeEach(() => {
  h.markers.length = 0;
  h.popups.length = 0;
  vi.clearAllMocks();
});

describe("MapView", () => {
  it("opens the popup for a clicked marker at its position and closes it on remove", () => {
    render(<MapView {...props} />);
    expect(screen.queryByTestId("popup")).toBeNull();
    act(() => (markerFor("A2")["eventHandlers"] as { click: () => void }).click());
    expect(screen.getByTestId("popup")).toHaveAttribute("data-position", "37.32,-121.92");
    fireEvent.click(screen.getByText("popup A2"));
    expect(props.onAsk).toHaveBeenCalledWith(rows[1]!.lead);
    act(() => (h.popups.at(-1)!["eventHandlers"] as { remove: () => void }).remove());
    expect(screen.queryByTestId("popup")).toBeNull();
  });

  it("switching markers keeps the new popup when the old one is removed", () => {
    render(<MapView {...props} />);
    act(() => (markerFor("A1")["eventHandlers"] as { click: () => void }).click());
    const first = h.popups.at(-1)!;
    act(() => (markerFor("A2")["eventHandlers"] as { click: () => void }).click());
    act(() => (first["eventHandlers"] as { remove: () => void }).remove());
    expect(screen.getByText("popup A2")).toBeInTheDocument();
  });
});
