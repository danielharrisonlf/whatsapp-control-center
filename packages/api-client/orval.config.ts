import { defineConfig } from 'orval';

/** Paginated list endpoints get an additional `use…Infinite` hook driven by `cursor`. */
const infinite = [
  'listTemplates',
  'listMessages',
  'listConversations',
  'listConversationMessages',
  'listWebhookEvents',
  'listApiLogs',
  'listAuditLogs',
  'listMedia',
];

export default defineConfig({
  wacc: {
    input: { target: '../../apps/api/openapi.json' },
    output: {
      mode: 'tags-split',
      target: 'src/generated/endpoints',
      schemas: 'src/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      prettier: false,
      override: {
        mutator: { path: 'src/fetcher.ts', name: 'apiFetch' },
        fetch: { includeHttpResponseReturnType: false },
        query: { useQuery: true, useMutation: true, signal: true },
        operations: Object.fromEntries(
          infinite.map((id) => [id, { query: { useInfinite: true, useInfiniteQueryParam: 'cursor' } }]),
        ),
      },
    },
  },
});
