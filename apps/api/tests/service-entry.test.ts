import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/lib/db', () => ({ db: { $queryRaw: vi.fn() } }));
import { db } from '../src/lib/db';
import { app } from '../src/app';
import { config } from '../src/config';

describe('Deployment entry points and infrastructure probes', () => {
  beforeEach(() => vi.clearAllMocks());
  it('redirects bare API visits to the configured frontend, ignoring supplied redirect parameters', async () => {
    const response = await request(app).get('/').query({ next: 'https://untrusted.example' });
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(config.APP_ORIGIN);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('answers startup HEAD probes without redirecting or accessing the database', async () => {
    const response = await request(app).head('/');
    expect(response.status).toBe(200);
    expect(response.headers.location).toBeUndefined();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('keeps liveness separate from database checks and application quotas', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers.ratelimit).toBeUndefined();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('checks database readiness without consuming application quotas', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([]);
    const response = await request(app).get('/api/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
    expect(response.headers.ratelimit).toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });
  it('still authenticates application routes and keeps their rate limit', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.headers.ratelimit).toBeDefined();
  });
});
