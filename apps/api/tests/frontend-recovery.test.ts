import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, isApiRecovering } from '../../web/src/lib/api';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Frontend recovery from unavailable upstreams', () => {
  it('recovers an authenticated read after a gateway failure and clears connection feedback', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(json({ id: 'synthetic' }));
    vi.stubGlobal('fetch', fetch);
    const result = api('/auth/me');
    await vi.advanceTimersByTimeAsync(0);
    expect(isApiRecovering()).toBe(true);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ id: 'synthetic' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].credentials).toBe('include');
    expect(isApiRecovering()).toBe(false);
  });

  it('does not interpret an HTML startup page with HTTP 200 as API data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>Starting</html>'))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const result = api('/catalog');
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 422, 429, 500])('preserves HTTP %s without retrying it', async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json(
          { error: 'Expected failure', details: [{ field: 'name', message: 'Invalid' }] },
          status,
        ),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(api('/auth/me')).rejects.toMatchObject({ status, message: 'Expected failure' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'never automatically replays a %s after 503',
    async (method) => {
      const fetch = vi.fn().mockResolvedValue(json({ error: 'Unavailable' }, 503));
      vi.stubGlobal('fetch', fetch);
      await expect(api('/resources/payments', { method, body: '{}' })).rejects.toMatchObject({
        status: 503,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(isApiRecovering()).toBe(false);
    },
  );

  it('bounds recovery attempts and gives an actionable terminal error', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ error: 'Unavailable' }, 503));
    vi.stubGlobal('fetch', fetch);
    const result = expect(api('/dashboard')).rejects.toThrow('The server is still unavailable');
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(11);
    expect(isApiRecovering()).toBe(false);
  });

  it('cancels backoff when the caller aborts', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const result = expect(api('/catalog', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await result;
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(isApiRecovering()).toBe(false);
  });

  it('times out stalled reads within the overall recovery budget', async () => {
    const started = Date.now();
    const fetch = vi.fn(
      (_path: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('Timed out', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = expect(api('/dashboard')).rejects.toThrow('The server is still unavailable');
    await vi.runAllTimersAsync();
    await result;
    expect(Date.now() - started).toBeLessThanOrEqual(90000);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(11);
    expect(isApiRecovering()).toBe(false);
  });

  it('keeps recovery feedback while another read is still recovering', async () => {
    let first = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path === '/api/one' && !first) return json({ ok: true });
        first = false;
        return json({ error: 'Unavailable' }, 503);
      }),
    );
    const one = api('/one');
    const two = expect(api('/two')).rejects.toBeInstanceOf(ApiError);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await one).toEqual({ ok: true });
    expect(isApiRecovering()).toBe(true);
    await vi.runAllTimersAsync();
    await two;
    expect(isApiRecovering()).toBe(false);
  });
});
