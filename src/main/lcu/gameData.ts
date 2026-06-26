// LCU game-data 动态数据源（SQGG 同款方案）。
//
// 应用启动时后台预拉 LCU 的 game-data JSON 端点（永远最新、自带中文），
// 填充 heroData 的模块级缓存。LCU 没连上/端点异常时静默失败，
// heroData 继续用 datas.json 兜底（保证永远不空）。
//
// 图标 URL（关键）：renderer 的 <img> 无法直接加载 LCU 的 PNG（自签名证书
// + Basic Auth 是 Chromium 硬阻塞），所以图标拼到公网图床：
//   - 英雄/装备/技能：腾讯图床 game.gtimg.cn（已验证规律稳定）
//   - 符文：raw.communitydragon.org（腾讯图床对符文 404，CDragon 可用）
//
// 实测字段（2026-06 HN10 国服）：
//   英雄 champion-summary.json: {id, name(称号), description(真名!), alias, roles(小写!)}
//   装备 items.json: {id, name}（无 iconPath）
//   技能 summoner-spells.json: {id, name, iconPath:"/lol-game-data/assets/DATA/Spells/Icons2D/Summoner_flash.png"}
//   符文 perks.json: {id, name, iconPath:"/lol-game-data/assets/v1/perk-images/Styles/..."}

import { LcuClient } from './client';
import { getCachedCredentials } from './lockfile';
import { refreshFromLcu } from './heroData';
import { buildProfileIcon } from '../../shared/gameAssets';

// 腾讯图床基址（英雄/装备/技能用）
const GTIMG_BASE = 'https://game.gtimg.cn/images/lol/act/img/';
// communitydragon 基址（符文用）
const CDRAGON_BASE = 'https://raw.communitydragon.org/latest/game/';

// ---------- 图标 URL 拼接器 ----------

// 英雄头像：champion/{alias}.png（alias 如 "Annie"）
export function buildChampionIcon(alias: string): string {
  if (!alias) return '';
  return `${GTIMG_BASE}champion/${alias}.png`;
}

// 装备图标：item/{id}.png
export function buildItemIcon(id: number | string): string {
  return `${GTIMG_BASE}item/${id}.png`;
}

// 召唤师头像：profileicon/{id}.png
// 用腾讯图床（国内稳定），不依赖 ddragon 版本号（ddragon 是国外 CDN，渲染层加载易裂图）
export { buildProfileIcon };

// 技能图标：spell/{FileName}.png
// iconPath 形如 /lol-game-data/assets/DATA/Spells/Icons2D/Summoner_flash.png
// 取最后一段文件名拼到 spell/ 下（已验证 spell/Summoner_flash.png = 200）
export function buildSpellIcon(iconPath?: string): string {
  if (!iconPath) return '';
  const fileName = iconPath.split('/').pop();
  if (!fileName) return '';
  return `${GTIMG_BASE}spell/${fileName}`;
}

// 符文图标：转 communitydragon
// iconPath 形如 /lol-game-data/assets/v1/perk-images/Styles/Domination/Electrocute/Electrocute.png
// 目标：raw.communitydragon.org/latest/game/assets/perks/styles/domination/electrocute/electrocute.png
// 转换：去掉 /lol-game-data 前缀 + 可选的 /v1 + perk-images/→perks/，全小写
// （assets 前缀要保留，CDragon 路径含 assets；v1 要去掉；perk-images 要改成 perks）
export function buildRuneIcon(iconPath?: string): string {
  if (!iconPath) return '';
  // 去掉 /lol-game-data 前缀，得到 /assets/v1/perk-images/Styles/...
  let rel = iconPath.replace(/^\/lol-game-data/i, '');
  // 去掉 /v1（CDragon 路径不含 v1 这层）
  rel = rel.replace(/^\/assets\/v1\//i, '/assets/');
  // perk-images → perks
  rel = rel.replace(/perk-images/i, 'perks');
  // 全小写（CDragon 路径全小写）
  rel = rel.toLowerCase();
  return `${CDRAGON_BASE}${rel}`;
}

function buildGameDataAsset(iconPath?: string): string {
  if (!iconPath) return '';
  if (/^https?:\/\//i.test(iconPath)) return iconPath;
  let rel = iconPath.trim()
    .replace(/^\/lol-game-data\/assets\//i, '')
    .replace(/^\/lol-game-data\//i, '')
    .replace(/^\/+/, '');
  rel = rel.toLowerCase();
  return `${CDRAGON_BASE}${rel}`;
}

// ---------- LCU game-data 端点响应类型 ----------

interface LcuChampionSummary {
  id: number;
  name: string; // 称号（如"黑暗之女"）
  description: string; // 真名（如"安妮"）！注意：LCU 用 description 存真名
  alias: string; // 英文（如"Annie"）
  roles?: string[]; // 小写（如["mage","support"]）
}

interface LcuItem {
  id: number;
  name: string;
}

interface LcuSummonerSpell {
  id: number;
  name: string;
  iconPath?: string;
}

interface LcuPerk {
  id: number;
  name: string;
  iconPath?: string;
}

interface LcuAugment {
  id: number;
  name?: string;
  nameTRA?: string;
  iconPath?: string;
  augmentSmallIconPath?: string;
  rarity?: string;
}

// 把小写 role（如 "mage"）转成首字母大写（如 "Mage"），匹配 datas.json 的 tags 格式
function capitalizeRole(role: string): string {
  if (!role) return role;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// ---------- 预加载主逻辑 ----------

// 拉取 LCU 客户端实例。失败返回 null（凭证拿不到/客户端未运行）。
async function getLcuClient(): Promise<LcuClient | null> {
  try {
    const creds = await getCachedCredentials();
    if (!creds) return null;
    return new LcuClient(creds);
  } catch {
    return null;
  }
}

// 应用启动时后台调用：从 LCU 拉 4 类数据 + 填充 heroData 缓存。
// 全程静默容错——任何一步失败都不抛错，heroData 自然继续用 datas.json 兜底。
export async function preloadGameData(): Promise<void> {
  const client = await getLcuClient();
  if (!client) {
    console.log('[gameData] LCU 未连接，跳过预加载（用 datas.json 兜底）');
    return;
  }

  try {
    // 并行拉 game-data 数据（互不依赖）
    const [champions, items, spells, perks, augments] = await Promise.all([
      client.get<LcuChampionSummary[]>('/lol-game-data/assets/v1/champion-summary.json'),
      client.get<Record<string, LcuItem>>('/lol-game-data/assets/v1/items.json'),
      client.get<Record<string, LcuSummonerSpell>>('/lol-game-data/assets/v1/summoner-spells.json'),
      client.get<LcuPerk[]>('/lol-game-data/assets/v1/perks.json'),
      client.get<LcuAugment[]>('/lol-game-data/assets/v1/cherry-augments.json')
        .catch(() => [] as LcuAugment[]),
    ]);

    // 英雄映射（关键：description→真名→title，roles→capitalize→tags）
    const heroList = (champions ?? [])
      .filter((c) => c && typeof c.id === 'number' && c.alias)
      .map((c) => ({
        id: c.id,
        alias: c.alias,
        name: c.name ?? '', // 称号
        title: c.description ?? '', // 真名（LCU 用 description 存）
        avatar: buildChampionIcon(c.alias),
        tags: (c.roles ?? []).map(capitalizeRole),
      }));

    // 装备映射
    const itemList = Object.values(items ?? {})
      .filter((it) => it && typeof it.id === 'number')
      .map((it) => ({
        id: it.id,
        name: it.name ?? '',
        icon: buildItemIcon(it.id),
      }));

    // 技能映射
    const spellList = Object.values(spells ?? {})
      .filter((s) => s && typeof s.id === 'number')
      .map((s) => ({
        id: s.id,
        name: s.name ?? '',
        icon: buildSpellIcon(s.iconPath),
      }));

    // 符文映射
    const perkList = (perks ?? [])
      .filter((p) => p && typeof p.id === 'number')
      .map((p) => ({
        id: p.id,
        name: p.name ?? '',
        icon: buildRuneIcon(p.iconPath),
      }));

    const augmentList = (augments ?? [])
      .filter((augment) => augment && typeof augment.id === 'number')
      .map((augment) => ({
        id: augment.id,
        name: augment.nameTRA || augment.name || `强化 ${augment.id}`,
        icon: buildGameDataAsset(augment.augmentSmallIconPath || augment.iconPath),
        rarity: augment.rarity,
      }));

    if (heroList.length === 0) {
      console.warn('[gameData] 英雄列表为空，保持 datas.json 兜底');
      return;
    }

    refreshFromLcu({
      champions: heroList,
      items: itemList,
      spells: spellList,
      runes: perkList,
      augments: augmentList,
    });
    console.log(
      `[gameData] 预加载完成：${heroList.length} 英雄 / ${itemList.length} 装备 / ${spellList.length} 技能 / ${perkList.length} 符文 / ${augmentList.length} 强化`,
    );
  } catch (err) {
    console.warn('[gameData] 预加载失败，用 datas.json 兜底:', err);
  }
}
