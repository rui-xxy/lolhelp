import type { ReactNode } from 'react';
import { PlayerProfileView } from './PlayerProfileView';

// 玩家速览：好友申请、新朋友点开后看到的档案。先看清这个人是谁，再决定通过还是拒绝。

export function PlayerPeek({
  puuid,
  riotId,
  icon,
  iconUrl,
  iconUrls,
  tag,
  note,
  actions,
  onViewPlayer,
}: {
  puuid: string;
  riotId: string;
  icon?: number;
  iconUrl?: string;
  iconUrls?: string[];
  tag?: ReactNode;
  note?: string;
  actions: ReactNode;
  onViewPlayer?: (riotId: string) => void;
}) {
  return (
    <PlayerProfileView
      puuid={puuid}
      riotId={riotId}
      iconId={icon}
      iconUrl={iconUrl}
      iconUrls={iconUrls}
      tags={tag}
      note={note}
      actions={actions}
      onViewPlayer={onViewPlayer ? (id) => onViewPlayer(id) : undefined}
    />
  );
}
