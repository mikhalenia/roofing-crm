import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineLead } from "@crm/contracts";
import type { ResultRow } from "../state/search";
import { MapView, radiusBounds } from "./MapView";

const h = vi.hoisted(() => ({
  markers: [] as Record<string, unknown>[],
  popups: [] as Record<string, unknown>[],
  pins: [] as Record<string, unknown>[],
  mounted: [] as string[],
  map: {
    getBounds: () => ({ contains: () => true }),
    getZoom: () => 11,
    setView: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    latLngToContainerPoint: vi.fn(() => ({ x: 340, y: 8 })),
    getSize: () => ({ x: 680, y: 420 }),
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  CircleMarker: (props: Record<string, unknown>) => {
    h.markers.push(props);
    // Leaflet applies className only when the layer is created, i.e. on mount.
    useEffect(() => {
      if (typeof props["className"] === "string") h.mounted.push(props["className"]);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  },
  Marker: (props: Record<string, unknown>) => {
    h.pins.push(props);
    return null;
  },
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
  rows,
  onPin: vi.fn(),
  onSelect: vi.fn(),
  onAsk: vi.fn(),
};

beforeEach(() => {
  h.markers.length = 0;
  h.popups.length = 0;
  h.pins.length = 0;
  h.mounted.length = 0;
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

  it("focus on a result flies to it and opens its popup", () => {
    const onFocusDone = vi.fn();
    render(<MapView {...props} focus={{ apn: "A2" }} onFocusDone={onFocusDone} />);
    expect(h.map.flyTo).toHaveBeenCalledWith([37.32, -121.92], 16);
    expect(screen.getByTestId("popup")).toHaveAttribute("data-position", "37.32,-121.92");
    expect(screen.getByText("popup A2")).toBeInTheDocument();
    expect(h.popups.at(-1)!["autoPan"]).toBe(false);
    expect(onFocusDone).toHaveBeenCalledWith(true);
  });

  it("focus on an unknown APN flies to its coordinates without a popup", () => {
    const onFocusDone = vi.fn();
    render(<MapView {...props} focus={{ apn: "ZZ", lat: 37.4, lon: -122 }} onFocusDone={onFocusDone} />);
    expect(h.map.flyTo).toHaveBeenCalledWith([37.4, -122], 16);
    expect(screen.queryByTestId("popup")).toBeNull();
    expect(onFocusDone).toHaveBeenCalledWith(false);
  });

  it("shows a hover tooltip per marker and reports hover in and out", () => {
    const onHover = vi.fn();
    render(<MapView {...props} onHover={onHover} />);
    const tooltip = markerFor("A1")["children"] as { props: Record<string, unknown> };
    expect(tooltip.props).toMatchObject({ direction: "top", sticky: false, className: "result-tooltip" });
    const { container } = render(<>{tooltip.props["children"] as ReactNode}</>);
    expect(container.textContent).toBe("A1 Main StRoof 22 yrsNo permit");
    expect(markerFor("A1")["className"]).toBe("result-marker result-marker--aged_roof");
    const handlers = markerFor("A1")["eventHandlers"] as Record<string, (e?: unknown) => void>;
    const tip = { options: { direction: "top", offset: [0, -6] }, update: vi.fn() };
    const target = { getTooltip: () => tip, getLatLng: () => ({ lat: 37.31, lng: -121.91 }) };
    act(() => handlers["mouseover"]!({ target }));
    // A marker 8 px below the top edge opens its card downward.
    expect(tip.options).toEqual({ direction: "bottom", offset: [0, 8] });
    expect(tip.update).toHaveBeenCalled();
    expect(onHover).toHaveBeenLastCalledWith("A1");
    act(() => handlers["mouseout"]!());
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("remounts a marker when its kind changes so its class stays right", () => {
    const { rerender } = render(<MapView {...props} />);
    const changed = [{ ...rows[0]!, signals: new Set(["open_permit"]) } as ResultRow, rows[1]!];
    rerender(<MapView {...props} rows={changed} />);
    expect(h.mounted).toContain("result-marker result-marker--open_permit");
  });

  it("enlarges the hovered marker", () => {
    render(<MapView {...props} hoverApn="A2" />);
    expect(markerFor("A2")["radius"]).toBeGreaterThan(markerFor("A1")["radius"] as number);
  });

  it("dragging the pin moves the search center", () => {
    render(<MapView {...props} />);
    const pin = h.pins.at(-1)!;
    expect(pin["draggable"]).toBe(true);
    expect(pin["position"]).toEqual([37.3, -121.9]);
    const dragend = (pin["eventHandlers"] as { dragend: (e: unknown) => void }).dragend;
    act(() => dragend({ target: { getLatLng: () => ({ lat: 37.36, lng: -121.97 }) } }));
    expect(props.onPin).toHaveBeenCalledWith({ lat: 37.36, lon: -121.97 });
  });

  it("fits the map to the search circle, never to the result markers", () => {
    render(<MapView {...props} rows={[rows[0]!, row("FAR", 37.9, -122.6)]} />);
    const circle = radiusBounds(props.pin, 5);
    expect(h.map.fitBounds).toHaveBeenCalledTimes(1);
    expect(h.map.fitBounds).toHaveBeenLastCalledWith(circle, expect.objectContaining({ padding: [12, 12] }));
    const [[s, w], [n, e]] = circle;
    expect(n - s).toBeCloseTo(10 / 69, 6);
    expect(w).toBeLessThan(-121.9);
    expect(e).toBeGreaterThan(-121.9);
  });

  it("refits only when the pin or the radius changes, keeping the user's zoom otherwise", () => {
    const { rerender } = render(<MapView {...props} />);
    expect(h.map.fitBounds).toHaveBeenCalledTimes(1);
    // New results, a hover and a new object for the same pin do not refit.
    rerender(<MapView {...props} rows={[rows[0]!]} />);
    rerender(<MapView {...props} rows={[rows[0]!]} hoverApn="A1" pin={{ ...props.pin }} />);
    expect(h.map.fitBounds).toHaveBeenCalledTimes(1);
    rerender(<MapView {...props} pin={{ lat: 37.35, lon: -121.95 }} />);
    expect(h.map.fitBounds).toHaveBeenCalledTimes(2);
    rerender(<MapView {...props} pin={{ lat: 37.35, lon: -121.95 }} radiusMiles={2} />);
    expect(h.map.fitBounds).toHaveBeenCalledTimes(3);
    expect(h.map.fitBounds).toHaveBeenLastCalledWith(radiusBounds({ lat: 37.35, lon: -121.95 }, 2), expect.anything());
  });

  it("a late resize does not refit", () => {
    vi.useFakeTimers();
    try {
      render(<MapView {...props} />);
      const settle = h.map.on.mock.calls.find(([ev]) => ev === "resize")?.[1] as () => void;
      vi.advanceTimersByTime(5000);
      act(() => settle());
      expect(h.map.fitBounds).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

});
