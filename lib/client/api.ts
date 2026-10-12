/** Browser-side API client. Every mutation carries the CSRF header the server requires. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T = unknown>(path: string, opts: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      signal: opts.signal,
      headers: {
        Accept: 'application/json',
        ...(method !== 'GET' ? { 'x-auxed-client': '1' } : {}),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, "You're offline. Check your connection and try again.", 'OFFLINE');
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(res.status, d.error ?? 'Something went wrong. Please try again.', d.code);
  }
  return data as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const patch = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body });
export const del = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
