import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Plus, SlidersHorizontal } from 'lucide-react';
import type { LolConfigProfileSummary } from '../../../shared/api';
import { CONFIG_BLOCKED_PHASES } from '../settings/configFields';
import { errorText, type ProfilesState } from './homeData';
import { formatAgo } from './HomeArt';

// 设置方案：换号以后一键用上自己的画面、操作、热键和客户端设置。
// 应用要点两下（第二下确认），选人和对局中不能写。

interface ProfilesCardProps {
  profiles: ProfilesState;
  connected: boolean;
  onManage: () => void;
  onNotice: (text: string, tone?: 'ok' | 'error') => void;
}

const MAX_SHOWN = 4;

export function ProfilesCard({ profiles, connected, onManage, onNotice }: ProfilesCardProps) {
  const { state, loading, error, refresh } = profiles;
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!armed) return undefined;
    const timer = window.setTimeout(() => setArmed(null), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const client = state?.client;
  const account = client?.summonerName?.split('#')[0] ?? '';
  const blocked = client?.connected ? CONFIG_BLOCKED_PHASES[client.phase] : undefined;
  const list: LolConfigProfileSummary[] = [...(state?.profiles ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);

  const apply = async (profile: LolConfigProfileSummary) => {
    if (armed !== profile.id) {
      setArmed(profile.id);
      return;
    }
    setArmed(null);
    setBusy(profile.id);
    try {
      const result = await window.lolHelper.config.applyProfile({ profileId: profile.id, rootPath: state?.rootPath });
      await refresh();
      onNotice(
        result.lcuSynced ? `「${profile.name}」已用到${account ? `「${account}」` : '当前账号'}` : `已写入游戏文件，没同步到账号${result.lcuError ? `：${result.lcuError}` : ''}`,
        result.lcuSynced ? 'ok' : 'error',
      );
    } catch (err) {
      onNotice(errorText(err, '应用方案失败'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || !state) return;
    setBusy('save');
    try {
      await window.lolHelper.config.saveProfile({ name: trimmed, rootPath: state.rootPath, values: state.values });
      await refresh();
      setNaming(false);
      setName('');
      onNotice(`已存为「${trimmed}」`, 'ok');
    } catch (err) {
      onNotice(errorText(err, '保存方案失败'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="hm-panel hm-profiles" aria-label="设置方案">
      <header className="hm-panel__head">
        <h3>设置方案</h3>
        {account && <span className="hm-profiles__to">应用到 <b>{account}</b></span>}
        <button type="button" className="hm-icon-btn" onClick={onManage} title="在设置里管理方案" aria-label="管理方案">
          <SlidersHorizontal className="size-3.5" />
        </button>
      </header>

      {list.length > 0 ? (
        <ul className="hm-profiles__list">
          {list.slice(0, MAX_SHOWN).map((profile) => {
            const source = profile.sourceAccount?.split('#')[0];
            const isArmed = armed === profile.id;
            const isBusy = busy === profile.id;
            return (
              <li key={profile.id} data-armed={isArmed ? 'true' : undefined}>
                <span className="hm-profiles__main">
                  <b>{profile.name}</b>
                  <small>
                    {source ? `存自 ${source}` : '方案'}
                    {profile.gameResolution && ` · ${profile.gameResolution}`}
                    {` · ${formatAgo(profile.updatedAt, Date.now())}`}
                  </small>
                </span>
                <button
                  type="button"
                  className="hm-apply"
                  disabled={!connected || Boolean(blocked) || Boolean(busy)}
                  title={blocked ? `${blocked}，结束后再应用` : undefined}
                  onClick={() => void apply(profile)}
                >
                  {isBusy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : isArmed ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  {isBusy ? '应用中' : isArmed ? '确认' : '应用'}
                </button>
              </li>
            );
          })}
          {list.length > MAX_SHOWN && (
            <li className="hm-profiles__more">
              <button type="button" onClick={onManage}>还有 {list.length - MAX_SHOWN} 个方案</button>
            </li>
          )}
        </ul>
      ) : loading || error ? (
        <p className="hm-panel__empty">{loading ? '读取中…' : error}</p>
      ) : null}

      {naming ? (
        <form
          className="hm-profiles__save"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={24}
            placeholder={account ? `${account} 的设置` : '方案名字'}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setNaming(false);
            }}
          />
          <button type="submit" className="hm-apply" disabled={!name.trim() || busy === 'save'}>保存</button>
        </form>
      ) : (
        <button
          type="button"
          className="hm-profiles__add"
          disabled={!state?.found}
          onClick={() => {
            setName(account ? `${account} 的设置` : '');
            setNaming(true);
          }}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          把现在的设置存成方案
        </button>
      )}
    </section>
  );
}
