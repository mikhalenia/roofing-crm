import { describe, expect, it } from 'vitest';
import { CreateLead, LeadFilter, LeadRecord, UpdateLead } from './lead';
import { PipelineLead, PipelineSearchResponse } from './pipeline';

const provenance = {
  propertySourceUrl: 'https://example.test/p',
  propertySourceVersion: 'v1',
  permitSourceUrl: null,
  permitSourceVersion: null,
  fetchedAt: '2026-10-01T00:00:00Z',
};
const minimal = {
  apn: '123-45-678',
  lat: 37.3,
  lon: -121.9,
  bbbRating: null,
  distanceMiles: 1.2,
  provenance,
};
const full = {
  ...minimal,
  situsAddress: '1 Main St',
  situsCity: 'San Jose',
  situsZip: '95112',
  roofAgeYears: 22,
  roofAgeAnchor: 'final_date',
  roofAgeConfidence: 'high',
  roofDate: '2004-05-01',
  permitNumber: 'BLD-1',
  permitState: 'open',
  daysOpen: 400,
  issueDate: '2025-01-01',
  finalDate: null,
  workDescription: 'reroof',
  contractorCompany: 'Acme Roofing',
  contractorId: 'c1',
  cslbLicenseNumber: '123',
  cslbStatus: 'active',
  ownerName: 'Jane Doe',
  ownerObservedOn: '2025-02-01',
};

describe('PipelineLead', () => {
  it('parses a full row', () => {
    expect(PipelineLead.parse(full)).toMatchObject(full);
  });
  it('parses a row missing optional fields', () => {
    expect(PipelineLead.safeParse(minimal).success).toBe(true);
  });
  it('passes through unknown fields', () => {
    expect(PipelineLead.parse({ ...minimal, newField: 1 })).toHaveProperty('newField', 1);
  });
  it('rejects non-null bbbRating', () => {
    expect(PipelineLead.safeParse({ ...minimal, bbbRating: 'A+' }).success).toBe(false);
  });
  it('parses a search response', () => {
    const r = PipelineSearchResponse.parse({
      snapshot: { runId: 'r1', manifestCid: null, syncedAt: null },
      items: [full],
    });
    expect(r.items).toHaveLength(1);
  });
});

describe('lead schemas', () => {
  it('LeadFilter accepts {} and status', () => {
    expect(LeadFilter.safeParse({}).success).toBe(true);
    expect(LeadFilter.parse({ status: 'new' })).toEqual({ status: 'new' });
    expect(LeadFilter.safeParse({ status: 'nope' }).success).toBe(false);
  });
  it('CreateLead / UpdateLead / LeadRecord', () => {
    expect(CreateLead.safeParse({ apn: 'a', snapshot: minimal }).success).toBe(true);
    expect(UpdateLead.safeParse({}).success).toBe(true);
    expect(UpdateLead.safeParse({ status: 'lost', notes: 'x' }).success).toBe(true);
    expect(UpdateLead.safeParse({ notes: 'n'.repeat(2000) }).success).toBe(true);
    expect(UpdateLead.safeParse({ notes: 'n'.repeat(2001) }).success).toBe(false);
    expect(CreateLead.safeParse({ apn: 'a'.repeat(16), snapshot: minimal }).success).toBe(true);
    expect(CreateLead.safeParse({ apn: 'a'.repeat(17), snapshot: minimal }).success).toBe(false);
    expect(
      LeadRecord.safeParse({
        apn: 'a',
        status: 'new',
        notes: '',
        createdAt: 't',
        updatedAt: 't',
        snapshot: minimal,
      }).success,
    ).toBe(true);
  });
});
