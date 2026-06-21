const SQGG_PROFILE_ICON_BASE =
  'https://wegame.gtimg.com/g.26-r.c2d3c/helper/lol/assis/images/resources/usericon/';
const GTIMG_PROFILE_ICON_BASE = 'https://game.gtimg.cn/images/lol/act/img/profileicon/';
const CDRAGON_PROFILE_ICON_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/';

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
