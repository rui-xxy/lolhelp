import https from 'node:https';
import type { AssistLiveData, AssistLivePlayer } from '../../shared/api';

interface LiveAllGameData {
  activePlayer?: { riotId?: string; summonerName?: string };
  gameData?: { gameTime?: number; gameMode?: string };
  allPlayers?: Array<{
    riotId?: string;
    summonerName?: string;
    championName?: string;
    team?: string;
    level?: number;
    scores?: { kills?: number; deaths?: number; assists?: number };
    summonerSpells?: {
      summonerSpellOne?: { displayName?: string };
      summonerSpellTwo?: { displayName?: string };
    };
  }>;
}

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

export async function getAssistLiveData(): Promise<AssistLiveData> {
  try {
    const raw = await requestLiveData();
    const players: AssistLivePlayer[] = (raw.allPlayers ?? []).map((player) => ({
      riotId: player.riotId || player.summonerName || '未知玩家',
      championName: player.championName || '未知英雄',
      team: player.team || '',
      level: Number(player.level ?? 0),
      kills: Number(player.scores?.kills ?? 0),
      deaths: Number(player.scores?.deaths ?? 0),
      assists: Number(player.scores?.assists ?? 0),
      spellOne: player.summonerSpells?.summonerSpellOne?.displayName ?? '',
      spellTwo: player.summonerSpells?.summonerSpellTwo?.displayName ?? '',
    }));
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
