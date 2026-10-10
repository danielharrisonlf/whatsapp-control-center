import { isDeepStrictEqual } from 'node:util';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { z } from 'zod';
import { ErrorBodySchema } from './modules/meta/meta.dto';

const ERROR_RESPONSES: Record<string, string> = {
  '400': 'Invalid input (`code: VALIDATION_FAILED`, with `issues`).',
  '401': 'Not signed in or session expired (`code: UNAUTHENTICATED`).',
  '403': 'Role not allowed, missing Meta permission, or cross-site request.',
  '404': 'Resource not found in this organization.',
  '422':
    'Meta rejected the operation (`code: META_ERROR`, see `meta`) or it must be done in Meta Business Manager.',
  '429': 'Rate limited by this API or by Meta.',
  '502': 'Meta unreachable or returned a server error.',
};

/** Builds the OpenAPI document. It is also the source for packages/api-client (Orval). */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('WhatsApp Cloud API Control Center')
    .setDescription(
      [
        'REST API for managing WhatsApp Business Platform assets through the Meta Graph API.',
        '',
        '**Authentication:** session cookies (`wacc_at` access, `wacc_rt` refresh) issued by `/auth/login`.',
        'State-changing requests must come from the web app origin.',
        '',
        '**Errors:** every error uses the `ApiError` schema. Graph API failures include a normalized `meta` object.',
        '',
        '**Pagination:** list endpoints return `{ items, nextCursor }`; pass `cursor` to continue.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addCookieAuth('wacc_at')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controller, method) => method,
  });
  // Swagger shares schema objects between routes; cleanup mutates them, so give it a private copy.
  const cleaned = cleanupOpenApiDoc(structuredClone(document));
  cleaned.components ??= {};
  cleaned.components.schemas ??= {};
  // Inline everything (empty registry), then point `meta` at the MetaError component.
  const apiError = z.toJSONSchema(ErrorBodySchema, { target: 'openapi-3.0', metadata: z.registry() }) as {
    properties: Record<string, unknown>;
  };
  apiError.properties.meta = { $ref: '#/components/schemas/MetaError' };
  cleaned.components.schemas.ApiError = apiError as never;
  return polish(cleaned);
}

/** A few inline schemas keep the 3.1 form `type: [T, "null"]`; the document is 3.0. */
function toOpenApi30Nullable(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toOpenApi30Nullable);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) out[key] = toOpenApi30Nullable(value);
  if (Array.isArray(out.type)) {
    const types = (out.type as string[]).filter((t) => t !== 'null');
    if (types.length < (out.type as string[]).length) out.nullable = true;
    out.type = types.length === 1 ? types[0] : types;
  }
  return out;
}

/**
 * - Drops nestjs-zod's `_Output` suffix when the name is free (or the input twin is identical),
 *   so the generated client exposes `PhoneNumber`, not `PhoneNumberOutput`.
 * - Success responses declared without a status become `200`.
 * - Every operation documents the shared `ApiError` responses.
 */
function polish(doc: OpenAPIObject): OpenAPIObject {
  const schemas = doc.components!.schemas!;
  const renames = new Map<string, string>();
  for (const name of Object.keys(schemas)) {
    if (!name.endsWith('_Output')) continue;
    const target = name.slice(0, -'_Output'.length);
    if (!(target in schemas) || isDeepStrictEqual(schemas[target], schemas[name])) renames.set(name, target);
  }
  let text = JSON.stringify(doc);
  for (const [from, to] of renames)
    text = text.replaceAll(`"#/components/schemas/${from}"`, `"#/components/schemas/${to}"`);
  const result = toOpenApi30Nullable(JSON.parse(text)) as OpenAPIObject;
  const nextSchemas = result.components!.schemas!;
  for (const [from, to] of renames) {
    nextSchemas[to] = nextSchemas[from]!;
    delete nextSchemas[from];
  }

  for (const [path, pathItem] of Object.entries(result.paths)) {
    const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
    for (const op of Object.values(pathItem) as {
      responses?: Record<string, unknown>;
      parameters?: { name: string; in: string }[];
    }[]) {
      if (!op?.responses) continue;
      // Params read through decorators like @CurrentMembership() are not seen by Swagger.
      op.parameters ??= [];
      for (const name of pathParams) {
        if (!op.parameters.some((p) => p.in === 'path' && p.name === name)) {
          op.parameters.unshift({
            name,
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          } as never);
        }
      }
      if (op.responses.default && !Object.keys(op.responses).some((c) => c.startsWith('2'))) {
        op.responses['200'] = op.responses.default;
        delete op.responses.default;
      }
      for (const [code, description] of Object.entries(ERROR_RESPONSES)) {
        op.responses[code] ??= {
          description,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        };
      }
    }
  }
  return result;
}
