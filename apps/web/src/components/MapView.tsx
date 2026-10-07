import { useEffect, useMemo, useState } from "react";
import type { PipelineLead } from "@crm/contracts";
import { divIcon, type LeafletEventHandlerFnMap, type Marker as LeafletMarker } from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { markerColor, type Focus, type ResultRow } from "../state/search";
import { hoverText } from "../state/labels";
import { MarkerPopup } from "./MarkerPopup";

const MILES_TO_METERS = 1609.344;

interface Props {
  pin: { lat: number; lon: number };
  radiusMiles: number;
  minRoofAgeYears: number;
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

function KeepPinVisible({ pin }: Pick<Props, "pin">) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().contains([pin.lat, pin.lon])) {
      map.setView([pin.lat, pin.lon], map.getZoom(), { animate: false });
    }
  }, [map, pin.lat, pin.lon]);
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
  const { pin, radiusMiles, minRoofAgeYears, rows, onPin, onSelect, onAsk, focus = null, onFocusDone } = props;
  const { hoverApn = null, onHover } = props;
  const [popup, setPopup] = useState<OpenPopup | null>(null);
  const popupRow = popup ? rows.find((r) => r.lead.apn === popup.apn) : undefined;
  return (
    <MapContainer
      center={[pin.lat, pin.lon]}
      zoom={11}
      style={{ height: "100%", width: "100%", minHeight: 360 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <ClickToPin onPin={onPin} />
      <KeepPinVisible pin={pin} />
      <FocusOn
        focus={focus}
        rows={rows}
        onOpen={(apn) => setPopup({ apn, autoPan: false })}
        onDone={(found) => onFocusDone?.(found)}
      />
      <Circle center={[pin.lat, pin.lon]} radius={radiusMiles * MILES_TO_METERS} pathOptions={{ color: "#1565c0", fillOpacity: 0.05 }} />
      {rows.map((row) => {
        const color = markerColor(row, minRoofAgeYears);
        const hovered = row.lead.apn === hoverApn;
        return (
          <CircleMarker
            key={row.lead.apn}
            center={[row.lead.lat, row.lead.lon]}
            radius={hovered ? 10 : 7}
            bubblingMouseEvents={false}
            pathOptions={{ color: hovered ? "#212121" : color, fillColor: color, fillOpacity: 0.8 }}
            eventHandlers={{
              click: () => setPopup({ apn: row.lead.apn, autoPan: true }),
              mouseover: () => onHover?.(row.lead.apn),
              mouseout: () => onHover?.(null),
            }}
          >
            <Tooltip>{hoverText(row.lead)}</Tooltip>
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
