import { z } from 'zod';
import { PartialSearchParams } from './search';

export const AgentRequest = z.object({
  question: z.string().min(3).max(500),
  context: z
    .object({
      lat: z.number(),
      lon: z.number(),
      radiusMiles: z.number(),
      // The property picked on the map ("Ask agent"); the agent looks it up first.
      apn: z.string().min(1).max(40).optional(),
      address: z.string().max(200).optional(),
    })
    .nullable(),
});
export type AgentRequest = z.infer<typeof AgentRequest>;

export const AgentResponse = z.object({
  answer: z.string(),
  toolCalls: z.array(
    z.object({
      name: z.string(),
      args: z.unknown(),
      resultCount: z.number(),
      // Set when the tool call failed (resultCount is then 0).
      error: z.string().optional(),
    }),
  ),
  sources: z.array(
    z.object({ apn: z.string(), permitNumber: z.string().optional(), address: z.string().optional() }),
  ),
  resolvedFilters: PartialSearchParams.nullable(),
});
export type AgentResponse = z.infer<typeof AgentResponse>;
