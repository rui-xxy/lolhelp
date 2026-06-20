// 国服大区码 → SGP 战绩服务器域名映射。
// 数据来自参考项目 my-app/src/main/lolClient.ts 的 TENCENT_REGIONS（完整 27 个大区）。
// SGP（Service Gateway Platform）是腾讯云端战绩数据库，能查完整历史（不受 LCU 21 场缓存限制）。
// 每个大区有独立 SGP 域名，战绩只存在对应集群，必须用对域名。

export interface RegionConfig {
  key: string; // 大区码（来自日志 --t.location 最后一段，如 HN10）
  name: string; // 大区中文名
  matchHistory: string; // SGP 战绩端点域名（含端口 21019）
  common: string; // SGP 通用端点域名（段位等）
}

// 由域名拼 RegionConfig（matchHistory 和 common 相同）
function r(key: string, name: string, host: string): RegionConfig {
  return { key, name, matchHistory: host, common: host };
}

const REGION_LIST: RegionConfig[] = [
  r('HN1', '艾欧尼亚', 'https://hn1-k8s-sgp.lol.qq.com:21019'),
  r('HN2', '祖安', 'https://hn2-k8s-sgp.lol.qq.com:21019'),
  r('HN3', '诺克萨斯', 'https://hn3-k8s-sgp.lol.qq.com:21019'),
  r('HN4', '班德尔城', 'https://hn4-k8s-sgp.lol.qq.com:21019'),
  r('HN5', '皮尔特沃夫', 'https://hn5-k8s-sgp.lol.qq.com:21019'),
  r('HN6', '战争学院', 'https://hn6-k8s-sgp.lol.qq.com:21019'),
  r('HN7', '巨神峰', 'https://hn7-k8s-sgp.lol.qq.com:21019'),
  r('HN8', '雷瑟守备', 'https://hn8-k8s-sgp.lol.qq.com:21019'),
  r('HN9', '裁决之地', 'https://hn9-k8s-sgp.lol.qq.com:21019'),
  r('HN10', '黑色玫瑰', 'https://hn10-k8s-sgp.lol.qq.com:21019'),
  r('HN11', '暗影岛', 'https://hn11-k8s-sgp.lol.qq.com:21019'),
  r('HN12', '钢铁烈阳', 'https://hn12-k8s-sgp.lol.qq.com:21019'),
  r('HN13', '水晶之痕', 'https://hn13-k8s-sgp.lol.qq.com:21019'),
  r('HN14', '均衡教派', 'https://hn14-k8s-sgp.lol.qq.com:21019'),
  r('HN15', '扭曲丛林', 'https://hn15-k8s-sgp.lol.qq.com:21019'),
  r('HN16', '教育网专区', 'https://hn16-k8s-sgp.lol.qq.com:21019'),
  r('HN17', '蛮荒之地', 'https://hn17-k8s-sgp.lol.qq.com:21019'),
  r('HN18', '恕瑞玛', 'https://hn18-k8s-sgp.lol.qq.com:21019'),
  r('HN19', '皮城警备', 'https://hn19-k8s-sgp.lol.qq.com:21019'),
  r('BGP1', '男爵领域', 'https://bgp1-sgp.lol.qq.com:21019'),
  r('BGP2', '峡谷之巅', 'https://bgp2-k8s-sgp.lol.qq.com:21019'),
  r('WT1', '网通一区', 'https://wt1-k8s-sgp.lol.qq.com:21019'),
  r('NJ100', '联盟一区', 'https://nj100-sgp.lol.qq.com:21019'),
  r('GZ100', '联盟二区', 'https://gz100-sgp.lol.qq.com:21019'),
  r('CQ100', '联盟三区', 'https://cq100-sgp.lol.qq.com:21019'),
  r('TJ100', '联盟四区', 'https://tj100-sgp.lol.qq.com:21019'),
  r('TJ101', '联盟五区', 'https://tj101-sgp.lol.qq.com:21019'),
];

// 按大区码查 SGP 配置。未知大区返回 null。
export function getRegionConfig(key: string): RegionConfig | null {
  return REGION_LIST.find((reg) => reg.key === key.toUpperCase()) ?? null;
}

// 所有支持的大区（供 UI 大区选择器用）。
export function getAllRegions(): RegionConfig[] {
  return REGION_LIST;
}

// 从 LeagueClientUx.log 的 --t.location=loltencent.gz2.HN10 提取大区码。
export function extractRegionFromLocation(location: string): string {
  if (!location) return '';
  const parts = location.split('.');
  return parts[parts.length - 1].toUpperCase();
}
