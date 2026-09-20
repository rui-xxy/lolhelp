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
  showcase?: boolean;
  label: string;
}

export function MatchRoster({ participants, selectedPuuids, comparePuuid, onPick, compact = false, showcase = false, label }: MatchRosterProps) {
  const teamIds = Array.from(new Set(participants.map((player) => player.teamId)));
  return (
    <div className={`match-roster${compact ? ' match-roster--compact' : ''}${showcase ? ' match-roster--showcase' : ''}`} role="group" aria-label={label}>
      {teamIds.map((teamId) => (
        <div key={teamId} className={`match-roster__team ${teamId === 100 ? 'is-blue' : 'is-red'}`}>
          <span className="match-roster__team-name">{teamId === 100 ? '蓝方' : teamId === 200 ? '红方' : `队伍 ${teamId}`}{showcase && <small>{participants.find((player) => player.teamId === teamId)?.win ? '胜利' : '落败'}</small>}</span>
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
                  aria-label={`${name}${comparing ? ' · 对比玩家' : ''}`}
                  aria-pressed={selected || comparing}
                  title={`${name}${comparing ? ' · 对比玩家' : ''}`}
                  onClick={() => onPick(player)}
                >
                  <span className="match-roster__portrait">
                    <GameIcon src={player.championAvatar} alt="" size={compact ? 30 : showcase ? 44 : 34} rounded />
                    {showcase && player.champLevel > 0 && <small className="match-roster__level">{player.champLevel}</small>}
                    {(selected || comparing) && <span className="match-roster__check" aria-hidden="true"><Check /></span>}
                  </span>
                  <span className="match-roster__name">{shortParticipantLabel(player)}</span>
                  {showcase && <small className="match-roster__status">{comparing ? '对比玩家' : selected ? '当前玩家' : `等级 ${player.champLevel || '—'}`}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {showcase && teamIds.length === 2 && <span className="match-roster__versus" aria-hidden="true">VS</span>}
    </div>
  );
}
