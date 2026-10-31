// 分类色板：给需要在 JS 里区分多个对象的场景（开黑小队、折线、模式）。
// 全部在 OKLCH 里放进同一亮度带（L ≈ 0.68–0.80，色度 ≈ 0.10–0.12），
// 和 tokens.css 的语义色同属一家，不再使用出厂饱和色。

export const LIVE_PARTY_COLORS = [
  '#49C7C0',
  '#D6A95B',
  '#7CC58C',
  '#BCA1ED',
  '#ED997B',
  '#72B8F2',
] as const;

export const RANKING_MODE_TONES = {
  ranked: '#5CB28F',
  aram: '#6DA3DA',
  arena: '#D28A69',
  hextech: '#A890D4',
} as const;

export const RANKING_HERO_TONES = [
  '#D77787',
  '#32B08D',
  '#639BE1',
  '#AF82D0',
  '#CE8545',
  '#01AAC6',
] as const;

export const MATCH_TIMELINE_COLORS = [
  '#E88AA8',
  '#6FC8FF',
  '#C8A747',
  '#52D7C1',
  '#AA9DF1',
  '#E9A1E3',
  '#92BA66',
  '#FEA47C',
  '#31BDDA',
  '#DBA6F3',
] as const;

// 与 tokens.css 的 --color-ally / --color-enemy 一致：蓝 = 我方/胜，红 = 敌方/负。
export const MATCH_TEAM_COLORS = {
  blue: '#6DA9EB',
  red: '#E17177',
} as const;
