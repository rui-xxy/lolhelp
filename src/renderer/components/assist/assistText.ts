import type { FriendInfo } from '../../../shared/api';
import { getFriendStatusDisplay } from '../friendStatus';

// 助手页里所有给人看的文字：段位、在线状态、客户端返回的英文报错，都在这里翻成中文。

export const TIER_OPTIONS: Array<{ value: string; label: string; short: string }> = [
  { value: 'IRON', label: '坚韧黑铁', short: '黑铁' },
  { value: 'BRONZE', label: '英勇黄铜', short: '黄铜' },
  { value: 'SILVER', label: '不屈白银', short: '白银' },
  { value: 'GOLD', label: '荣耀黄金', short: '黄金' },
  { value: 'PLATINUM', label: '华贵铂金', short: '铂金' },
  { value: 'EMERALD', label: '流光翡翠', short: '翡翠' },
  { value: 'DIAMOND', label: '璀璨钻石', short: '钻石' },
  { value: 'MASTER', label: '超凡大师', short: '大师' },
  { value: 'GRANDMASTER', label: '傲世宗师', short: '宗师' },
  { value: 'CHALLENGER', label: '最强王者', short: '王者' },
];

// 大师及以上没有小段。
export const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export const DIVISIONS = ['IV', 'III', 'II', 'I'];

export const RANK_QUEUES: Array<{ value: string; label: string }> = [
  { value: 'RANKED_SOLO_5x5', label: '单双排位' },
  { value: 'RANKED_FLEX_SR', label: '灵活排位' },
];

export function tierLabel(tier: string): string {
  return TIER_OPTIONS.find((option) => option.value === tier.toUpperCase())?.label ?? tier;
}

export function queueLabel(queue: string): string {
  return RANK_QUEUES.find((option) => option.value === queue)?.label ?? queue;
}

export type PresenceTone = 'ok' | 'warn' | 'enemy' | 'muted' | 'glow';

export const PRESENCE_OPTIONS: Array<{ value: string; label: string; tone: PresenceTone; hint: string }> = [
  { value: 'auto', label: '跟随客户端', tone: 'glow', hint: '不动它，客户端显示什么就是什么' },
  { value: 'chat', label: '在线', tone: 'ok', hint: '好友看到你是绿色在线' },
  { value: 'away', label: '离开', tone: 'warn', hint: '好友看到你暂时离开' },
  { value: 'dnd', label: '请勿打扰', tone: 'enemy', hint: '好友看到你正忙，不方便邀请' },
  { value: 'offline', label: '隐身', tone: 'muted', hint: '好友看到你是离线' },
];

const AVAILABILITY_LABELS: Record<string, string> = {
  chat: '在线',
  online: '在线',
  away: '离开',
  dnd: '请勿打扰',
  mobile: '手机在线',
  offline: '离线',
};

export function friendStatus(friend: FriendInfo): { text: string; tone: PresenceTone; inGame: boolean } {
  const availability = String(friend.availability ?? '').toLowerCase();
  if (availability === 'offline' || !availability) return { text: '离线', tone: 'muted', inGame: false };
  if (availability === 'mobile') return { text: '手机在线', tone: 'muted', inGame: false };
  const display = getFriendStatusDisplay(friend);
  const inGame = friend.lol?.gameStatus === 'inGame';
  if (inGame) return { text: display.text || '游戏中', tone: 'enemy', inGame };
  if (display.kind === 'queue' || display.kind === 'champ-select') return { text: display.text, tone: 'warn', inGame };
  if (availability === 'away') return { text: '离开', tone: 'warn', inGame };
  if (display.kind === 'lobby') return { text: availability === 'dnd' ? '请勿打扰' : '在线', tone: availability === 'dnd' ? 'enemy' : 'ok', inGame };
  return { text: AVAILABILITY_LABELS[availability] ?? display.text ?? '在线', tone: 'ok', inGame };
}

export function rewardStatusLabel(status: string): string {
  if (status === 'PENDING_SELECTION') return '待领取';
  if (status === 'FULFILLED') return '已领取';
  if (status === 'PENDING_FULFILLMENT') return '发放中';
  if (status === 'FAILED') return '领取失败';
  return '其他状态';
}

// 客户端（LCU）报错多是英文，换成看得懂的中文。
export function localizeAssistMessage(raw: string): string {
  const message = String(raw ?? '').replace(/^Error:\s*/, '').trim();
  if (!message) return '';
  const http = message.match(/LCU\s+\w+\s+\S+\s+failed:\s*HTTP\s*(\d+)/i);
  if (http) {
    const code = Number(http[1]);
    if (code === 401 || code === 403) return `客户端没有允许这次操作（${code}）`;
    if (code === 404) return '客户端里找不到这项内容，可能当前状态下不能这么做';
    if (code === 409) return '客户端正忙，换个时机再试';
    if (code === 429) return '操作太频繁，稍等一会再试';
    if (code >= 500) return `客户端内部出错了（${code}），请稍后再试`;
    return `客户端拒绝了这次操作（${code}）`;
  }
  if (/timed?\s*out/i.test(message)) return '客户端没有及时响应，请稍后再试';
  if (/non-JSON/i.test(message)) return '客户端返回了看不懂的数据';
  if (/exceeded/i.test(message)) return '客户端返回的数据太大了';
  if (/ECONNREFUSED|ECONNRESET|socket hang up|connect/i.test(message)) return '连不上英雄联盟客户端，请确认客户端已经打开';
  if (/Failed to fetch|NetworkError/i.test(message)) return '网络请求失败，请检查网络';
  if (/not a function|undefined/i.test(message)) return '当前版本不支持这个操作，请重启助手';
  return message;
}
