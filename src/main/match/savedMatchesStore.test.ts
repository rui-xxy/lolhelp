import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedMatchesState } from '../../shared/api';

const electronMock = vi.hoisted(() => ({ userDataPath: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.userDataPath,
  },
}));

let testDirectory = '';

function createState(): SavedMatchesState {
  const match = {
    gameId: 101,
    gameCreation: Date.now(),
    win: true,
    championName: '测试英雄',
    kills: 1,
    deaths: 2,
    assists: 3,
    participants: [{ puuid: 'large-detail-payload' }],
  };
  const profile = {
    puuid: 'test-puuid',
    riotId: '测试玩家#1000',
  };

  return {
    groups: [],
    accounts: [
      {
        id: 'hn1:test-puuid',
        region: 'hn1',
        profile,
        matches: [match],
        follow: {
          enabled: true,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'hn1:test-puuid-2',
        region: 'hn1',
        profile: { ...profile, puuid: 'test-puuid-2', riotId: '测试玩家2#1000' },
        matches: [match],
        follow: {
          enabled: true,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    followAlerts: [
      {
        id: 'hn1:test-puuid:101',
        accountId: 'hn1:test-puuid',
        riotId: '测试玩家#1000',
        region: 'hn1',
        match,
        detectedAt: Date.now(),
      },
    ],
  } as unknown as SavedMatchesState;
}

beforeEach(() => {
  vi.resetModules();
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lolhelp-saved-matches-'));
  electronMock.userDataPath = testDirectory;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (testDirectory) fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe('saved matches store', () => {
  it('returns a lightweight alert projection without reading the archive again', async () => {
    const store = await import('./savedMatchesStore');
    await store.importSavedMatches(createState());
    const readSpy = vi.spyOn(fs, 'readFileSync');

    expect(store.getSavedMatchesSummary()).toEqual({
      followAlertIds: ['hn1:test-puuid:101'],
    });
    expect(store.getSavedMatchesSummary()).toEqual({
      followAlertIds: ['hn1:test-puuid:101'],
    });
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('keeps heavy match details out of the catalog and loads one account on demand', async () => {
    const store = await import('./savedMatchesStore');
    await store.importSavedMatches(createState());

    const catalog = store.getSavedMatchesCatalog();
    expect(catalog.accounts).toHaveLength(2);
    expect(catalog.accounts[0].matches[0]).not.toHaveProperty('participants');
    expect(catalog.followAlerts[0].match).not.toHaveProperty('participants');

    const account = store.getSavedMatchAccount('hn1:test-puuid');
    expect(account?.matches[0].participants).toEqual([{ puuid: 'large-detail-payload' }]);
  });

  it('persists a whole follow cycle with one compact atomic write', async () => {
    const store = await import('./savedMatchesStore');
    await store.importSavedMatches(createState());
    const writeSpy = vi.spyOn(fs.promises, 'writeFile');
    const checkedAt = Date.now() + 1_000;

    await store.saveSavedMatchFollowPollResults([
      { accountId: 'hn1:test-puuid', result: null, checkedAt },
      { accountId: 'hn1:test-puuid-2', result: null, checkedAt },
    ]);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const savedPath = path.join(testDirectory, 'lolhelper-saved-matches.json');
    const raw = fs.readFileSync(savedPath, 'utf8');
    const state = JSON.parse(raw) as SavedMatchesState;
    expect(raw.startsWith('{"accounts"')).toBe(true);
    expect(state.accounts.every((account) => account.follow?.lastCheckedAt === checkedAt)).toBe(true);
  });
});
