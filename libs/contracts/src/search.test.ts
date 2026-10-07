import { describe, expect, it } from 'vitest';
import { PartialSearchParams, SearchParams } from './search';

const base = { lat: 37.3382, lon: -121.8863 };

describe('SearchParams', () => {
  it('applies defaults from lat/lon', () => {
    expect(SearchParams.parse(base)).toEqual({
      ...base,
      radiusMiles: 5,
      minRoofAgeYears: 15,
      permitState: 'open',
      minOpenYears: 0,
      roofingOnly: true,
      limit: 200,
    });
  });

  it('accepts boundary values', () => {
    expect(SearchParams.parse({ ...base, radiusMiles: 0.5 }).radiusMiles).toBe(0.5);
    expect(SearchParams.parse({ ...base, radiusMiles: 25 }).radiusMiles).toBe(25);
    expect(SearchParams.parse({ ...base, minRoofAgeYears: 5 }).minRoofAgeYears).toBe(5);
    expect(SearchParams.parse({ ...base, minRoofAgeYears: 40 }).minRoofAgeYears).toBe(40);
  });

  it('rejects out-of-bounds values', () => {
    expect(SearchParams.safeParse({ ...base, radiusMiles: 0.4 }).success).toBe(false);
    expect(SearchParams.safeParse({ ...base, radiusMiles: 26 }).success).toBe(false);
    expect(SearchParams.safeParse({ ...base, minRoofAgeYears: 4 }).success).toBe(false);
    expect(SearchParams.safeParse({ ...base, minRoofAgeYears: 41 }).success).toBe(false);
    expect(SearchParams.safeParse({ ...base, limit: 501 }).success).toBe(false);
    expect(SearchParams.safeParse({ ...base, lat: 38 }).success).toBe(false);
    expect(SearchParams.safeParse({ ...base, lon: -120 }).success).toBe(false);
    expect(SearchParams.safeParse({ ...base, permitState: 'bogus' }).success).toBe(false);
  });

  it('coerces query strings', () => {
    const r = SearchParams.parse({
      lat: '37.3382',
      lon: '-121.8863',
      radiusMiles: '10',
      minRoofAgeYears: '20',
      limit: '50',
      roofingOnly: 'true',
    });
    expect(r).toMatchObject({ lat: 37.3382, radiusMiles: 10, minRoofAgeYears: 20, limit: 50, roofingOnly: true });
  });

  it('parses roofingOnly strings correctly', () => {
    expect(SearchParams.parse({ ...base, roofingOnly: 'false' }).roofingOnly).toBe(false);
    expect(SearchParams.parse({ ...base, roofingOnly: 'true' }).roofingOnly).toBe(true);
    expect(SearchParams.parse({ ...base, roofingOnly: false }).roofingOnly).toBe(false);
    expect(SearchParams.parse({ ...base, roofingOnly: '0' }).roofingOnly).toBe(false);
  });
});

describe('PartialSearchParams', () => {
  it('does not fill defaults', () => {
    expect(PartialSearchParams.parse({})).toEqual({});
    expect(PartialSearchParams.parse({ radiusMiles: '3' })).toEqual({ radiusMiles: 3 });
  });
});
