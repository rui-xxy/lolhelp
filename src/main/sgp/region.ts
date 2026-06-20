// 国服大区码 → SGP 战绩服务器域名映射。
// 数据来自逆向 SQGG 工具的 lol-DkP5vDP6.js 地区映射表。
// SGP（Service Gateway Platform）是腾讯云端战绩数据库，能查完整历史（不受 LCU 21 场缓存限制）。
// 每个大区集群部署独立 SGP，战绩只存在对应集群，必须用对域名。

export interface RegionConfig {
  key: string; // 大区码（来自日志 --t.location 最后一段，如 HN10）
  name: string; // 大区中文名
  matchHistory: string; // SGP 战绩端点域名（含端口 21019）
  common: string; // SGP 通用端点域名（段位等）
}

const REGION_LIST: RegionConfig[] = [
  { key: 'HN1', name: '艾欧尼亚', matchHistory: 'https://hn1-k8s-sgp.lol.qq.com:21019', common: 'https://hn1-k8s-sgp.lol.qq.com:21019' },
  { key: 'HN10', name: '黑色玫瑰', matchHistory: 'https://hn10-k8s-sgp.lol.qq.com:21019', common: 'https://hn10-k8s-sgp.lol.qq.com:21019' },
  { key: 'TJ100', name: '比尔吉沃特', matchHistory: 'https://tj100-sgp.lol.qq.com:21019', common: 'https://tj100-sgp.lol.qq.com:21019' },
  { key: 'NJ100', name: '祖安', matchHistory: 'https://nj100-sgp.lol.qq.com:21019', common: 'https://nj100-sgp.lol.qq.com:21019' },
  { key: 'GZ100', name: '诺克萨斯', matchHistory: 'https://gz100-sgp.lol.qq.com:21019', common: 'https://gz100-sgp.lol.qq.com:21019' },
  { key: 'TJ101', name: '德玛西亚', matchHistory: 'https://tj101-sgp.lol.qq.com:21019', common: 'https://tj101-sgp.lol.qq.com:21019' },
  { key: 'CQ100', name: '班德尔城', matchHistory: 'https://cq100-sgp.lol.qq.com:21019', common: 'https://cq100-sgp.lol.qq.com:21019' },
  { key: 'BGP2', name: '峡谷之巅', matchHistory: 'https://bgp2-k8s-sgp.lol.qq.com:21019', common: 'https://bgp2-k8s-sgp.lol.qq.com:21019' },
];

// 按大区码查 SGP 配置。未知大区返回 null。
export function getRegionConfig(key: string): RegionConfig | null {
  return REGION_LIST.find((r) => r.key === key.toUpperCase()) ?? null;
}

// 所有支持的大区（供后续 UI 做大区选择器用）。
export function getAllRegions(): RegionConfig[] {
  return REGION_LIST;
}

// 从 LeagueClientUx.log 的 --t.location=loltencent.gz2.HN10 提取大区码。
// 日志格式：loltencent.{机房}.{大区码}，取最后一段。
export function extractRegionFromLocation(location: string): string {
  if (!location) return '';
  const parts = location.split('.');
  return parts[parts.length - 1].toUpperCase();
}
