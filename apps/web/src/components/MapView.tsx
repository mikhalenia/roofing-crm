import { useEffect, useMemo, useState } from "react";
import type { PipelineLead } from "@crm/contracts";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { markerColor, type ResultRow } from "../state/search";
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
}

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

function ResultPopup({
  lead,
  onClosed,
  onSelect,
  onAsk,
}: { lead: PipelineLead; onClosed: () => void } & Pick<Props, "onSelect" | "onAsk">) {
  // Popup re-opens whenever `position` changes identity, so keep it stable.
  const position = useMemo<[number, number]>(() => [lead.lat, lead.lon], [lead.lat, lead.lon]);
  return (
    // Closing (x, Escape, a map click) removes the layer; the parent ignores a replaced popup.
    <Popup position={position} eventHandlers={{ remove: onClosed }}>
      <MarkerPopup lead={lead} onDetails={onSelect} onAsk={onAsk} />
    </Popup>
  );
}

export function MapView({ pin, radiusMiles, minRoofAgeYears, rows, onPin, onSelect, onAsk }: Props) {
  const [popupApn, setPopupApn] = useState<string | null>(null);
  const popupRow = popupApn ? rows.find((r) => r.lead.apn === popupApn) : undefined;
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
      <CircleMarker center={[pin.lat, pin.lon]} radius={5} interactive={false} pathOptions={{ color: "#000", fillColor: "#fff", fillOpacity: 1, weight: 2 }} />
      <Circle center={[pin.lat, pin.lon]} radius={radiusMiles * MILES_TO_METERS} pathOptions={{ color: "#1565c0", fillOpacity: 0.05 }} />
      {rows.map((row) => {
        const color = markerColor(row, minRoofAgeYears);
        return (
          <CircleMarker
            key={row.lead.apn}
            center={[row.lead.lat, row.lead.lon]}
            radius={7}
            bubblingMouseEvents={false}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
            eventHandlers={{ click: () => setPopupApn(row.lead.apn) }}
          >
            <Tooltip>{row.lead.situsAddress ?? row.lead.apn}</Tooltip>
          </CircleMarker>
        );
      })}
      {popupRow && (
        <ResultPopup
          key={popupRow.lead.apn}
          lead={popupRow.lead}
          onClosed={() => setPopupApn((cur) => (cur === popupRow.lead.apn ? null : cur))}
          onSelect={onSelect}
          onAsk={onAsk}
        />
      )}
    </MapContainer>
  );
}
