import type {
  AppSettings,
  LolConfigApplyProfileRequest,
  LolConfigApplyValuesRequest,
  LolConfigSaveProfileRequest,
  LolConfigValues,
  PlayerLookupRequest,
  ScoutConfig,
} from '../../shared/api';

type UnknownRecord = Record<string, unknown>;

function assertPayloadSize(value: unknown, label: string, maxBytes = 2 * 1024 * 1024): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${label} 无法序列化`);
  }
  if (Buffer.byteLength(serialized, 'utf-8') > maxBytes) {
    throw new Error(`${label} 数据量过大`);
  }
}

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 格式无效`);
  }
  return value as UnknownRecord;
}

function stringValue(
  value: unknown,
  label: string,
  options: { optional?: boolean; maxLength?: number } = {},
): string | undefined {
  if (value === undefined && options.optional) return undefined;
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`);
  if (value.length > (options.maxLength ?? 1000)) throw new Error(`${label} 过长`);
  return value;
}

function finiteNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
  optional = false,
): number | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} 必须在 ${min} 到 ${max} 之间`);
  }
  return value;
}

function optionalRegion(value: unknown): string | undefined {
  const region = stringValue(value, '大区', { optional: true, maxLength: 16 });
  if (region && !/^[A-Z0-9]+$/i.test(region)) throw new Error('大区格式无效');
  return region;
}

function validateHotkeys(value: unknown): void {
  const hotkeys = record(value, '热键配置');
  if (Object.keys(hotkeys).length > 100) throw new Error('热键分组数量异常');
  for (const [section, bindingsValue] of Object.entries(hotkeys)) {
    if (!section || section.length > 100) throw new Error('热键分组名称无效');
    const bindings = record(bindingsValue, `热键分组 ${section}`);
    if (Object.keys(bindings).length > 1000) throw new Error(`热键分组 ${section} 条目过多`);
    for (const [key, binding] of Object.entries(bindings)) {
      if (!key || key.length > 200 || typeof binding !== 'string' || binding.length > 500) {
        throw new Error(`热键 ${section}.${key} 格式无效`);
      }
    }
  }
}

export function validateRootPath(value: unknown): string | undefined {
  const rootPath = stringValue(value, '游戏目录', { optional: true, maxLength: 1000 });
  if (rootPath?.includes('\0')) throw new Error('游戏目录包含非法字符');
  return rootPath;
}

export function validateConfigValues(value: unknown): LolConfigValues {
  assertPayloadSize(value, '配置值');
  const values = record(value, '配置值');
  record(values.client, '客户端配置');
  record(values.game, '游戏配置');
  validateHotkeys(values.hotkeys ?? {});
  return value as LolConfigValues;
}

export function validateApplyValuesRequest(value: unknown): LolConfigApplyValuesRequest {
  const request = record(value, '应用配置请求');
  return {
    rootPath: validateRootPath(request.rootPath),
    values: validateConfigValues(request.values),
  };
}

export function validateSaveProfileRequest(value: unknown): LolConfigSaveProfileRequest {
  const request = record(value, '保存方案请求');
  return {
    name: stringValue(request.name, '方案名称', { maxLength: 100 }) ?? '',
    rootPath: validateRootPath(request.rootPath),
    values: validateConfigValues(request.values),
  };
}

export function validateApplyProfileRequest(value: unknown): LolConfigApplyProfileRequest {
  const request = record(value, '应用方案请求');
  return {
    profileId: stringValue(request.profileId, '方案 ID', { maxLength: 100 }) ?? '',
    rootPath: validateRootPath(request.rootPath),
  };
}

export function validateProfileId(value: unknown): string {
  return stringValue(value, '方案 ID', { maxLength: 100 }) ?? '';
}

export function validatePlayerLookupRequest(value: unknown): PlayerLookupRequest {
  const request = record(value, '战绩查询请求');
  return {
    name: stringValue(request.name, '玩家名称', { maxLength: 100 }) ?? '',
    maxMatches: finiteNumber(request.maxMatches, '最大场次', 1, 100, true),
    startIndex: finiteNumber(request.startIndex, '分页起点', 0, 100_000, true),
    page: finiteNumber(request.page, '页码', 0, 10_000, true),
    pageSize: finiteNumber(request.pageSize, '每页场次', 1, 100, true),
    region: optionalRegion(request.region),
    tag: stringValue(request.tag, '模式标签', { optional: true, maxLength: 32 }),
  };
}

export function validateScoutConfig(value: unknown): ScoutConfig {
  assertPayloadSize(value, '雷达配置', 512 * 1024);
  const config = record(value, '雷达配置');
  if (!Array.isArray(config.championIds) || config.championIds.length > 200) {
    throw new Error('英雄列表格式无效');
  }
  const championIds = config.championIds.map((id, index) => {
    const validated = finiteNumber(id, `英雄 ID ${index + 1}`, 1, 100_000);
    return Math.floor(validated ?? 0);
  });

  return {
    seedId: stringValue(config.seedId, '种子玩家', { maxLength: 100 }) ?? '',
    championIds,
    kdaThreshold: finiteNumber(config.kdaThreshold, 'KDA 阈值', 0, 100) ?? 0,
    hoursWindow: finiteNumber(config.hoursWindow, '时间窗', 1, 24 * 365) ?? 1,
    targetCount: finiteNumber(config.targetCount, '目标人数', 1, 100) ?? 1,
    region: optionalRegion(config.region),
    tag: stringValue(config.tag, '模式标签', { optional: true, maxLength: 32 }),
    topSeedsPerGame: finiteNumber(config.topSeedsPerGame, '每局种子数', 1, 10, true),
    excludePuuids: Array.isArray(config.excludePuuids)
      ? (() => {
          if (config.excludePuuids.length > 1000) throw new Error('排除玩家数量异常');
          return config.excludePuuids.map(
            (item) => stringValue(item, '排除玩家 ID', { maxLength: 200 }) ?? '',
          );
        })()
      : undefined,
  };
}

export function validateAppSettings(value: unknown): AppSettings {
  assertPayloadSize(value, '应用设置');
  const settings = record(value, '应用设置');
  if (!Array.isArray(settings.favoriteChampions)) throw new Error('收藏英雄格式无效');
  if (settings.favoriteChampions.length > 500) throw new Error('收藏英雄数量异常');
  for (const championId of settings.favoriteChampions) {
    finiteNumber(championId, '收藏英雄 ID', 1, 100_000);
  }
  if (settings.championPresets !== undefined && !Array.isArray(settings.championPresets)) {
    throw new Error('英雄方案格式无效');
  }
  return value as AppSettings;
}
