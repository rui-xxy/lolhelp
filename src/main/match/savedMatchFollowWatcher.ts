import { Notification } from 'electron';
import type { SavedMatchFollowAlert } from '../../shared/api';
import { searchPlayer } from './matchService';
import {
  getSavedMatches,
  saveSavedMatchFollowPollResult,
} from './savedMatchesStore';

const FOLLOW_POLL_INTERVAL_MS = 60_000;
const FOLLOW_POLL_START_DELAY_MS = 5_000;
const LATEST_MATCH_COUNT = 1;

let pollTimer: NodeJS.Timeout | null = null;
let polling = false;

function formatRiotName(riotId: string): string {
  return riotId.split('#')[0] || riotId || '未知账号';
}

function formatAlertLine(alert: SavedMatchFollowAlert): string {
  const match = alert.match;
  const result = match.win ? '胜利' : '失败';
  const champion = match.championName || '未知英雄';
  return `${formatRiotName(alert.riotId)}：${result} ${champion} ${match.kills}/${match.deaths}/${match.assists}`;
}

function showFollowNotification(alerts: SavedMatchFollowAlert[]): void {
  if (!Notification.isSupported() || alerts.length === 0) return;
  const lines = alerts.map(formatAlertLine);
  const body = lines.length > 5
    ? `${lines.slice(0, 5).join('\n')}\n还有 ${lines.length - 5} 个账号满足条件`
    : lines.join('\n');
  new Notification({
    title: `关注战绩更新：${alerts.length} 个账号有 1 小时内战绩`,
    body,
  }).show();
}

async function pollSavedMatchFollowAccounts(): Promise<void> {
  if (polling) return;
  polling = true;
  const notifyAlerts: SavedMatchFollowAlert[] = [];

  try {
    const state = getSavedMatches();
    const followedAccounts = state.accounts.filter((account) => account.follow?.enabled);
    for (const account of followedAccounts) {
      const riotId = account.profile.riotId?.trim();
      if (!riotId) {
        saveSavedMatchFollowPollResult(account.id, null, Date.now(), '账号缺少 Riot ID');
        continue;
      }

      try {
        const result = await searchPlayer({
          name: riotId,
          region: account.region,
          pageSize: LATEST_MATCH_COUNT,
          maxMatches: LATEST_MATCH_COUNT,
        });
        const saved = saveSavedMatchFollowPollResult(
          account.id,
          result,
          Date.now(),
          result.error,
        );
        if (saved.shouldNotify && saved.alert) {
          notifyAlerts.push(saved.alert);
        }
      } catch (error) {
        saveSavedMatchFollowPollResult(
          account.id,
          null,
          Date.now(),
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (notifyAlerts.length > 0) {
      showFollowNotification(notifyAlerts);
    }
  } catch (error) {
    console.warn('[saved-matches] follow watcher failed:', error);
  } finally {
    polling = false;
  }
}

export function startSavedMatchFollowWatcher(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void pollSavedMatchFollowAccounts();
  }, FOLLOW_POLL_INTERVAL_MS);
  setTimeout(() => void pollSavedMatchFollowAccounts(), FOLLOW_POLL_START_DELAY_MS);
}

export function stopSavedMatchFollowWatcher(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
