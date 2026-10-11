import { QueryClient } from '@tanstack/react-query';
import { isApiRequestError } from '@wacc/api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (4xx) will not fix themselves; retry only network/5xx failures.
      retry: (count, error) => {
        if (isApiRequestError(error) && error.status >= 400 && error.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});

/**
 * Invalidates every cached query of an organization whose URL starts with `path`
 * (plain and infinite variants alike). Without `path`, the whole organization.
 */
export function invalidateOrg(qc: QueryClient, orgId: string, ...paths: string[]) {
  const prefixes = (paths.length ? paths : ['']).map(
    (p) => `/organizations/${orgId}${p ? `/${p.replace(/^\//, '')}` : ''}`,
  );
  return qc.invalidateQueries({
    predicate: (q) =>
      q.queryKey.some((k) => typeof k === 'string' && prefixes.some((prefix) => k.startsWith(prefix))),
  });
}
