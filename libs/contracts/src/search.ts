import { z } from 'zod';

// z.coerce.boolean() turns "false" into true, so parse strings explicitly.
const queryBoolean = z.preprocess((v) => {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return v;
}, z.boolean());

// Default-free field schemas. Zod 4's .partial() still applies inner defaults,
// so the partial variant is built from these instead of from SearchParams.
const fields = {
  lat: z.coerce.number().min(36.9).max(37.5),
  lon: z.coerce.number().min(-122.3).max(-121.2),
  radiusMiles: z.coerce.number().min(0.5).max(25),
  minRoofAgeYears: z.coerce.number().int().min(5).max(40),
  permitState: z.enum(['open', 'expired_unfinaled', 'any']),
  minOpenYears: z.coerce.number().min(0).max(20),
  roofingOnly: queryBoolean,
  limit: z.coerce.number().int().min(1).max(500),
};

export const SearchParams = z.object({
  ...fields,
  radiusMiles: fields.radiusMiles.default(5),
  minRoofAgeYears: fields.minRoofAgeYears.default(15),
  permitState: fields.permitState.default('open'),
  minOpenYears: fields.minOpenYears.default(0),
  roofingOnly: fields.roofingOnly.default(true),
  limit: fields.limit.default(200),
});
// Equivalent of SearchParams.partial() but without defaults being filled in.
export const PartialSearchParams = z.object(fields).partial();
export type SearchParamsInput = z.input<typeof SearchParams>;
export type SearchParamsOutput = z.output<typeof SearchParams>;
