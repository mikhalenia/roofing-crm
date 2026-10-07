import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PipelineLead } from "@crm/contracts";
import {
  divIcon,
  type CircleMarker as LeafletCircleMarker,
  type LeafletEventHandlerFnMap,
  type LeafletMouseEvent,
  type Map as LeafletMap,
  type Marker as LeafletMarker,
} from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Focus, ResultRow } from "../state/search";
import { hoverLines } from "../labels";
import { PIN_COLOR, markerKind, markerStyle, tooltipPlacement } from "./mapStyle";
import { MarkerPopup } from "./MarkerPopup";

const MILES_TO_METERS = 1609.344;

interface Props {
  pin: { lat: number; lon: number };
  radiusMiles: number;
  rows: ResultRow[];
  onPin: (pin: { lat: number; lon: number }) => void;
  /** Opens the property drawer. */
  onSelect: (apn: string) => void;
  /** Opens the agent panel with a question about this property. */
  onAsk: (lead: PipelineLead) => void;
  /** A property to pan to; its popup opens when it is in `rows`. */
  focus?: Focus | null;
  /** Called once per focus; `found` is false when the APN is not in `rows`. */
  onFocusDone?: (found: boolean) => void;
  /** The result hovered here or in the table. */
  hoverApn?: string | null;
  onHover?: (apn: string | null) => void;
  /** Number of result markers inside the visible map bounds (after moves, zooms and new results). */
  onViewCount?: (count: number) => void;
  /** More markers in view than DENSE_MARKERS: draw them smaller. The parent owns the count. */
  dense?: boolean;
}

/** The search center: a dark dot with a white ring, draggable to move the search. */
const PIN_ICON = divIcon({ className: "search-pin", iconSize: [16, 16], iconAnchor: [8, 8] });

function SearchPin({ pin, onPin }: Pick<Props, "pin" | "onPin">) {
  const position = useMemo<[number, number]>(() => [pin.lat, pin.lon], [pin.lat, pin.lon]);
  const handlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      dragend: (e) => {
        const { lat, lng } = (e.target as LeafletMarker).getLatLng();
        onPin({ lat, lon: lng });
      },
    }),
    [onPin],
  );
  return (
    <Marker position={position} icon={PIN_ICON} draggable keyboard={false} title="Search center (drag to move)" eventHandlers={handlers} />
  );
}

const FOCUS_ZOOM = 16;

function ClickToPin({ onPin }: Pick<Props, "onPin">) {
  useMapEvents({
    click: (e) => onPin({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
}

/** Exposes the Leaflet map to MapView's own event handlers. */
function MapHandle({ mapRef }: { mapRef: { current: LeafletMap | null } }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

/** Points a marker's hover card away from the nearest map edge before it shows. */
function placeTooltip(map: LeafletMap | null, e: LeafletMouseEvent) {
  const layer = e.target as LeafletCircleMarker;
  const tip = layer.getTooltip?.();
  if (!map || !tip) return;
  const { direction, offset } = tooltipPlacement(map.latLngToContainerPoint(layer.getLatLng()), map.getSize());
  tip.options.direction = direction;
  tip.options.offset = offset;
  tip.update();
}

const MILES_PER_DEGREE_LAT = 69.0;

/** The search circle's bounding box: what the map shows after every search. */
export function radiusBounds(pin: { lat: number; lon: number }, radiusMiles: number): [[number, number], [number, number]] {
  const dLat = radiusMiles / MILES_PER_DEGREE_LAT;
  const dLon = radiusMiles / (MILES_PER_DEGREE_LAT * Math.cos((pin.lat * Math.PI) / 180));
  return [
    [pin.lat - dLat, pin.lon - dLon],
    [pin.lat + dLat, pin.lon + dLon],
  ];
}

/**
 * Fits the map to the search circle when the pin, radius or results change. The result markers
 * are never used for fitting, so a small result set cannot zoom the map out past the circle.
 */
function FitRadius({ pin, radiusMiles, rows }: Pick<Props, "pin" | "radiusMiles" | "rows">) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(radiusBounds(pin, radiusMiles), { padding: [12, 12], animate: false });
  }, [map, pin, radiusMiles, rows]);
  return null;
}

function FocusOn({
  focus,
  rows,
  onOpen,
  onDone,
}: Pick<Props, "focus" | "rows" | "onFocusDone"> & { onOpen: (apn: string) => void; onDone: (found: boolean) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const row = rows.find((r) => r.lead.apn === focus.apn);
    const lat = row?.lead.lat ?? focus.lat;
    const lon = row?.lead.lon ?? focus.lon;
    if (lat != null && lon != null) map.flyTo([lat, lon], Math.max(map.getZoom(), FOCUS_ZOOM));
    if (row) onOpen(row.lead.apn);
    onDone(row != null);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Leaflet does not notice container resizes (e.g. the agent panel opening); re-measure on resize. */
function FitContainer() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || typeof map.getContainer !== "function") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function TrackView({ rows, onCount }: { rows: ResultRow[]; onCount: (n: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const count = () => {
      const b = map.getBounds();
      onCount(rows.filter((r) => b.contains([r.lead.lat, r.lead.lon])).length);
    };
    count();
    map.on("moveend", count);
    return () => {
      map.off("moveend", count);
    };
  }, [map, rows, onCount]);
  return null;
}

function HoverCard({ lead }: { lead: PipelineLead }) {
  const [title, roof, permit] = hoverLines(lead);
  return (
    <>
      <strong>{title}</strong>
      <br />
      {roof}
      <br />
      {permit}
    </>
  );
}

interface OpenPopup {
  apn: string;
  /** False when opened by a focus: flyTo already centers it and autoPan would cut the flight short. */
  autoPan: boolean;
}

function ResultPopup({
  lead,
  autoPan,
  onClosed,
  onSelect,
  onAsk,
}: { lead: PipelineLead; autoPan: boolean; onClosed: () => void } & Pick<Props, "onSelect" | "onAsk">) {
  // Popup re-opens whenever `position` changes identity, so keep it stable.
  const position = useMemo<[number, number]>(() => [lead.lat, lead.lon], [lead.lat, lead.lon]);
  return (
    // Closing (x, Escape, a map click) removes the layer; the parent ignores a replaced popup.
    <Popup position={position} autoPan={autoPan} eventHandlers={{ remove: onClosed }}>
      <MarkerPopup lead={lead} onDetails={onSelect} onAsk={onAsk} />
    </Popup>
  );
}

export function MapView(props: Props) {
  const { pin, radiusMiles, rows, onPin, onSelect, onAsk, focus = null, onFocusDone } = props;
  const { hoverApn = null, onHover, onViewCount, dense = false } = props;
  const [popup, setPopup] = useState<OpenPopup | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const countInView = useCallback((n: number) => onViewCount?.(n), [onViewCount]);
  const popupRow = popup ? rows.find((r) => r.lead.apn === popup.apn) : undefined;
  return (
    <MapContainer
      center={[pin.lat, pin.lon]}
      zoom={11}
      // Quarter steps let fitBounds fill the map with the search circle instead of snapping a level out.
      zoomSnap={0.25}
      style={{ height: "100%", width: "100%", minHeight: 360 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <ClickToPin onPin={onPin} />
      <FitRadius pin={pin} radiusMiles={radiusMiles} rows={rows} />
      <MapHandle mapRef={mapRef} />
      <FocusOn
        focus={focus}
        rows={rows}
        onOpen={(apn) => setPopup({ apn, autoPan: false })}
        onDone={(found) => onFocusDone?.(found)}
      />
      <FitContainer />
      <TrackView rows={rows} onCount={countInView} />
      <Circle
        center={[pin.lat, pin.lon]}
        radius={radiusMiles * MILES_TO_METERS}
        interactive={false}
        className="search-radius"
        pathOptions={{ color: PIN_COLOR, weight: 2, fillColor: PIN_COLOR, fillOpacity: 0.05 }}
      />
      {popupRow && (
        <CircleMarker
          center={[popupRow.lead.lat, popupRow.lead.lon]}
          radius={16}
          interactive={false}
          className="result-halo"
          pathOptions={{ stroke: false, fillColor: PIN_COLOR, fillOpacity: 0.18 }}
        />
      )}
      {rows.map((row) => {
        const focused = row.lead.apn === hoverApn || row.lead.apn === popup?.apn;
        const style = markerStyle(row.signals, focused, dense);
        return (
          <CircleMarker
            // className is applied only at creation, so a kind change must remount the marker.
            key={`${row.lead.apn}:${markerKind(row.signals)}`}
            center={[row.lead.lat, row.lead.lon]}
            radius={style.radius}
            className={style.className}
            bubblingMouseEvents={false}
            pathOptions={style.pathOptions}
            eventHandlers={{
              click: () => setPopup({ apn: row.lead.apn, autoPan: true }),
              mouseover: (e: LeafletMouseEvent) => {
                placeTooltip(mapRef.current, e);
                onHover?.(row.lead.apn);
              },
              mouseout: () => onHover?.(null),
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} sticky={false} className="result-tooltip">
              <HoverCard lead={row.lead} />
            </Tooltip>
          </CircleMarker>
        );
      })}
      <SearchPin pin={pin} onPin={onPin} />
      {popupRow && (
        <ResultPopup
          key={popupRow.lead.apn}
          lead={popupRow.lead}
          autoPan={popup?.autoPan ?? true}
          onClosed={() => setPopup((cur) => (cur?.apn === popupRow.lead.apn ? null : cur))}
          onSelect={onSelect}
          onAsk={onAsk}
        />
      )}
    </MapContainer>
  );
}
