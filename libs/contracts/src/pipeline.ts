import { z } from 'zod';

const str = z.string().nullish();

// z.looseObject keeps unknown keys (Zod 4 replacement for .passthrough()).
export const PipelineLead = z.looseObject({
  apn: z.string(),
  situsAddress: str,
  situsCity: str,
  situsZip: str,
  lat: z.number(),
  lon: z.number(),
  roofAgeYears: z.number().nullish(),
  roofAgeAnchor: z.enum(['final_date', 'approval_complete_issue_date']).nullish(),
  roofAgeConfidence: z.enum(['high', 'medium']).nullish(),
  roofDate: str,
  permitNumber: str,
  permitState: z.enum(['open', 'expired_unfinaled', 'finaled']).nullish(),
  daysOpen: z.number().nullish(),
  issueDate: str,
  finalDate: str,
  workDescription: str,
  contractorCompany: str,
  contractorId: str,
  cslbLicenseNumber: str,
  cslbStatus: str,
  bbbRating: z.null(),
  ownerName: str,
  ownerObservedOn: str,
  distanceMiles: z.number(),
  provenance: z.object({
    propertySourceUrl: z.string(),
    propertySourceVersion: z.string(),
    permitSourceUrl: str,
    permitSourceVersion: str,
    fetchedAt: z.string(),
  }),
});
export type PipelineLead = z.infer<typeof PipelineLead>;

export const PipelineSnapshot = z.object({
  runId: z.string(),
  manifestCid: z.string().nullable(),
  syncedAt: z.string().nullable(),
});
export type PipelineSnapshot = z.infer<typeof PipelineSnapshot>;

export const PipelineSearchResponse = z.object({
  snapshot: PipelineSnapshot,
  items: z.array(PipelineLead),
});
export type PipelineSearchResponse = z.infer<typeof PipelineSearchResponse>;
