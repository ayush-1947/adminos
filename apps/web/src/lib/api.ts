export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}
const recovering = new Set<symbol>();
const recoveryListeners = new Set<() => void>();
export const isApiRecovering = () => recovering.size > 0;
export const subscribeApiRecovery = (listener: () => void) => {
  recoveryListeners.add(listener);
  return () => {
    recoveryListeners.delete(listener);
  };
};
function recoveryChanged() {
  for (const listener of recoveryListeners) listener();
}
const unavailable =
  'The server is still unavailable. Try again shortly. If this continues, check the API service status.';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const read = (options.method || 'GET').toUpperCase() === 'GET';
  const deadline = Date.now() + (read ? 90000 : 30000);
  const recovery = Symbol();
  try {
    for (let attempt = 0; ; attempt++) {
      options.signal?.throwIfAborted();
      const controller = new AbortController();
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(1, Math.min(read ? 15000 : 30000, deadline - Date.now())),
      );
      let response: Response | undefined;
      let data: any;
      try {
        response = await fetch(`/api${path}`, {
          ...options,
          signal: controller.signal,
          credentials: 'include',
          headers: {
            ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers,
          },
          cache: 'no-store',
        });
        data = await response.json().catch(() => undefined);
      } catch {
        options.signal?.throwIfAborted();
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
      }
      options.signal?.throwIfAborted();
      const validJson = data !== null && typeof data === 'object';
      const transient =
        !response || [502, 503, 504].includes(response.status) || (response.ok && !validJson);
      if (transient) {
        const delay = Math.min(1000 * 2 ** attempt, 10000);
        if (read && attempt < 10 && Date.now() + delay < deadline) {
          recovering.add(recovery);
          recoveryChanged();
          await new Promise<void>((resolve, reject) => {
            const cancel = () => {
              clearTimeout(timer);
              reject(options.signal?.reason);
            };
            const timer = setTimeout(() => {
              options.signal?.removeEventListener('abort', cancel);
              resolve();
            }, delay);
            options.signal?.addEventListener('abort', cancel, { once: true });
            if (options.signal?.aborted) {
              options.signal.removeEventListener('abort', cancel);
              cancel();
            }
          });
          continue;
        }
        throw new ApiError(
          read
            ? unavailable
            : 'The connection failed. Check whether your changes were saved before trying again.',
          response?.status || 0,
        );
      }
      if (!response!.ok) {
        if (response!.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/'))
          window.location.assign('/login');
        throw new ApiError(
          typeof data?.error === 'string'
            ? data.error
            : `Request failed (HTTP ${response!.status})`,
          response!.status,
          data?.details,
        );
      }
      return data as T;
    }
  } finally {
    if (recovering.delete(recovery)) recoveryChanged();
  }
}
export type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  resource?: string;
  min?: number;
};
export type Resource = {
  label: string;
  group: string;
  fields: Field[];
  columns: string[];
  search: string[];
  canWrite: boolean;
  readonly?: boolean;
  unit?: boolean;
  site?: boolean;
  statusFilters?: string[];
};
export type Row = Record<string, any>;
export type Identity = {
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string };
  businessUnits: { id: string; name: string; code: string }[];
  principal: { role: string; scope: string; permissions: string[]; employeeId: string | null };
};
export const currency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
export const number = (value: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);
export const title = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
