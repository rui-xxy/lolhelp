import type {
  MatchTimeline,
  MatchTimelineEvent,
  MatchTimelineFrame,
  MatchTimelineParticipantFrame,
  MatchTimelineResult,
} from '../../shared/api';
import { getItemById } from '../lcu/heroData';
import { createLcuClient } from '../live/liveRoster';
import { getSgpAuth } from '../sgp/auth';
import { SgpClient } from '../sgp/client';
import { getRegionConfig } from '../sgp/region';
import { shouldForceRefreshSgpAuth } from '../sgp/sessionPolicy';

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEvent(raw: Record<string, unknown>): MatchTimelineEvent {
  const itemId = number(raw.itemId);
  const item = itemId > 0 ? getItemById(itemId) : null;
  return {
    ...(raw as unknown as MatchTimelineEvent),
    type: String(raw.type ?? ''),
    timestamp: number(raw.timestamp),
    itemId: itemId || undefined,
    itemName: item?.name,
    itemIcon: item?.icon,
  };
}

function normalizeFrame(raw: Record<string, unknown>): MatchTimelineFrame {
  const participantFramesRaw = (raw.participantFrames ?? {}) as Record<string, Record<string, unknown>>;
  const participantFrames = Object.fromEntries(
    Object.entries(participantFramesRaw).map(([key, frame]) => [key, {
      ...(frame as unknown as MatchTimelineParticipantFrame),
      participantId: number(frame.participantId) || number(key),
      totalGold: number(frame.totalGold),
      currentGold: number(frame.currentGold),
      level: number(frame.level),
      xp: number(frame.xp),
      minionsKilled: number(frame.minionsKilled),
      jungleMinionsKilled: number(frame.jungleMinionsKilled),
    }]),
  );
  return {
    timestamp: number(raw.timestamp),
    participantFrames,
    events: Array.isArray(raw.events)
      ? raw.events.map((event) => normalizeEvent(event as Record<string, unknown>))
      : [],
  };
}

function normalizeTimelinePayload(raw: Record<string, unknown>): MatchTimeline | null {
  const nestedJson = raw.json && typeof raw.json === 'object'
    ? raw.json as Record<string, unknown>
    : null;
  const nestedInfo = raw.info && typeof raw.info === 'object'
    ? raw.info as Record<string, unknown>
    : null;
  const root = nestedJson ?? nestedInfo ?? raw;
  const framesRaw = Array.isArray(root.frames) ? root.frames : [];
  if (framesRaw.length === 0) return null;
  return {
    frameInterval: number(root.frameInterval),
    frames: framesRaw.map((frame) => normalizeFrame(frame as Record<string, unknown>)),
  };
}

async function fetchSgpTimeline(gameId: number, region?: string): Promise<MatchTimeline | null> {
  const request = async (forceRefresh: boolean) => {
    const auth = await getSgpAuth({ validateSession: true, forceRefresh });
    const targetRegion = getRegionConfig(region ?? '') ?? auth.region;
    const client = new SgpClient({ ...auth, region: targetRegion });
    const raw = await client.get<Record<string, unknown>>(
      `/match-history-query/v1/products/lol/${targetRegion.key}_${Math.floor(gameId)}/DETAILS`,
    );
    return normalizeTimelinePayload(raw);
  };

  try {
    return await request(false);
  } catch (error) {
    if (!shouldForceRefreshSgpAuth(error)) throw error;
    return request(true);
  }
}

async function fetchLcuTimeline(gameId: number): Promise<MatchTimeline | null> {
  const raw = await createLcuClient().get<Record<string, unknown>>(
    `/lol-match-history/v1/game-timelines/${Math.floor(gameId)}`,
  );
  return normalizeTimelinePayload(raw);
}

export async function getMatchTimeline(gameId: number, region?: string): Promise<MatchTimelineResult> {
  if (!Number.isFinite(gameId) || gameId <= 0) {
    return { available: false, timeline: null, error: '无效的对局 ID' };
  }
  let sgpError: unknown;
  try {
    const timeline = await fetchSgpTimeline(gameId, region);
    if (timeline) return { available: true, timeline };
  } catch (error) {
    sgpError = error;
  }

  try {
    const timeline = await fetchLcuTimeline(gameId);
    if (timeline) return { available: true, timeline };
    return { available: false, timeline: null, error: '服务器和客户端都没有这场对局的时间线' };
  } catch (lcuError) {
    return {
      available: false,
      timeline: null,
      error: sgpError instanceof Error
        ? sgpError.message
        : lcuError instanceof Error
          ? lcuError.message
          : '时间线读取失败',
    };
  }
}
