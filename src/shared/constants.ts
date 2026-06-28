export const DEFAULT_LOL_ROOT_PATH = 'D:\\WeGameApps\\英雄联盟';

export const APP_LAYOUT = {
  workspaceWidth: 1280,
  friendPanelWidth: 288,
  hiddenFriendPanelWidth: 0,
  expandedSidebarWidth: 240,
  collapsedSidebarWidth: 64,
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
