import { describe, expect, it } from 'vitest';
import { boundingBox, haversineMiles } from './geo';

describe('geo', () => {
  it('haversine San Jose to Palo Alto is about 16 miles', () => {
    expect(
      haversineMiles({ lat: 37.3382, lon: -121.8863 }, { lat: 37.4419, lon: -122.143 }),
    ).toBeCloseTo(16, 0);
  });
  it('haversine of identical points is 0', () => {
    expect(haversineMiles({ lat: 37, lon: -122 }, { lat: 37, lon: -122 })).toBe(0);
  });
  it('bounding box for 5 miles', () => {
    const b = boundingBox({ lat: 37.3382, lon: -121.8863 }, 5);
    const latSpan = b.maxLat - b.minLat;
    const lonSpan = b.maxLon - b.minLon;
    expect(latSpan).toBeCloseTo(0.1449, 3);
    expect(lonSpan).toBeGreaterThan(latSpan);
  });
});
