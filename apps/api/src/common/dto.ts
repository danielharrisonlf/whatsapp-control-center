import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** ISO-8601 timestamp in responses. Services convert Date → string with `iso()`. */
export const zDate = z.string().meta({ format: 'date-time' });
export const zDateNullable = zDate.nullable();

export const iso = (d: Date) => d.toISOString();
export const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const zUuid = z.uuid();

export const SuccessSchema = z.object({ success: z.literal(true) }).meta({ id: 'Success' });
export class SuccessDto extends createZodDto(SuccessSchema) {}
export const success = { success: true as const };

/** Query params for cursor pagination over local data. */
export const CursorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export function pageSchema<T extends z.ZodType>(item: T, id: string) {
  return z
    .object({
      items: z.array(item),
      nextCursor: z
        .string()
        .nullable()
        .describe('Pass as `cursor` to fetch the next page. Null on the last page.'),
    })
    .meta({ id });
}

/**
 * Keyset pagination over (createdAt desc, id desc). The cursor is opaque to clients.
 */
export const cursorCodec = {
  encode(date: Date, id: string) {
    return Buffer.from(JSON.stringify([date.toISOString(), id])).toString('base64url');
  },
  decode(cursor?: string): { date: Date; id: string } | null {
    if (!cursor) return null;
    try {
      const [date, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as [string, string];
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime()) || typeof id !== 'string') return null;
      return { date: parsed, id };
    } catch {
      return null;
    }
  },
};

/** Prisma `where` fragment for rows strictly after the cursor in (field desc, id desc) order. */
export function afterCursor(field: string, cursor?: string) {
  const decoded = cursorCodec.decode(cursor);
  if (!decoded) return {};
  return {
    OR: [{ [field]: { lt: decoded.date } }, { [field]: decoded.date, id: { lt: decoded.id } }],
  };
}

/** Takes `limit + 1` rows and splits them into a page. */
export function toPage<T extends { id: string }, R>(
  rows: T[],
  limit: number,
  dateOf: (row: T) => Date,
  map: (row: T) => R,
): { items: R[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map(map),
    nextCursor: hasMore && last ? cursorCodec.encode(dateOf(last), last.id) : null,
  };
}
