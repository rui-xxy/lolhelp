// queueId → 中文模式名映射。
// 移植自参考项目 my-app/src/main/playerAnalyzer/constants.ts 的 queueNameMap（精简常用部分）。
// LCU 返回的是 queueId 数字（不是 gameMode 字符串），用它判断"单双排位/大乱斗/匹配"等。

const QUEUE_NAME_MAP: Record<number, string> = {
  420: '单双排位',
  440: '灵活组排',
  450: '极地大乱斗',
  490: '快速模式',
  400: '匹配模式',
  430: '匹配模式',
  700: '冠军杯赛',
  720: '冠军杯赛',
  1020: '单双排位',
  1040: '灵活组排',
  1090: '单双排位',
  1100: '灵活组排',
  1110: '快速模式',
  1130: '单双排位',
  1140: '灵活组排',
  1150: '快速模式',
  1700: '斗魂竞技场',
  1710: '斗魂竞技场',
  1900: 'URF',
  2000: '极地 Scrub',
  2010: '极地 Scrub',
  2020: 'URF',
  // 国服特有 / 活动
  1: '自定义',
  2: '自定义',
  14: '自定义',
  18: '自定义',
  65: 'ARAM 机器人',
  2400: '海克斯大乱斗', // KIWI 模式（国服大乱斗带特效）
  2500: '斗魂竞技场',
  900: 'URF',
  910: 'URF',
  920: 'URF',
  940: 'URF',
  950: 'URF',
  960: 'URF',
  980: 'URF',
  990: 'URF',
  1000: 'URF',
  1010: 'URF',
  1200: 'Nexus Blitz',
  1300: 'Nexus Blitz',
  1400: 'URF',
  1800: 'URF',
};

// 获取队列中文名。未知 queueId 回退为"模式 {id}"。
export function getQueueName(queueId: number): string {
  return QUEUE_NAME_MAP[queueId] ?? `模式 ${queueId}`;
}

// 判断是否为排位赛（用于 UI 强调或筛选）。
export function isRankedQueue(queueId: number): boolean {
  return [420, 440, 1020, 1040, 1090, 1100, 1130, 1140].includes(queueId);
}
