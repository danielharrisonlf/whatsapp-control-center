import { describe, expect, it } from 'vitest';
import { TemplateAnalyticsQueryDto } from './analytics.controller';

const wabaId = '00000000-0000-4000-8000-000000000001';
const first = '00000000-0000-4000-8000-000000000002';
const second = '00000000-0000-4000-8000-000000000003';

describe('template analytics query wire formats', () => {
  it('accepts the comma-separated IDs produced by the generated client', () => {
    expect(
      TemplateAnalyticsQueryDto.schema.parse({ wabaId, templateIds: `${first},${second}` }).templateIds,
    ).toEqual([first, second]);
  });

  it('preserves single IDs and repeated query parameter arrays', () => {
    expect(TemplateAnalyticsQueryDto.schema.parse({ wabaId, templateIds: first }).templateIds).toEqual([
      first,
    ]);
    expect(
      TemplateAnalyticsQueryDto.schema.parse({ wabaId, templateIds: [first, second] }).templateIds,
    ).toEqual([first, second]);
  });

  it('rejects invalid IDs inside a comma-separated list', () => {
    expect(
      TemplateAnalyticsQueryDto.schema.safeParse({ wabaId, templateIds: `${first},invalid` }).success,
    ).toBe(false);
  });

  it('keeps the maximum of ten IDs in both wire formats', () => {
    const ids = Array.from({ length: 11 }, () => first);
    expect(TemplateAnalyticsQueryDto.schema.safeParse({ wabaId, templateIds: ids }).success).toBe(false);
    expect(TemplateAnalyticsQueryDto.schema.safeParse({ wabaId, templateIds: ids.join(',') }).success).toBe(
      false,
    );
  });
});
