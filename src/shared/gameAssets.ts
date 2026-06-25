const SQGG_PROFILE_ICON_BASE =
  'https://wegame.gtimg.com/g.26-r.c2d3c/helper/lol/assis/images/resources/usericon/';
const GTIMG_PROFILE_ICON_BASE = 'https://game.gtimg.cn/images/lol/act/img/profileicon/';
const CDRAGON_PROFILE_ICON_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/';
const DDRAGON_CHAMPION_SPLASH_BASE = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/';

function normalizeIconId(id: number | string | null | undefined): string {
  const value = String(id ?? '').trim();
  if (!value || value === '0' || value === 'NaN') return '';
  return value;
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

// Same primary source League SQGG uses for summoner profile icons.
export function buildProfileIcon(id: number | string | null | undefined): string {
  const iconId = normalizeIconId(id);
  return iconId ? `${SQGG_PROFILE_ICON_BASE}${iconId}.png` : '';
}

export function buildProfileIconCandidates(id: number | string | null | undefined): string[] {
  const iconId = normalizeIconId(id);
  if (!iconId) return [];

  return uniqueUrls([
    `${SQGG_PROFILE_ICON_BASE}${iconId}.png`,
    `${GTIMG_PROFILE_ICON_BASE}${iconId}.png`,
    `${CDRAGON_PROFILE_ICON_BASE}${iconId}.jpg`,
  ]);
}

function normalizeChampionAlias(alias: number | string | null | undefined): string {
  return String(alias ?? '').trim().replace(/[^A-Za-z0-9]/g, '');
}

function normalizeSkinNumber(
  championId: number | string | null | undefined,
  skinId?: number | string | null,
  fallbackSkinNumber = 0,
): number {
  const rawSkinId = String(skinId ?? '').trim();
  if (!rawSkinId || rawSkinId === 'NaN') return fallbackSkinNumber;

  const numericSkinId = Number(rawSkinId);
  if (!Number.isFinite(numericSkinId) || numericSkinId < 0) return fallbackSkinNumber;
  if (numericSkinId === 0) return 0;

  const numericChampionId = Number(championId ?? 0);
  const baseSkinId = numericChampionId > 0 ? numericChampionId * 1000 : 0;
  if (baseSkinId > 0 && numericSkinId >= baseSkinId) {
    return numericSkinId - baseSkinId;
  }
  return numericSkinId;
}

export function buildChampionSplashByAlias(
  alias: number | string | null | undefined,
  championId?: number | string | null,
  skinId?: number | string | null,
  fallbackSkinNumber = 0,
): string {
  const championAlias = normalizeChampionAlias(alias);
  if (!championAlias) return '';
  const skinNumber = normalizeSkinNumber(championId, skinId, fallbackSkinNumber);
  return `${DDRAGON_CHAMPION_SPLASH_BASE}${championAlias}_${skinNumber}.jpg`;
}

export function buildChampionSplashCandidatesByAlias(
  alias: number | string | null | undefined,
  championId?: number | string | null,
  skinId?: number | string | null,
): string[] {
  return uniqueUrls([
    buildChampionSplashByAlias(alias, championId, skinId),
    buildChampionSplashByAlias(alias, championId, 0),
  ]);
}

export function buildChampionSplashFromAvatar(
  avatarUrl: string | null | undefined,
  championId?: number | string | null,
  skinId?: number | string | null,
  fallbackSkinNumber = 0,
): string {
  const fileName = String(avatarUrl ?? '').split('/').pop() ?? '';
  const alias = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '');
  return buildChampionSplashByAlias(alias, championId, skinId, fallbackSkinNumber);
}
