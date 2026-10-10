import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  requestId: string;
  userId?: string;
  organizationId?: string;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();

/**
 * Per-request data available anywhere in the call chain (used by the Meta client and the API
 * log writer to attach the organization and request ID without threading them everywhere).
 */
export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
  get(): RequestContextData | undefined {
    return storage.getStore();
  },
  set(patch: Partial<RequestContextData>) {
    const store = storage.getStore();
    if (store) Object.assign(store, patch);
  },
};
