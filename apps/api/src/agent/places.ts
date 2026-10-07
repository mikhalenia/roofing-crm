/** City centroids for the 15 Santa Clara County cities (well-known coordinates). */
export const PLACES: Record<string, { lat: number; lon: number }> = {
  "San José": { lat: 37.3382, lon: -121.8863 },
  "Santa Clara": { lat: 37.3541, lon: -121.9552 },
  Sunnyvale: { lat: 37.3688, lon: -122.0363 },
  "Mountain View": { lat: 37.3861, lon: -122.0839 },
  "Palo Alto": { lat: 37.4419, lon: -122.143 },
  Cupertino: { lat: 37.323, lon: -122.0322 },
  Milpitas: { lat: 37.4323, lon: -121.8996 },
  Campbell: { lat: 37.2872, lon: -121.95 },
  "Los Gatos": { lat: 37.2358, lon: -121.9624 },
  Saratoga: { lat: 37.2638, lon: -122.023 },
  "Los Altos": { lat: 37.3852, lon: -122.1141 },
  "Los Altos Hills": { lat: 37.3797, lon: -122.1375 },
  "Morgan Hill": { lat: 37.1305, lon: -121.6544 },
  Gilroy: { lat: 37.0058, lon: -121.5683 },
  "Monte Sereno": { lat: 37.2363, lon: -121.9924 },
};

const NOISE = new Set([
  "ca",
  "california",
  "downtown",
  "near",
  "in",
  "around",
  "city",
  "of",
  "usa",
]);

/** Lowercase, drop accents and punctuation, and remove filler words like "near" or "CA". */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .join(" ");
}

const INDEX = new Map(Object.keys(PLACES).map((place) => [normalize(place), place]));

export function geocodePlace(name: string): { place: string; lat: number; lon: number } | null {
  const place = INDEX.get(normalize(name));
  const coords = place ? PLACES[place] : undefined;
  return place && coords ? { place, ...coords } : null;
}
