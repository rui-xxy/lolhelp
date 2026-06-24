import { LOL_REGIONS } from '../../shared/constants';

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

const NON_K8S_REGIONS = new Set(['BGP1', 'NJ100', 'GZ100', 'CQ100', 'TJ100', 'TJ101']);
const REGION_LIST: RegionConfig[] = LOL_REGIONS.map(({ key, name }) => {
  const prefix = key.toLowerCase();
  const host = NON_K8S_REGIONS.has(key)
    ? `https://${prefix}-sgp.lol.qq.com:21019`
    : `https://${prefix}-k8s-sgp.lol.qq.com:21019`;
  return r(key, name, host);
});

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
