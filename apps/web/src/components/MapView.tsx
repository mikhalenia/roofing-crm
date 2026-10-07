import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { markerColor, type ResultRow } from "../state/search";

const MILES_TO_METERS = 1609.344;

interface Props {
  pin: { lat: number; lon: number };
  radiusMiles: number;
  minRoofAgeYears: number;
  rows: ResultRow[];
  onPin: (pin: { lat: number; lon: number }) => void;
  onSelect: (apn: string) => void;
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

export function MapView({ pin, radiusMiles, minRoofAgeYears, rows, onPin, onSelect }: Props) {
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
      <Marker position={[pin.lat, pin.lon]} />
      <Circle center={[pin.lat, pin.lon]} radius={radiusMiles * MILES_TO_METERS} pathOptions={{ color: "#1565c0", fillOpacity: 0.05 }} />
      {rows.map((row) => {
        const color = markerColor(row, minRoofAgeYears);
        return (
          <CircleMarker
            key={row.lead.apn}
            center={[row.lead.lat, row.lead.lon]}
            radius={7}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
            eventHandlers={{ click: () => onSelect(row.lead.apn) }}
          >
            <Tooltip>{row.lead.situsAddress ?? row.lead.apn}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
