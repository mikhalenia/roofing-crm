// Local dev stub for the pipeline API. Only used when VITE_USE_STUB === "true".
const snapshot = { runId: "stub-run-1", manifestCid: "bafystubmanifest", syncedAt: "2026-10-01T00:00:00Z" };
const provenance = {
  propertySourceUrl: "https://example.test/parcels",
  propertySourceVersion: "stub-1",
  permitSourceUrl: "https://example.test/permits",
  permitSourceVersion: "stub-1",
  fetchedAt: "2026-10-01T00:00:00Z",
};
const base = { bbbRating: null, provenance };
interface Item {
  [k: string]: unknown;
  apn: string;
  situsAddress: string;
  situsCity: string;
  lat: number;
  lon: number;
  roofAgeYears: number | null;
  permitState: string;
  daysOpen: number | null;
  permitNumber: string;
  contractorCompany?: string;
  cslbLicenseNumber?: string;
  cslbStatus?: string;
}
const items: Item[] = [
  { ...base, apn: "264-01-001", situsAddress: "100 N 1st St", situsCity: "San Jose", situsZip: "95112", lat: 37.3382, lon: -121.8863, roofAgeYears: 24, roofAgeAnchor: "final_date", roofAgeConfidence: "high", roofDate: "2002-06-01", permitNumber: "BLD-2002-1", permitState: "finaled", daysOpen: null, distanceMiles: 0.1, ownerName: "Jane Doe", ownerObservedOn: "2025-01-01" },
  { ...base, apn: "264-01-002", situsAddress: "200 S 2nd St", situsCity: "San Jose", situsZip: "95113", lat: 37.345, lon: -121.89, roofAgeYears: 18, roofAgeAnchor: "approval_complete_issue_date", roofAgeConfidence: "medium", roofDate: "2008-03-01", permitNumber: "BLD-2008-2", permitState: "open", daysOpen: 640, contractorCompany: "Acme Roofing", cslbLicenseNumber: "123456", cslbStatus: "active", distanceMiles: 0.6 },
  { ...base, apn: "264-01-003", situsAddress: "300 W Santa Clara St", situsCity: "San Jose", situsZip: "95110", lat: 37.332, lon: -121.9, roofAgeYears: null, permitNumber: "BLD-2019-3", permitState: "expired_unfinaled", daysOpen: 2100, contractorCompany: "Bay Roof Co", cslbStatus: "expired", distanceMiles: 1.1 },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function stubFetch(url: string): Promise<Response> {
  const u = new URL(url, "http://stub.local");
  if (u.pathname === "/api/health") return json({ ok: true, snapshot });
  if (u.pathname === "/api/leads/aged-roofs") {
    const min = Number(u.searchParams.get("minRoofAgeYears") ?? 15);
    return json({ snapshot, items: items.filter((i) => (i.roofAgeYears ?? 0) >= min) });
  }
  if (u.pathname === "/api/leads/open-permits") {
    const state = u.searchParams.get("state") ?? "open";
    const list = items.filter((i) => i.permitState !== "finaled" && (state === "any" || i.permitState === state));
    return json({ snapshot, items: [...list].sort((a, b) => (b.daysOpen ?? 0) - (a.daysOpen ?? 0)) });
  }
  const m = /^\/api\/properties\/(.+)$/.exec(u.pathname);
  if (m) {
    const apn = decodeURIComponent(m[1] ?? "");
    const it = items.find((i) => i.apn === apn);
    if (!it) return json({ error: "not found" }, 404);
    return json({
      snapshot,
      property: { apn, situsAddress: it.situsAddress, situsCity: it.situsCity, situsZip: it.situsZip, jurisdiction: "San Jose", lat: it.lat, lon: it.lon, sourceUrl: provenance.propertySourceUrl, sourceVersion: provenance.propertySourceVersion, fetchedAt: provenance.fetchedAt },
      permits: [{ permitNumber: it.permitNumber, apn, status: it.permitState, permitState: it.permitState, isRoofing: true, workDescription: "Re-roof", issueDate: "2020-01-01", finalDate: null, daysOpen: it.daysOpen, contractorCompany: it.contractorCompany ?? null, sourceUrl: provenance.permitSourceUrl, sourceVersion: provenance.permitSourceVersion, fetchedAt: provenance.fetchedAt }],
      roofAge: it.roofAgeYears == null ? null : { roofDate: it.roofDate, roofAgeYears: it.roofAgeYears, anchor: it.roofAgeAnchor, confidence: it.roofAgeConfidence, permitNumber: it.permitNumber },
      owners: [{ ownerName: "Jane Doe", observedOn: "2025-01-01", permitNumber: it.permitNumber }],
      contractors: it.contractorCompany ? [{ contractorId: "c1", companyName: it.contractorCompany, contactName: null, permitCount: 5, roofingPermitCount: 4, cslbLicenseNumber: it.cslbLicenseNumber ?? null, cslbStatus: it.cslbStatus ?? null, cslbMatchMethod: "name", bbbRating: null }] : [],
    });
  }
  return json({ error: "not found" }, 404);
}
