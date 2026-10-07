import { z } from 'zod';
import { PipelineLead } from './pipeline';
import { PartialSearchParams } from './search';

export const LeadStatus = z.enum(['new', 'contacted', 'qualified', 'lost']);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const LeadRecord = z.object({
  apn: z.string(),
  status: LeadStatus,
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  snapshot: PipelineLead,
});
export type LeadRecord = z.infer<typeof LeadRecord>;

export const CreateLead = z.object({ apn: z.string(), snapshot: PipelineLead });
export type CreateLead = z.infer<typeof CreateLead>;

export const UpdateLead = z.object({
  status: LeadStatus.optional(),
  notes: z.string().optional(),
});
export type UpdateLead = z.infer<typeof UpdateLead>;

export const LeadFilter = PartialSearchParams.extend({ status: LeadStatus.optional() });
export type LeadFilter = z.infer<typeof LeadFilter>;
