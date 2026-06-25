import type { AssistOperationResult } from '../../shared/api';
import { LcuClient } from '../lcu/client';
import { getCachedCredentials } from '../lcu/lockfile';
import { getSettings } from '../settings/store';

async function run(
  key: string,
  action: () => Promise<unknown>,
  successMessage: string,
): Promise<AssistOperationResult> {
  try {
    await action();
    return { key, success: true, message: successMessage };
  } catch (error) {
    return {
      key,
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function applyAssistAccountSettings(): Promise<AssistOperationResult[]> {
  const creds = getCachedCredentials();
  if (!creds) throw new Error('未连接英雄联盟客户端');
  const client = new LcuClient(creds);
  const settings = getSettings().assist;
  const results: AssistOperationResult[] = [];

  if (settings.preferredPresence !== 'auto') {
    results.push(await run(
      'presence',
      () => client.put('/lol-chat/v1/me', { availability: settings.preferredPresence }),
      '在线状态已更新',
    ));
  }
  if (settings.statusMessage) {
    results.push(await run(
      'statusMessage',
      () => client.put('/lol-chat/v1/me', { statusMessage: settings.statusMessage }),
      '个人签名已更新',
    ));
  }
  if (settings.spoofRankEnabled) {
    results.push(await run(
      'rank',
      () => client.put('/lol-chat/v1/me', {
        lol: {
          rankedLeagueTier: settings.spoofRankTier,
          rankedLeagueQueue: settings.spoofRankQueue,
          rankedLeagueDivision: settings.spoofRankDivision,
        },
      }),
      '客户端展示段位已更新',
    ));
  }
  if (settings.profileIconId > 0) {
    results.push(await run(
      'profileIcon',
      () => client.put('/lol-chat/v1/me', { icon: settings.profileIconId }),
      '玩家头像已更新',
    ));
  }
  if (settings.profileBackgroundChampionId > 0) {
    results.push(await run(
      'profileBackground',
      () => client.post('/lol-summoner/v1/current-summoner/summoner-profile', {
        key: 'backgroundSkinId',
        value: settings.profileBackgroundChampionId < 1000
          ? settings.profileBackgroundChampionId * 1000
          : settings.profileBackgroundChampionId,
      }),
      '生涯背景已更新',
    ));
  }
  if (settings.removeTokens) {
    results.push(await run(
      'tokens',
      async () => {
        const me = await client.get<{ lol?: { bannerIdSelected?: string } }>('/lol-chat/v1/me');
        await client.post('/lol-challenges/v1/update-player-preferences', {
          challengeIds: [],
          bannerAccent: me.lol?.bannerIdSelected ?? '',
        });
      },
      '徽章已卸下',
    ));
  }
  if (settings.removePrestigeCrest) {
    results.push(await run(
      'crest',
      () => client.put('/lol-regalia/v2/current-summoner/regalia', {
        preferredCrestType: 'prestige',
        preferredBannerType: 'blank',
        selectedPrestigeCrest: 22,
      }),
      '头像框已卸下',
    ));
  }
  return results;
}
