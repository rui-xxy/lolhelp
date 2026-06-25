import type { AssistProfileIcon } from '../../shared/api';
import { LcuClient } from '../lcu/client';
import { getCachedCredentials } from '../lcu/lockfile';

interface LcuProfileIcon {
  id?: number;
  title?: string;
  name?: string;
  iconPath?: string;
}

let cached: AssistProfileIcon[] | null = null;

function iconUrl(path?: string, id?: number): string {
  if (path) {
    const normalized = path
      .replace(/^\/lol-game-data\/assets\//i, '')
      .toLowerCase();
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${normalized}`;
  }
  return id
    ? `https://game.gtimg.cn/images/lol/act/img/profileicon/${id}.png`
    : '';
}

export async function getAssistProfileIcons(): Promise<AssistProfileIcon[]> {
  if (cached) return structuredClone(cached);
  const creds = getCachedCredentials();
  if (!creds) throw new Error('未连接英雄联盟客户端');
  const response = await new LcuClient(creds).get<
    LcuProfileIcon[] | Record<string, LcuProfileIcon>
  >('/lol-game-data/assets/v1/profile-icons.json');
  const values = Array.isArray(response) ? response : Object.values(response ?? {});
  cached = values
    .map((icon) => {
      const id = Number(icon.id ?? 0);
      return {
        id,
        title: icon.title || icon.name || `头像 ${id}`,
        icon: iconUrl(icon.iconPath, id),
      };
    })
    .filter((icon) => icon.id > 0)
    .sort((a, b) => b.id - a.id);
  return structuredClone(cached);
}
