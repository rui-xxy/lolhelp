import { LOL_REGIONS, LOL_REGION_ALIASES } from '../../shared/constants';

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

const REGION_HOSTS: Record<string, string> = {
  HN1: 'https://hn1-k8s-sgp.lol.qq.com:21019',
  HN10: 'https://hn10-k8s-sgp.lol.qq.com:21019',
  BGP2: 'https://bgp2-k8s-sgp.lol.qq.com:21019',
  NJ100: 'https://nj100-sgp.lol.qq.com:21019',
  GZ100: 'https://gz100-sgp.lol.qq.com:21019',
  CQ100: 'https://cq100-sgp.lol.qq.com:21019',
  TJ100: 'https://tj100-sgp.lol.qq.com:21019',
  TJ101: 'https://tj101-sgp.lol.qq.com:21019',
  PBE: 'https://pbe-sgp.lol.qq.com:21019',
  PREPBE: 'https://prepbe-sgp.lol.qq.com:21019',
};

const REGION_ALIAS_BY_KEY = new Map<string, string>(
  LOL_REGION_ALIASES.map((region) => [region.key, region.targetKey]),
);

const REGION_LIST: RegionConfig[] = LOL_REGIONS.map(({ key, name }) =>
  r(key, name, REGION_HOSTS[key] ?? `https://${key.toLowerCase()}-sgp.lol.qq.com:21019`),
);

export function normalizeRegionKey(key: string): string {
  const raw = String(key ?? '').trim().toUpperCase().replace(/^TENCENT_/, '');
  return REGION_ALIAS_BY_KEY.get(raw) ?? raw;
}

// 按大区码查 SGP 配置。未知大区返回 null。
export function getRegionConfig(key: string): RegionConfig | null {
  const normalized = normalizeRegionKey(key);
  const region = REGION_LIST.find((reg) => reg.key === normalized);
  if (region) return region;
  const host = REGION_HOSTS[normalized];
  return host ? r(normalized, normalized, host) : null;
}

// 所有支持的大区（供 UI 大区选择器用）。
export function getAllRegions(): RegionConfig[] {
  return REGION_LIST;
}

// 从 LeagueClientUx.log 的 --t.location=loltencent.gz2.HN10 提取大区码。
export function extractRegionFromLocation(location: string): string {
  if (!location) return '';
  const parts = location.split('.');
  return normalizeRegionKey(parts[parts.length - 1]);
}
