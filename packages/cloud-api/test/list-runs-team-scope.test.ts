/**
 * Regression test for mcp-7: GET /v1/runs must be team-scoped, not strictly
 * per-key-owner.
 *
 * In the canonical flow CI submits runs under a team service account while
 * developers carry personal keys. Listing strictly by user_id meant a personal
 * key saw zero of the team's CI runs — the agent reported "CI hasn't finished
 * yet" forever. This drives the real Hono handler with three users (alice =
 * team owner / CI, bob = member, eve = unrelated) and asserts the union and the
 * explicit `?teamId=` membership gate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const executeInSandbox = vi.fn();
vi.mock('../src/daytona-runner.js', () => ({ executeInSandbox }));

import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import { hashKey } from '../src/auth/keys.js';
import type { Run } from '../src/types.js';

const ALICE_KEY = 'alice-ci-key';
const BOB_KEY = 'bob-personal-key';
const EVE_KEY = 'eve-unrelated-key';

// In dev/test mode the auth middleware maps a bearer token to `demo:<hash>`.
const demoId = async (key: string) => `demo:${await hashKey(key)}`;

function get(path: string, key: string) {
  return app.request(path, { headers: { Authorization: `Bearer ${key}` } });
}

function makeRun(id: string, projectId: string): Run {
  return {
    id,
    status: 'completed',
    url: 'https://shop.example.com',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.05,
    ai: null,
    createdAt: '2026-06-10T10:00:00.000Z',
    completedAt: '2026-06-10T10:00:30.000Z',
    results: [],
    reportUrl: `/v1/reports/${id}`,
    projectId,
  };
}

describe('GET /v1/runs — team scoping (mcp-7)', () => {
  let aliceId: string;
  let bobId: string;
  let eveId: string;

  beforeEach(async () => {
    resetMemoryStore();
    const store = getMemoryStore();

    aliceId = await demoId(ALICE_KEY);
    bobId = await demoId(BOB_KEY);
    eveId = await demoId(EVE_KEY);

    for (const id of [aliceId, bobId, eveId]) {
      await store.createUser({ id, plan: 'free', createdAt: 'now' });
    }

    // Team "acme": alice owner, bob member, eve not a member.
    await store.createTeam(
      { id: 'acme', name: 'Acme', plan: 'team', createdAt: 'now' },
      aliceId,
    );
    await store.addMember({ teamId: 'acme', userId: bobId, role: 'member', createdAt: 'now' });

    // A project under acme; alice's CI submits runs against it.
    await store.createProject({ id: 'proj_acme', teamId: 'acme', name: 'shop', createdAt: 'now' });
    await store.createRun(makeRun('run_ci_1', 'proj_acme'), aliceId);
    await store.createRun(makeRun('run_ci_2', 'proj_acme'), aliceId);

    // Eve has one personal run not tied to any team.
    await store.createRun(
      { ...makeRun('run_eve', ''), projectId: undefined },
      eveId,
    );
  });

  it('bob (team member) sees alice CI runs by default', async () => {
    const res = await get('/v1/runs', BOB_KEY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: Run[]; total: number };
    const ids = body.runs.map((r) => r.id).sort();
    expect(ids).toEqual(['run_ci_1', 'run_ci_2']);
  });

  it('bob sees alice CI runs via explicit ?teamId=acme', async () => {
    const res = await get('/v1/runs?teamId=acme', BOB_KEY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: Run[] };
    expect(body.runs.map((r) => r.id).sort()).toEqual(['run_ci_1', 'run_ci_2']);
  });

  it('eve (non-member) gets 403 for ?teamId=acme', async () => {
    const res = await get('/v1/runs?teamId=acme', EVE_KEY);
    expect(res.status).toBe(403);
  });

  it('eve sees only her own runs by default', async () => {
    const res = await get('/v1/runs', EVE_KEY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: Run[] };
    expect(body.runs.map((r) => r.id)).toEqual(['run_eve']);
  });

  it('alice (owner) still sees her own team runs by default', async () => {
    const res = await get('/v1/runs', ALICE_KEY);
    const body = (await res.json()) as { runs: Run[] };
    expect(body.runs.map((r) => r.id).sort()).toEqual(['run_ci_1', 'run_ci_2']);
  });

  it('bob (team member) can fetch alice CI runs by id', async () => {
    const res = await get('/v1/runs/run_ci_1', BOB_KEY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Run;
    expect(body.id).toBe('run_ci_1');
  });

  it('eve (non-member) gets 404 for alice CI run', async () => {
    const res = await get('/v1/runs/run_ci_1', EVE_KEY);
    expect(res.status).toBe(404);
  });
});
