export const DEFAULT_LOL_ROOT_PATH = 'D:\\WeGameApps\\英雄联盟';

export const APP_LAYOUT = {
  // 流式布局：窗口可自由缩放，默认尺寸会按屏幕可用区域收缩，并记住上次尺寸。
  // 默认尺寸刚好放下实时对局的 5 组对位；其他页面在这个尺寸下也要能完整看到（放不下的地方自己滚动）。
  defaultWindowWidth: 1320,
  defaultWindowHeight: 760,
  minWindowWidth: 1200,
  minWindowHeight: 720,
  topbarHeight: 48,
  railWidth: 72,
  friendDrawerWidth: 300,
  // 窗口足够宽时好友抽屉停靠在右侧，否则浮在内容上方。
  friendDrawerDockMinWidth: 1600,
} as const;

export const LOL_REGIONS = [
  { key: 'HN1', name: '艾欧尼亚' },
  { key: 'HN10', name: '黑色玫瑰' },
  { key: 'BGP2', name: '峡谷之巅' },
  {
    key: 'NJ100',
    name: '联盟一区',
    description: '祖安 / 皮尔特沃夫 / 巨神峰 / 教育网 / 男爵领域 / 均衡教派 / 影流 / 守望之海',
  },
  {
    key: 'GZ100',
    name: '联盟二区',
    description: '卡拉曼达 / 暗影岛 / 征服之海 / 诺克萨斯 / 战争学院 / 雷瑟守备',
  },
  {
    key: 'CQ100',
    name: '联盟三区',
    description: '班德尔城 / 裁决之地 / 水晶之痕 / 钢铁烈阳 / 皮城警备',
  },
  {
    key: 'TJ100',
    name: '联盟四区',
    description: '比尔吉沃特 / 弗雷尔卓德 / 扭曲丛林',
  },
  {
    key: 'TJ101',
    name: '联盟五区',
    description: '德玛西亚 / 无畏先锋 / 恕瑞玛 / 巨龙之巢',
  },
] as const;

export const LOL_REGION_ALIASES = [
  { key: 'HN2', name: '祖安', targetKey: 'NJ100' },
  { key: 'HN3', name: '诺克萨斯', targetKey: 'GZ100' },
  { key: 'HN4', name: '班德尔城', targetKey: 'CQ100' },
  { key: 'HN5', name: '皮尔特沃夫', targetKey: 'NJ100' },
  { key: 'HN6', name: '战争学院', targetKey: 'GZ100' },
  { key: 'HN7', name: '巨神峰', targetKey: 'NJ100' },
  { key: 'HN8', name: '雷瑟守备', targetKey: 'GZ100' },
  { key: 'HN9', name: '裁决之地', targetKey: 'CQ100' },
  { key: 'HN11', name: '暗影岛', targetKey: 'GZ100' },
  { key: 'HN12', name: '钢铁烈阳', targetKey: 'CQ100' },
  { key: 'HN13', name: '水晶之痕', targetKey: 'CQ100' },
  { key: 'HN14', name: '均衡教派', targetKey: 'NJ100' },
  { key: 'HN15', name: '扭曲丛林', targetKey: 'TJ100' },
  { key: 'HN16', name: '教育网专区', targetKey: 'NJ100' },
  { key: 'HN17', name: '影流', targetKey: 'NJ100' },
  { key: 'HN18', name: '恕瑞玛', targetKey: 'TJ101' },
  { key: 'HN19', name: '皮城警备', targetKey: 'CQ100' },
  { key: 'BGP1', name: '男爵领域', targetKey: 'NJ100' },
  { key: 'WT1', name: '比尔吉沃特', targetKey: 'TJ100' },
] as const;
