import type { FriendInfo } from '../../shared/api';

export type FriendStatusKind =
  | 'ranked-solo'
  | 'ranked-flex'
  | 'normal-game'
  | 'aram'
  | 'arena'
  | 'tft'
  | 'queue'
  | 'champ-select'
  | 'lobby'
  | 'online'
  | 'offline';

export interface FriendStatusDisplay {
  kind: FriendStatusKind;
  text: string;
}

function fallbackModeName(friend: FriendInfo): string {
  const lol = friend.lol;
  if (!lol) return '';
  const gameMode = String(lol.gameMode ?? '').toUpperCase();
  const queueType = String(lol.gameQueueType ?? '').toUpperCase();

  if (queueType === 'RANKED_SOLO_5X5') return '单双排位';
  if (queueType === 'RANKED_FLEX_SR') return '灵活排位';
  if (queueType === 'RANKED_TFT') return '云顶之弈（排位）';
  if (gameMode === 'TFT') return '云顶之弈';
  if (gameMode === 'CHERRY') return '斗魂竞技场';
  if (gameMode === 'KIWI') return '海克斯大乱斗';
  if (gameMode === 'ARAM') return '极地大乱斗';
  return '';
}

function inGameKind(friend: FriendInfo): FriendStatusKind {
  const lol = friend.lol;
  const gameMode = String(lol?.gameMode ?? '').toUpperCase();
  const queueType = String(lol?.gameQueueType ?? '').toUpperCase();

  if (queueType === 'RANKED_SOLO_5X5') return 'ranked-solo';
  if (queueType === 'RANKED_FLEX_SR') return 'ranked-flex';
  if (gameMode === 'TFT') return 'tft';
  if (gameMode === 'CHERRY') return 'arena';
  if (gameMode === 'ARAM' || gameMode === 'KIWI') return 'aram';
  return 'normal-game';
}

export function getFriendStatusDisplay(friend: FriendInfo): FriendStatusDisplay {
  if (friend.availability === 'offline') return { kind: 'offline', text: '' };
  const lol = friend.lol;
  if (!lol) return { kind: 'online', text: '在线' };

  const modeName = lol.gameQueueName?.trim() || fallbackModeName(friend);
  if (lol.gameStatus === 'inGame') {
    if (lol.gameQueueType === 'RANKED_SOLO_5x5') {
      return { kind: 'ranked-solo', text: '排位中' };
    }
    if (lol.gameQueueType === 'RANKED_FLEX_SR') {
      return { kind: 'ranked-flex', text: '灵活排位中' };
    }
    return {
      kind: inGameKind(friend),
      text: modeName || '游戏中',
    };
  }
  if (lol.gameStatus === 'inQueue') {
    return { kind: 'queue', text: modeName ? `${modeName} · 排队中` : '排队中' };
  }
  if (lol.gameStatus === 'championSelect') {
    return {
      kind: 'champ-select',
      text: modeName ? `${modeName} · 选人中` : '选人中',
    };
  }
  return { kind: 'lobby', text: '大厅' };
}
