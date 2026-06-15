import { describe, it, expect } from 'vitest';
import { putTeamInstall, getTeamInstall, teamKey, type KVNamespace } from '../src/storage.js';

function memoryKV(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

describe('storage', () => {
  it('namespaces keys under team:', () => {
    expect(teamKey('T01')).toBe('team:T01');
  });

  it('round-trips an install', async () => {
    const kv = memoryKV();
    await putTeamInstall(kv, {
      teamId: 'T01',
      teamName: 'Acme',
      accessToken: 'xoxb-1',
      botUserId: 'B1',
      scope: 'chat:write,commands',
      installedAt: '2026-06-15T00:00:00.000Z',
    });
    const got = await getTeamInstall(kv, 'T01');
    expect(got).toEqual({
      teamId: 'T01',
      teamName: 'Acme',
      accessToken: 'xoxb-1',
      botUserId: 'B1',
      scope: 'chat:write,commands',
      installedAt: '2026-06-15T00:00:00.000Z',
    });
  });

  it('returns null for an unknown team', async () => {
    const kv = memoryKV();
    expect(await getTeamInstall(kv, 'TX')).toBeNull();
  });

  it('returns null for an empty team id', async () => {
    const kv = memoryKV();
    expect(await getTeamInstall(kv, '')).toBeNull();
  });

  it('treats corrupt rows as missing', async () => {
    const kv = memoryKV();
    await kv.put(teamKey('T01'), 'not-json');
    expect(await getTeamInstall(kv, 'T01')).toBeNull();
  });

  it('treats rows missing required fields as missing', async () => {
    const kv = memoryKV();
    await kv.put(teamKey('T01'), JSON.stringify({ teamId: 'T01' /* no accessToken */ }));
    expect(await getTeamInstall(kv, 'T01')).toBeNull();
  });

  it('refuses to write without a team id', async () => {
    const kv = memoryKV();
    await expect(
      putTeamInstall(kv, {
        teamId: '',
        accessToken: 'x',
        installedAt: '2026-06-15T00:00:00.000Z',
      }),
    ).rejects.toThrow(/teamId/);
  });
});
