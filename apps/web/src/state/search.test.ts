import { describe, expect, it } from "vitest";
import type { PipelineLead } from "@crm/contracts";
import { initialState, searchKey, searchReducer, toSearchParams } from "./search";

const provenance = {
  propertySourceUrl: "u",
  propertySourceVersion: "v",
  fetchedAt: "t",
};
function lead(apn: string, extra: Record<string, unknown> = {}): PipelineLead {
  return {
    apn,
    lat: 37.3,
    lon: -121.9,
    bbbRating: null,
    distanceMiles: 1,
    provenance,
    ...extra,
  } as PipelineLead;
}
const snapshot = { runId: "r1", manifestCid: "cid", syncedAt: null };

describe("searchReducer", () => {
  it("starts at San Jose with defaults", () => {
    expect(initialState.pin).toEqual({ lat: 37.3382, lon: -121.8863 });
    expect(initialState.radiusMiles).toBe(5);
    expect(initialState.filters).toEqual({
      minRoofAgeYears: 15,
      permitState: "any",
      minOpenYears: 0,
      roofingOnly: true,
    });
  });

  it("setPin and setRadius", () => {
    let s = searchReducer(initialState, { type: "setPin", pin: { lat: 37.4, lon: -122 } });
    s = searchReducer(s, { type: "setRadius", radiusMiles: 10 });
    expect(s.pin).toEqual({ lat: 37.4, lon: -122 });
    expect(s.radiusMiles).toBe(10);
  });

  it("setFilters merges partial filters", () => {
    const s = searchReducer(initialState, { type: "setFilters", filters: { minOpenYears: 3 } });
    expect(s.filters.minOpenYears).toBe(3);
    expect(s.filters.roofingOnly).toBe(true);
  });

  it("searchStarted sets loading and clears error but keeps results", () => {
    const withResults = searchReducer(
      { ...initialState, error: "old" },
      {
        type: "searchSucceeded",
        aged: { snapshot, items: [lead("A")] },
        open: { snapshot, items: [] },
      },
    );
    const s = searchReducer({ ...withResults, error: "old" }, { type: "searchStarted" });
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
    expect(s.results).toHaveLength(1);
  });

  it("searchSucceeded merges aged and open by APN with both signals", () => {
    const s = searchReducer(initialState, {
      type: "searchSucceeded",
      aged: {
        snapshot,
        items: [
          lead("A", { roofAgeYears: 22, roofAgeAnchor: "final_date" }),
          lead("B", { roofAgeYears: 18 }),
        ],
      },
      open: {
        snapshot,
        items: [
          lead("A", { permitState: "open", daysOpen: 400, permitNumber: "P1" }),
          lead("C", { permitState: "expired_unfinaled", daysOpen: 900 }),
        ],
      },
    });
    const byApn = Object.fromEntries(s.results.map((r) => [r.lead.apn, r]));
    expect(s.results).toHaveLength(3);
    expect([...(byApn["A"]?.signals ?? [])].sort()).toEqual(["aged_roof", "open_permit"]);
    expect(byApn["A"]?.lead.roofAgeYears).toBe(22);
    expect(byApn["A"]?.lead.daysOpen).toBe(400);
    expect([...(byApn["B"]?.signals ?? [])]).toEqual(["aged_roof"]);
    expect([...(byApn["C"]?.signals ?? [])]).toEqual(["stalled_permit"]);
    expect(s.loading).toBe(false);
    expect(s.snapshot).toEqual(snapshot);
  });

  it("searchFailed keeps previous results and sets error", () => {
    const ok = searchReducer(initialState, {
      type: "searchSucceeded",
      aged: { snapshot, items: [lead("A")] },
      open: { snapshot, items: [] },
    });
    const s = searchReducer(searchReducer(ok, { type: "searchStarted" }), {
      type: "searchFailed",
      error: "Pipeline API error 500",
    });
    expect(s.results).toEqual(ok.results);
    expect(s.error).toBe("Pipeline API error 500");
    expect(s.loading).toBe(false);
  });

  it("healthLoaded stores snapshot; healthFailed keeps last snapshot", () => {
    let s = searchReducer(initialState, { type: "healthLoaded", snapshot });
    expect(s.snapshot).toEqual(snapshot);
    expect(s.healthError).toBeNull();
    s = searchReducer(s, { type: "healthFailed", error: "down" });
    expect(s.healthError).toBe("down");
    expect(s.snapshot).toEqual(snapshot);
  });
});

describe("toSearchParams", () => {
  it("maps state to query params for both endpoints", () => {
    const s = searchReducer(
      searchReducer(initialState, { type: "setRadius", radiusMiles: 7.5 }),
      { type: "setFilters", filters: { permitState: "any", minOpenYears: 2, roofingOnly: false, minRoofAgeYears: 20 } },
    );
    expect(toSearchParams(s)).toEqual({
      lat: 37.3382,
      lon: -121.8863,
      radiusMiles: 7.5,
      minRoofAgeYears: 20,
      permitState: "any",
      minOpenYears: 2,
      roofingOnly: false,
      limit: 200,
    });
  });
});

describe("applyParams", () => {
  it("applies pin, radius and filters, ignoring limit and undefined", () => {
    const next = searchReducer(initialState, {
      type: "applyParams",
      params: { lat: 37.4, lon: -122.1, radiusMiles: 3, minRoofAgeYears: 25, limit: 50 },
    });
    expect(next.pin).toEqual({ lat: 37.4, lon: -122.1 });
    expect(next.radiusMiles).toBe(3);
    expect(next.filters).toEqual({ ...initialState.filters, minRoofAgeYears: 25 });
    expect(searchReducer(initialState, { type: "applyParams", params: {} })).toEqual({
      ...initialState,
      pendingSearch: true,
    });
  });

  it("queues one search that searchStarted or searchFailed clears", () => {
    expect(initialState.pendingSearch).toBe(false);
    const queued = searchReducer(initialState, { type: "applyParams", params: { lat: 37.4, lon: -122.1 } });
    expect(queued.pendingSearch).toBe(true);
    expect(searchReducer(queued, { type: "searchStarted" }).pendingSearch).toBe(false);
    expect(searchReducer(queued, { type: "searchFailed", error: "x" }).pendingSearch).toBe(false);
  });
});

describe("capped", () => {
  it("is set when either search returned the 200-record limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => lead(`A-${i}`));
    const full = searchReducer(initialState, {
      type: "searchSucceeded",
      aged: { snapshot, items: many },
      open: { snapshot, items: [] },
    });
    expect(full.capped).toBe(true);
    const few = searchReducer(full, {
      type: "searchSucceeded",
      aged: { snapshot, items: [lead("A")] },
      open: { snapshot, items: [] },
    });
    expect(few.capped).toBe(false);
  });
});

describe("focus", () => {
  it("focusProperty sets the target and focusDone clears it, keeping the pin", () => {
    const s = searchReducer(initialState, { type: "focusProperty", focus: { apn: "A1", lat: 37.4, lon: -122 } });
    expect(s.focus).toEqual({ apn: "A1", lat: 37.4, lon: -122 });
    expect(s.pin).toEqual(initialState.pin);
    expect(searchReducer(s, { type: "focusDone" }).focus).toBeNull();
  });
});

describe("hover", () => {
  it("sets and clears hoverApn, returning the same state when unchanged", () => {
    const s = searchReducer(initialState, { type: "hover", apn: "A1" });
    expect(s.hoverApn).toBe("A1");
    expect(searchReducer(s, { type: "hover", apn: "A1" })).toBe(s);
    expect(searchReducer(s, { type: "hover", apn: null }).hoverApn).toBeNull();
  });
});

describe("searchKey", () => {
  it("changes with pin, radius and filters; searchStarted records it", () => {
    const k0 = searchKey(initialState);
    expect(searchKey(searchReducer(initialState, { type: "setPin", pin: { lat: 37.4, lon: -122 } }))).not.toBe(k0);
    expect(searchKey(searchReducer(initialState, { type: "setRadius", radiusMiles: 2 }))).not.toBe(k0);
    expect(searchKey(searchReducer(initialState, { type: "setFilters", filters: { roofingOnly: false } }))).not.toBe(k0);
    expect(searchReducer(initialState, { type: "searchStarted", key: k0 }).lastSearchKey).toBe(k0);
    expect(initialState.lastSearchKey).toBeNull();
  });
});

describe("stale responses", () => {
  const resp = { snapshot: { runId: "r", manifestCid: null, syncedAt: null }, items: [] };
  it("drops a success or failure for a search that is no longer the latest", () => {
    const started = searchReducer(searchReducer(initialState, { type: "searchStarted", key: "old" }), {
      type: "searchStarted",
      key: "new",
    });
    expect(searchReducer(started, { type: "searchSucceeded", aged: resp, open: resp, key: "old" })).toBe(started);
    expect(searchReducer(started, { type: "searchFailed", error: "x", key: "old" })).toBe(started);
    expect(searchReducer(started, { type: "searchSucceeded", aged: resp, open: resp, key: "new" }).loading).toBe(false);
    // An invalid pin fails without a key and is never dropped.
    expect(searchReducer(started, { type: "searchFailed", error: "pin" }).error).toBe("pin");
  });
});

describe("permit-state filter on the shown results", () => {
  // aged + work-approved, aged + stalled, open only, stalled only
  const agedApproved = lead("AGED-APPROVED", { roofAgeYears: 23, permitState: "expired_unfinaled", approvalsComplete: true, isStalled: false });
  const agedStalled = lead("AGED-STALLED", { roofAgeYears: 22, permitState: "expired_unfinaled", approvalsComplete: false, isStalled: true });
  const openOnly = lead("OPEN", { permitState: "open", daysOpen: 400 });
  const stalledOnly = lead("STALLED", { permitState: "expired_unfinaled", approvalsComplete: false, isStalled: true, daysOpen: 9000 });
  const aged = { snapshot, items: [agedApproved, agedStalled] };

  const run = (permitState: "any" | "open" | "expired_unfinaled", open: PipelineLead[]) => {
    const s = searchReducer(initialState, { type: "setFilters", filters: { permitState } });
    return searchReducer(s, { type: "searchSucceeded", aged, open: { snapshot, items: open } }).results.map((r) => r.lead.apn).sort();
  };

  it("Any keeps aged roofs and permits", () => {
    expect(run("any", [agedStalled, openOnly, stalledOnly])).toEqual(["AGED-APPROVED", "AGED-STALLED", "OPEN", "STALLED"]);
  });

  it("Stalled keeps only stalled permits; a work-approved aged roof is hidden", () => {
    expect(run("expired_unfinaled", [agedStalled, stalledOnly])).toEqual(["AGED-STALLED", "STALLED"]);
  });

  it("Open keeps only open permits", () => {
    expect(run("open", [openOnly])).toEqual(["OPEN"]);
  });

  it("drops a work-approved expired permit even if the permit search returned it", () => {
    expect(run("expired_unfinaled", [agedApproved, stalledOnly])).toEqual(["STALLED"]);
  });

  it("filters with the state the request was made with, not the state at arrival", () => {
    // Requested with Any; the user switched to Stalled inside the debounce window before the response arrived.
    const s = searchReducer(initialState, { type: "setFilters", filters: { permitState: "expired_unfinaled" } });
    const out = searchReducer(s, {
      type: "searchSucceeded",
      aged,
      open: { snapshot, items: [openOnly, stalledOnly] },
      permitState: "any",
    });
    expect(out.results.map((r) => r.lead.apn).sort()).toEqual(["AGED-APPROVED", "AGED-STALLED", "OPEN", "STALLED"]);
  });

  it("with a state filter only the permit search can cap the results", () => {
    const many = Array.from({ length: 200 }, (_, i) => lead(`A${i}`, { roofAgeYears: 20 }));
    const s = searchReducer(initialState, { type: "setFilters", filters: { permitState: "open" } });
    const out = searchReducer(s, { type: "searchSucceeded", aged: { snapshot, items: many }, open: { snapshot, items: [openOnly] } });
    expect(out.capped).toBe(false);
    expect(out.results).toHaveLength(1);
  });
});
