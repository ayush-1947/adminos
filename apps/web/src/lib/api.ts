export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    cache: 'no-store',
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'The server is unavailable. Please try again.' }));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/'))
      window.location.assign('/login');
    throw new ApiError(data.error || 'Request failed', response.status, data.details);
  }
  return data;
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
