import { describe, expect, it, vi } from 'vitest';
import {
  requestReplayAction,
  requestReplayAvailability,
  type ReplayClient,
} from './replayService';

function replayClient(post: (requestPath: string, body: unknown) => Promise<unknown>): ReplayClient {
  return { post };
}

describe('requestReplayAction', () => {
  it('uses the League client replay endpoint and official component type', async () => {
    const post = vi.fn(async () => undefined);

    const result = await requestReplayAction(replayClient(post), 123456789, 'download');

    expect(result.success).toBe(true);
    expect(post).toHaveBeenCalledWith(
      '/lol-replays/v1/rofls/123456789/download',
      { componentType: 'replay-button_match-history' },
    );
  });

  it('rejects invalid game ids before contacting the client', async () => {
    const post = vi.fn(async () => undefined);

    const result = await requestReplayAction(replayClient(post), '../bad-id', 'watch');

    expect(result.success).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('explains when an old replay is no longer available', async () => {
    const post = vi.fn(async () => {
      throw new Error('LCU POST failed: HTTP 404');
    });

    const result = await requestReplayAction(replayClient(post), 99, 'watch');

    expect(result).toEqual({
      success: false,
      message: '这场回放已过期，或与当前客户端版本不兼容',
    });
  });
});

describe('requestReplayAvailability', () => {
  it('registers metadata before checking a replay from another player', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('LCU GET failed: HTTP 404'))
      .mockResolvedValueOnce({ state: 'download', downloadProgress: 1637893399 });
    const post = vi.fn(async () => undefined);

    const availability = await requestReplayAvailability(
      { get, post },
      500809889233,
      {
        gameId: 500809889233,
        gameVersion: '16.13.790.6961',
        gameType: 'MATCHED_GAME',
        queueId: 420,
        gameCreation: 1783004506282,
        gameDuration: 1041,
      },
    );

    expect(post).toHaveBeenCalledWith(
      '/lol-replays/v2/metadata/500809889233/create',
      {
        gameVersion: '16.13.790.6961',
        gameType: 'MATCHED_GAME',
        queueId: 420,
        gameEnd: 1783005547282,
      },
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(availability).toMatchObject({
      available: true,
      state: 'download',
      downloadProgress: 0,
    });
  });

  it('shows download and watch states as available', async () => {
    const download = await requestReplayAvailability(
      { get: vi.fn(async () => ({ state: 'download', downloadProgress: 0 })) },
      123,
    );
    const watch = await requestReplayAvailability(
      { get: vi.fn(async () => ({ state: 'watch', downloadProgress: 100 })) },
      123,
    );

    expect(download.available).toBe(true);
    expect(watch.available).toBe(true);
  });

  it('hides expired and incompatible replays', async () => {
    const expired = await requestReplayAvailability(
      { get: vi.fn(async () => ({ state: 'missingOrExpired' })) },
      123,
    );
    const incompatible = await requestReplayAvailability(
      { get: vi.fn(async () => ({ state: 5 })) },
      123,
    );

    expect(expired.available).toBe(false);
    expect(incompatible).toMatchObject({ available: false, state: 'incompatible' });
  });

  it('uses the replay metadata endpoint', async () => {
    const get = vi.fn(async () => ({ state: 'download' }));

    await requestReplayAvailability({ get }, 987654321);

    expect(get).toHaveBeenCalledWith('/lol-replays/v1/metadata/987654321');
  });
});
