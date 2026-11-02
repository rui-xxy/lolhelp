import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCheck, Heart, RefreshCw, RotateCcw, X } from 'lucide-react';
import type { AssistSettings, LiveBattlePlayer } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import {
  Btn,
  ChipChoices,
  Choices,
  Feature,
  Field,
  Panel,
  TextInput,
} from './AssistControls';

type UpdateAssist = (updater: (assist: AssistSettings) => AssistSettings) => void;
type UpdateBoolean = (key: keyof AssistSettings, value: boolean) => void;

type AfterGame = 'none' | 'lobby' | 'again';

const DELAY_PRESETS = ['0', '1000', '2000', '3000', '5000'] as const;

function afterGameValue(assist: AssistSettings): AfterGame {
  if (assist.autoPlayAgain) return 'again';
  if (assist.autoReturnLobby) return 'lobby';
  return 'none';
}

function delayLabel(ms: number): string {
  if (ms <= 0) return '立即';
  return `${Number((ms / 1000).toFixed(1))} 秒`;
}

function playerRiotId(player: LiveBattlePlayer): string {
  return (player.riotId || player.gameName || '').trim();
}

function sameRiotId(a: string, b: string): boolean {
  const clean = (text: string) => text.trim().toLowerCase().replace(/\s+/g, '');
  return Boolean(a) && clean(a) === clean(b);
}

// 点赞对象：一个「游戏名#编号」输入框，下面列出房间 / 这局里的队友，点一下就填好。
function HonorTarget({ assist, updateAssist }: { assist: AssistSettings; updateAssist: UpdateAssist }) {
  const [players, setPlayers] = useState<LiveBattlePlayer[]>([]);
  const [where, setWhere] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const battle = await window.lolHelper.live.getBattle();
      const seen = new Set<string>();
      const mates = battle.myTeam.filter((player) => {
        const riotId = playerRiotId(player);
        if (!riotId || player.puuid === battle.myPuuid || seen.has(riotId)) return false;
        seen.add(riotId);
        return true;
      });
      setPlayers(mates);
      setWhere(battle.phase === 'ChampSelect' ? '选人中' : battle.inGame ? '这局' : mates.length > 0 ? '房间里' : '');
    } catch {
      setPlayers([]);
      setWhere('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const target = assist.autoHonorSummonerName.trim();
  const legacyId = !target && assist.autoHonorSummonerId > 0 ? assist.autoHonorSummonerId : 0;

  return (
    <div className="as-honor">
      <Field label="只给这位玩家点赞" optional hint="不填就给所有能点的队友点赞。编号可以不写，写上更准。" wide>
        <div className="as-honor__input">
          <TextInput
            value={assist.autoHonorSummonerName}
            placeholder="游戏名#编号"
            onChange={(value) => updateAssist((next) => ({
              ...next,
              autoHonorSummonerName: value,
              autoHonorSummonerId: 0,
            }))}
          />
          {target && (
            <Btn
              size="sm"
              tone="ghost"
              title="清除，改回给所有队友点赞"
              onClick={() => updateAssist((next) => ({ ...next, autoHonorSummonerName: '', autoHonorSummonerId: 0 }))}
            >
              <X />
            </Btn>
          )}
        </div>
      </Field>

      {legacyId > 0 && (
        <div className="as-honor__legacy">
          <span>之前按召唤师编号 {legacyId} 指定过一位玩家。</span>
          <Btn size="sm" tone="ghost" onClick={() => updateAssist((next) => ({ ...next, autoHonorSummonerId: 0 }))}>
            改回给所有人点
          </Btn>
        </div>
      )}

      <div className="as-honor__room">
        <div className="as-honor__room-head">
          <b>{where ? `${where}的队友` : '房间里的队友'}</b>
          <span />
          <Btn size="sm" tone="ghost" busy={loading} onClick={() => void load()} title="重新读取房间里的玩家">
            {!loading && <RefreshCw />}
            刷新
          </Btn>
        </div>
        {players.length === 0 ? (
          <p className="as-honor__none">
            {loading ? '正在读取…' : '不在房间中'}
          </p>
        ) : (
          <div className="as-mates">
            {players.map((player) => {
              const riotId = playerRiotId(player);
              const chosen = sameRiotId(riotId, target);
              const [name, tag] = riotId.split('#');
              return (
                <button
                  key={player.puuid || riotId}
                  type="button"
                  className="as-mate"
                  aria-pressed={chosen}
                  title={riotId}
                  onClick={() => updateAssist((next) => (chosen
                    ? { ...next, autoHonorSummonerName: '', autoHonorSummonerId: 0 }
                    : { ...next, autoHonorSummonerName: riotId, autoHonorSummonerId: player.summonerId > 0 ? player.summonerId : 0 }))}
                >
                  <ProfileIcon iconId={player.profileIconId} alt={name} size={30} />
                  <span className="as-mate__name">
                    <b>{name}</b>
                    {tag && <small>#{tag}</small>}
                  </span>
                  {chosen && <span className="as-mate__check"><Check /></span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function AutomationSection({
  assist,
  updateAssist,
  updateBoolean,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  updateBoolean: UpdateBoolean;
}) {
  const delayIsPreset = DELAY_PRESETS.includes(String(assist.autoAcceptDelayMs) as typeof DELAY_PRESETS[number]);
  return (
    <>
      <Panel title="排队的时候">
        <Feature
          icon={<CheckCheck />}
          title="自动接受对局"
          checked={assist.autoAccept}
          onChange={(value) => updateBoolean('autoAccept', value)}
        >
          <div className="as-fields">
            <Field label="等多久再接受" hint="留一两秒，来得及看一眼再决定要不要拒绝。" wide>
              <ChipChoices
                label="接受前等待"
                value={delayIsPreset ? String(assist.autoAcceptDelayMs) : 'custom'}
                options={[
                  ...DELAY_PRESETS.map((ms) => ({ value: ms, label: delayLabel(Number(ms)) })),
                  ...(delayIsPreset ? [] : [{ value: 'custom', label: delayLabel(assist.autoAcceptDelayMs) }]),
                ]}
                onChange={(value) => {
                  if (value === 'custom') return;
                  updateAssist((next) => ({ ...next, autoAcceptDelayMs: Number(value) }));
                }}
              />
            </Field>
          </div>
        </Feature>
      </Panel>

      <Panel title="一局打完以后">
        <div className="as-feature">
          <span className="as-feature__icon" aria-hidden="true"><RotateCcw /></span>
          <div>
            <div className="as-feature__title">结算后去哪</div>
          </div>
          <span />
          <div className="as-feature__options">
            <Choices<AfterGame>
              label="结算后去哪"
              value={afterGameValue(assist)}
              options={[
                { value: 'none', title: '停在结算页' },
                { value: 'lobby', title: '回到房间' },
                { value: 'again', title: '再来一局' },
              ]}
              onChange={(value) => updateAssist((next) => ({
                ...next,
                autoReturnLobby: value === 'lobby',
                autoPlayAgain: value === 'again',
              }))}
            />
          </div>
        </div>
        <Feature
          icon={<Heart />}
          title="自动点赞队友"
          checked={assist.autoHonorTeammates}
          onChange={(value) => updateBoolean('autoHonorTeammates', value)}
        >
          <HonorTarget assist={assist} updateAssist={updateAssist} />
        </Feature>
      </Panel>
    </>
  );
}
