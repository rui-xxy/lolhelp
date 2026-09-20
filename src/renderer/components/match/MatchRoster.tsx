import { Check } from 'lucide-react';
import type { MatchParticipantSummary } from '../../../shared/api';
import { GameIcon } from './GameIcon';
import { participantLabel, shortParticipantLabel } from './matchStatsModel';

interface MatchRosterProps {
  participants: MatchParticipantSummary[];
  selectedPuuids: string[];
  comparePuuid?: string;
  onPick: (player: MatchParticipantSummary) => void;
  compact?: boolean;
  label: string;
}

export function MatchRoster({ participants, selectedPuuids, comparePuuid, onPick, compact = false, label }: MatchRosterProps) {
  const teamIds = Array.from(new Set(participants.map((player) => player.teamId)));
  return (
    <div className={`match-roster${compact ? ' match-roster--compact' : ''}`} role="group" aria-label={label}>
      {teamIds.map((teamId) => (
        <div key={teamId} className={`match-roster__team ${teamId === 100 ? 'is-blue' : 'is-red'}`}>
          <span className="match-roster__team-name">{teamId === 100 ? '蓝方' : teamId === 200 ? '红方' : `队伍 ${teamId}`}</span>
          <div className="match-roster__players">
            {participants.filter((player) => player.teamId === teamId).map((player) => {
              const selected = selectedPuuids.includes(player.puuid);
              const comparing = comparePuuid === player.puuid;
              const name = participantLabel(player);
              return (
                <button
                  key={player.puuid}
                  type="button"
                  className={`match-roster__player${selected ? ' is-selected' : ''}${comparing ? ' is-comparing' : ''}`}
                  aria-label={`${name} · ${player.championName}${comparing ? ' · 对比玩家' : ''}`}
                  aria-pressed={selected || comparing}
                  title={`${name} · ${player.championName}${comparing ? ' · 对比玩家' : ''}`}
                  onClick={() => onPick(player)}
                >
                  <span className="match-roster__portrait">
                    <GameIcon src={player.championAvatar} alt="" size={compact ? 30 : 34} rounded />
                    {(selected || comparing) && <span className="match-roster__check" aria-hidden="true"><Check /></span>}
                  </span>
                  <span className="match-roster__name">{compact ? player.championName : shortParticipantLabel(player)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
