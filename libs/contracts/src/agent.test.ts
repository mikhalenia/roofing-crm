import { describe, expect, it } from 'vitest';
import { AgentRequest, AgentResponse } from './agent';

describe('AgentRequest', () => {
  it('rejects 2-char questions', () => {
    expect(AgentRequest.safeParse({ question: 'ab', context: null }).success).toBe(false);
  });
  it('accepts 3-char question with context', () => {
    expect(
      AgentRequest.safeParse({
        question: 'abc',
        context: { lat: 37.3, lon: -121.9, radiusMiles: 5 },
      }).success,
    ).toBe(true);
  });
  it('rejects >500 chars', () => {
    expect(AgentRequest.safeParse({ question: 'a'.repeat(501), context: null }).success).toBe(false);
  });
});

describe('AgentResponse', () => {
  it('parses a response', () => {
    const r = AgentResponse.parse({
      answer: 'ok',
      toolCalls: [{ name: 'search', args: { a: 1 }, resultCount: 3 }],
      sources: [{ apn: '1', permitNumber: 'P', address: 'A' }, { apn: '2' }],
      resolvedFilters: { radiusMiles: 5 },
    });
    expect(r.sources).toHaveLength(2);
    expect(AgentResponse.safeParse({ answer: '', toolCalls: [], sources: [], resolvedFilters: null }).success).toBe(true);
  });
});
