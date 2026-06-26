import https from 'node:https';
import type {
  AssistLiveData,
  AssistLivePlayer,
  AssistLiveSpell,
} from '../../shared/api';
import {
  getAllHeroes,
  getHeroByKey,
  getSummonerSpellById,
} from '../lcu/heroData';

interface LiveAllGameData {
  activePlayer?: {
    riotId?: string;
    summonerName?: string;
  };
  gameData?: {
    gameTime?: number;
    gameMode?: string;
  };
  allPlayers?: LiveAllPlayer[];
}

interface LiveAllPlayer {
  riotId?: string;
  summonerName?: string;
  championName?: string;
  rawChampionName?: string;
  team?: string;
  level?: number;
  scores?: {
    kills?: number;
    deaths?: number;
    assists?: number;
  };
  items?: Array<{
    itemID?: number;
    itemId?: number;
  }>;
  summonerSpells?: {
    summonerSpellOne?: LiveSummonerSpell;
    summonerSpellTwo?: LiveSummonerSpell;
  };
}

interface LiveSummonerSpell {
  displayName?: string;
  rawDisplayName?: string;
}

interface SpellDefinition {
  id: number;
  cooldown: number;
  file: string;
  patterns: RegExp[];
}

const SPELL_DEFINITIONS: SpellDefinition[] = [
  { id: 4, cooldown: 300, file: 'SummonerFlash.png', patterns: [/闪现|flash/i] },
  { id: 12, cooldown: 300, file: 'SummonerTeleport.png', patterns: [/传送|teleport/i] },
  { id: 14, cooldown: 180, file: 'SummonerDot.png', patterns: [/点燃|引燃|ignite|dot/i] },
  { id: 7, cooldown: 240, file: 'SummonerHeal.png', patterns: [/治疗|heal/i] },
  { id: 21, cooldown: 180, file: 'SummonerBarrier.png', patterns: [/屏障|barrier/i] },
  { id: 3, cooldown: 240, file: 'SummonerExhaust.png', patterns: [/虚弱|exhaust/i] },
  { id: 1, cooldown: 240, file: 'SummonerBoost.png', patterns: [/净化|cleanse|boost/i] },
  { id: 6, cooldown: 240, file: 'SummonerHaste.png', patterns: [/疾步|疾跑|幽灵|ghost|haste/i] },
  { id: 11, cooldown: 15, file: 'SummonerSmite.png', patterns: [/惩戒|smite/i] },
  { id: 13, cooldown: 240, file: 'SummonerMana.png', patterns: [/清晰|clarity|mana/i] },
  { id: 32, cooldown: 80, file: 'SummonerSnowball.png', patterns: [/标记|雪球|snowball|mark/i] },
  { id: 39, cooldown: 80, file: 'SummonerSnowURFSnowball_Mark.png', patterns: [/无限火力.*标记|snowurf/i] },
  { id: 2201, cooldown: 45, file: 'SummonerCherryHold.png', patterns: [/闪人|cherryhold/i] },
  { id: 2202, cooldown: 1, file: 'SummonerCherryFlash.png', patterns: [/斗魂.*闪现|cherryflash/i] },
];

function requestLiveData(): Promise<LiveAllGameData> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: '127.0.0.1',
        port: 2999,
        path: '/liveclientdata/allgamedata',
        rejectUnauthorized: false,
        timeout: 2500,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Live Client HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as LiveAllGameData);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Live Client 请求超时')));
    req.on('error', reject);
  });
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function championAliasFromRaw(value?: string): string {
  if (!value) return '';
  const match = value.match(/displayname_([^_]+)$/i);
  return match?.[1] ?? value;
}

function resolveChampion(player: LiveAllPlayer): {
  championId: number;
  championName: string;
  championIcon: string;
} {
  const candidates = [
    championAliasFromRaw(player.rawChampionName),
    player.championName ?? '',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const hero = getHeroByKey(candidate);
    if (hero) {
      return {
        championId: hero.id,
        championName: hero.title || hero.name || player.championName || candidate,
        championIcon: hero.avatar,
      };
    }
  }

  const normalizedCandidates = candidates.map(normalizeText);
  const hero = getAllHeroes().find((item) =>
    normalizedCandidates.includes(normalizeText(item.alias)) ||
    normalizedCandidates.includes(normalizeText(item.name)) ||
    normalizedCandidates.includes(normalizeText(item.title)));
  if (hero) {
    return {
      championId: hero.id,
      championName: hero.title || hero.name || player.championName || hero.alias,
      championIcon: hero.avatar,
    };
  }

  return {
    championId: 0,
    championName: player.championName || '未知英雄',
    championIcon: '',
  };
}

function spellIconFallback(file: string): string {
  return `https://game.gtimg.cn/images/lol/act/img/spell/${file}`;
}

function resolveSpell(spell?: LiveSummonerSpell): AssistLiveSpell | null {
  const name = spell?.displayName?.trim() || '';
  const rawName = spell?.rawDisplayName?.trim() || '';
  const source = `${name} ${rawName}`;
  if (!source.trim()) return null;

  const definition = SPELL_DEFINITIONS.find((item) =>
    item.patterns.some((pattern) => pattern.test(source)));
  if (!definition) {
    return {
      id: 0,
      name: name || rawName || '未知技能',
      icon: '',
      cooldown: 180,
    };
  }

  const cached = getSummonerSpellById(definition.id);
  return {
    id: definition.id,
    name: cached?.name || name || rawName,
    icon: cached?.icon || spellIconFallback(definition.file),
    cooldown: definition.cooldown,
  };
}

function riotIdOf(player: LiveAllPlayer): string {
  return player.riotId || player.summonerName || '未知玩家';
}

function itemIdsOf(player: LiveAllPlayer): number[] {
  return (player.items ?? [])
    .map((item) => Number(item.itemID ?? item.itemId ?? 0))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export async function getAssistLiveData(): Promise<AssistLiveData> {
  try {
    const raw = await requestLiveData();
    const activeRiotId = normalizeText(
      raw.activePlayer?.riotId || raw.activePlayer?.summonerName || '',
    );
    const rawPlayers = raw.allPlayers ?? [];
    const localRaw = rawPlayers.find((player) =>
      normalizeText(riotIdOf(player)) === activeRiotId);
    const localTeam = localRaw?.team ?? '';

    const players: AssistLivePlayer[] = rawPlayers.map((player) => {
      const riotId = riotIdOf(player);
      const champion = resolveChampion(player);
      const isLocalPlayer = activeRiotId
        ? normalizeText(riotId) === activeRiotId
        : false;
      return {
        riotId,
        championName: champion.championName,
        championId: champion.championId,
        championIcon: champion.championIcon,
        team: player.team || '',
        isLocalPlayer,
        isEnemy: Boolean(localTeam && player.team && player.team !== localTeam),
        level: Number(player.level ?? 0),
        kills: Number(player.scores?.kills ?? 0),
        deaths: Number(player.scores?.deaths ?? 0),
        assists: Number(player.scores?.assists ?? 0),
        items: itemIdsOf(player),
        spellOne: resolveSpell(player.summonerSpells?.summonerSpellOne),
        spellTwo: resolveSpell(player.summonerSpells?.summonerSpellTwo),
      };
    });

    return {
      active: true,
      gameTime: Number(raw.gameData?.gameTime ?? 0),
      gameMode: raw.gameData?.gameMode ?? '',
      players,
    };
  } catch (error) {
    return {
      active: false,
      gameTime: 0,
      gameMode: '',
      players: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
