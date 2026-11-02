import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  CircleAlert,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  LolClientConfigValues,
  LolConfigPart,
  LolConfigProfileDetail,
  LolConfigState,
  LolConfigValues,
  LolGameConfigValues,
} from '../../../shared/api';
import { ALL_CONFIG_PARTS, CONFIG_PARTS } from '../../../shared/configParts';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { ClientSettings } from './ClientSettings';
import {
  CLIENT_PHASE_LABELS,
  CONFIG_BLOCKED_PHASES,
  buildFieldBaseline,
  buildHotkeyBaseline,
  countConfigChanges,
  countPartDiffs,
  withClientValue,
  withGameValue,
  withHotkeyValue,
} from './configFields';
import { GameSettings } from './GameSettings';
import { HotkeySettings } from './HotkeySettings';
import {
  SettingsCompareContext,
  scrollToSettingsSection,
  useSettingsScrollSpy,
  type SettingsCompare,
} from './SettingsControls';

// 「游戏设置」：一个页面看完、改完、存成方案、换号一键用上。
//
// 上面一排卡片：第一张是「这个号现在」（游戏里正在用的设置，可以直接改），
// 后面每张是一个方案，卡上直接写着它和这个号差几处，一样的标「正在用」。
// 点哪张，下面就展开哪一套，能直接改；和这个号不一样的行会写出「这个号现在是什么」。
// 左边目录同时是「应用时带哪几块」的勾选，每块标着差几处。
// 切换卡片时停在同一个位置，方便来回对比同一块设置。

type Selection = 'live' | string;
type Confirm = 'overwrite' | 'delete' | 'offline' | null;

const PART_LABEL = Object.fromEntries(CONFIG_PARTS.map((part) => [part.key, part.label])) as Record<LolConfigPart, string>;

// 目录顺序和下面内容的排列一致。
const TOC_GROUPS: Array<{ label: string; parts: LolConfigPart[] }> = [
  { label: '游戏内', parts: ['video', 'controls', 'interface', 'combat', 'audio'] },
  { label: '按键', parts: ['hotkeys'] },
  { label: '客户端', parts: ['client'] },
];
const TOC_SECTIONS = TOC_GROUPS.flatMap((group) => group.parts).map((part) => ({ key: part, label: PART_LABEL[part] }));

function formatDate(time: number): string {
  if (!time) return '';
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日`;
}

const sum = (stats: Record<LolConfigPart, number>, parts: LolConfigPart[] = ALL_CONFIG_PARTS) =>
  parts.reduce((total, part) => total + stats[part], 0);

const shortName = (riotId: string) => riotId.split('#')[0];

export interface ConfigWorkspaceProps {
  state: LolConfigState;
  draft: LolConfigValues;
  busy: string | null;
  /** 目录选择器（游戏目录在哪），放在卡片那一排的右边。 */
  dirControl: ReactNode;
  onDraftChange: (update: (values: LolConfigValues) => LolConfigValues) => void;
  onUndo: () => void;
  onApplyDraft: () => void;
  onRefreshClient: () => void;
  onSaveProfile: (name: string, values: LolConfigValues) => Promise<string | null>;
  onApplyProfile: (profileId: string, parts: LolConfigPart[]) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
}

export function ConfigWorkspace({
  state,
  draft,
  busy,
  dirControl,
  onDraftChange,
  onUndo,
  onApplyDraft,
  onRefreshClient,
  onSaveProfile,
  onApplyProfile,
  onDeleteProfile,
}: ConfigWorkspaceProps) {
  const { profiles, client } = state;
  const accountValues = state.values;
  const [selection, setSelection] = useState<Selection>('live');
  const touchedRef = useRef(false);
  const [details, setDetails] = useState<Map<string, LolConfigProfileDetail>>(new Map());
  const [detailErrors, setDetailErrors] = useState<Map<string, string>>(new Map());
  // 方案里改了但还没保存的，按「id:保存时间」记，保存后自然作废。
  const [profileDrafts, setProfileDrafts] = useState<Map<string, LolConfigValues>>(new Map());
  const [parts, setParts] = useState<Set<LolConfigPart>>(new Set(ALL_CONFIG_PARTS));
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [activePart, setActivePart] = useState<LolConfigPart>('video');
  useSettingsScrollSpy<LolConfigPart>('cw', TOC_SECTIONS, setActivePart);

  const keyOf = (profile: { id: string; updatedAt: number }) => `${profile.id}:${profile.updatedAt}`;

  // 把每个方案的内容都读出来：卡片上要写它和这个号差几处。
  useEffect(() => {
    let cancelled = false;
    for (const profile of profiles) {
      const key = keyOf(profile);
      if (details.has(key) || detailErrors.has(profile.id)) continue;
      const load = typeof window.lolHelper.config.getProfile === 'function'
        ? window.lolHelper.config.getProfile(profile.id)
        : Promise.reject(new Error('No handler registered'));
      load
        .then((loaded) => {
          if (cancelled) return;
          if (loaded) setDetails((map) => new Map(map).set(key, loaded));
          else setDetailErrors((map) => new Map(map).set(profile.id, '这个方案读不出来了，可能已经被删掉'));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const text = error instanceof Error ? error.message : String(error);
          setDetailErrors((map) => new Map(map).set(
            profile.id,
            /No handler registered/i.test(text)
              ? '助手刚更新过，后台还是旧的。完全关掉助手再打开一次就好。'
              : text,
          ));
        });
    }
    return () => {
      cancelled = true;
    };
    // details / detailErrors 只用来跳过已读的，不需要因为它们重跑。
  }, [profiles]);

  // 选中的方案被删了，就回到「这个号现在」。
  useEffect(() => {
    if (selection !== 'live' && !profiles.some((profile) => profile.id === selection)) setSelection('live');
  }, [profiles, selection]);

  // 每个方案：现在看到的值（含没保存的修改）、和这个号差几处。
  const cards = useMemo(() => profiles.map((profile) => {
    const key = keyOf(profile);
    const detail = details.get(key) ?? null;
    const values = profileDrafts.get(key) ?? detail?.values ?? null;
    const stats = values ? countPartDiffs(values, accountValues) : null;
    const dirty = detail && values ? countConfigChanges(values, detail.values) : 0;
    return { profile, key, detail, values, stats, dirty, error: detailErrors.get(profile.id) ?? '' };
  }), [detailErrors, details, accountValues, profileDrafts, profiles]);

  // 一打开：如果有方案而这个号一个都没用上，直接停在最近存的那个方案上，下面就是「应用」。
  useEffect(() => {
    if (touchedRef.current || cards.length === 0) return;
    if (cards.some((card) => !card.stats && !card.error)) return;
    touchedRef.current = true;
    const matched = cards.some((card) => card.stats && sum(card.stats) === 0);
    if (matched) return;
    const newest = [...cards].filter((card) => card.stats).sort((a, b) => b.profile.updatedAt - a.profile.updatedAt)[0];
    if (newest) setSelection(newest.profile.id);
  }, [cards]);

  const select = (next: Selection) => {
    touchedRef.current = true;
    setSelection(next);
  };

  const card = selection === 'live' ? null : cards.find((item) => item.profile.id === selection) ?? null;
  const isLive = !card;
  const values = isLive ? draft : card.values;
  const connected = Boolean(client?.connected);
  const account = connected ? client?.summonerName || '当前登录的号' : '';
  const accountShort = account ? shortName(account) : '';
  const blockedReason = connected && client ? CONFIG_BLOCKED_PHASES[client.phase] : undefined;
  const pending = countConfigChanges(draft, accountValues);

  const stats = useMemo(() => (values ? countPartDiffs(values, accountValues) : null), [accountValues, values]);
  const chosenParts = ALL_CONFIG_PARTS.filter((part) => parts.has(part));
  const skippedParts = ALL_CONFIG_PARTS.filter((part) => !parts.has(part));
  const resolutionDiffers = Boolean(values && (values.game.width !== accountValues.game.width || values.game.height !== accountValues.game.height));

  const compare = useMemo<SettingsCompare | null>(() => {
    if (!values) return null;
    return {
      label: isLive ? '改之前' : connected ? `${accountShort} 现在` : '游戏里现在',
      fields: buildFieldBaseline(values, accountValues),
      hotkeys: buildHotkeyBaseline(values.hotkeys, accountValues.hotkeys),
    };
  }, [accountShort, connected, accountValues, isLive, values]);

  // ---------- 改值：这个号现在 → 改面板草稿；方案 → 改方案草稿 ----------
  const edit = useCallback((update: (current: LolConfigValues) => LolConfigValues) => {
    if (!card) {
      onDraftChange(update);
      return;
    }
    if (!card.values) return;
    const base = card.values;
    setProfileDrafts((map) => new Map(map).set(card.key, update(base)));
  }, [card, onDraftChange]);

  const updateClient = useCallback(<K extends keyof LolClientConfigValues>(key: K, value: LolClientConfigValues[K]) => {
    edit((current) => withClientValue(current, key, value));
  }, [edit]);
  const updateGame = useCallback(<K extends keyof LolGameConfigValues>(key: K, value: LolGameConfigValues[K]) => {
    edit((current) => withGameValue(current, key, value));
  }, [edit]);
  const updateHotkey = useCallback((section: string, key: string, value: string) => {
    edit((current) => withHotkeyValue(current, section, key, value));
  }, [edit]);

  const togglePart = (part: LolConfigPart) => setParts((set) => {
    const next = new Set(set);
    if (next.has(part)) next.delete(part);
    else next.add(part);
    return next;
  });

  const discardProfileEdits = () => {
    if (!card) return;
    setProfileDrafts((map) => {
      const next = new Map(map);
      next.delete(card.key);
      return next;
    });
  };

  // ---------- 存、应用、删 ----------
  const createProfile = async () => {
    if (!values) return;
    const name = newName.trim() || `方案 ${profiles.length + 1}`;
    const id = await onSaveProfile(name, values);
    if (id) {
      setNaming(false);
      setNewName('');
      select(id);
    }
  };

  const saveProfileEdits = async (): Promise<string | null> => {
    if (!card?.values) return null;
    return onSaveProfile(card.profile.name, card.values);
  };

  const applyProfile = async () => {
    if (!card) return;
    let id: string | null = card.profile.id;
    if (card.dirty > 0) id = await saveProfileEdits();
    if (id) await onApplyProfile(id, chosenParts);
  };

  const startNaming = () => {
    setNaming(true);
    setNewName('');
  };

  // ---------- 底部一句话 ----------
  const willChange = stats ? sum(stats, chosenParts) : 0;
  let footSentence: ReactNode = null;
  let footDetail = '';
  if (card) {
    if (card.error) footSentence = '这个方案读不出来';
    else if (!stats) footSentence = '正在读取方案…';
    else if (chosenParts.length === 0) footSentence = '左边至少勾一块';
    else if (willChange === 0) {
      footSentence = (
        <>
          <Check className="cw-foot__ok" />
          {connected ? <><b>{accountShort}</b> 已经在用这套设置</> : '和游戏里现在的设置一样'}
        </>
      );
    } else {
      footSentence = connected
        ? <>应用后 <b>{accountShort}</b> 会有 <b className="num">{willChange}</b> 项变化</>
        : <>会改动这台电脑上的 <b className="num">{willChange}</b> 项设置</>;
    }
    footDetail = blockedReason
      ? `${blockedReason}，打完这局再应用`
      : skippedParts.length > 0 && chosenParts.length > 0
        ? `这次不带：${skippedParts.map((part) => PART_LABEL[part]).join('、')}`
        : connected ? '设置会跟着这个号走，换电脑登录也还在' : '客户端没登录：只写进这台电脑的游戏文件';
  }

  const applyLabel = connected ? `应用到 ${accountShort}` : '写进这台电脑';
  const applyDisabled = Boolean(busy) || !card || !stats || chosenParts.length === 0 || Boolean(blockedReason)
    || (willChange === 0 && card.dirty === 0);

  return (
    <div className="cw">
      {/* ---------- 卡片：这个号现在 + 我的方案 ---------- */}
      <header className="cw-deck-bar">
        <div className="cw-deck" role="tablist" aria-label="要看哪一套设置">
          <button
            type="button"
            role="tab"
            aria-selected={isLive}
            className="cw-card cw-card--live"
            data-state={!connected ? 'off' : blockedReason ? 'busy' : 'ok'}
            onClick={() => select('live')}
            onDoubleClick={onRefreshClient}
            title="游戏里正在用的设置，可以直接改。双击重新看一下登录的号"
          >
            <span className="cw-card__eyebrow"><i />{connected ? '这个号现在' : '客户端没登录'}</span>
            <b>{connected ? account : '这台电脑上的设置'}</b>
            <span className="cw-card__meta">
              {connected ? (blockedReason ?? CLIENT_PHASE_LABELS[client?.phase ?? ''] ?? '在线') : '登录后能直接同步给号'}
              <span className="num"> · {accountValues.game.width}×{accountValues.game.height}</span>
            </span>
            {pending > 0 && <em className="cw-badge" data-tone="gold">改了 {pending} 项</em>}
          </button>

          {profiles.length > 0 && <span className="cw-deck__rule" aria-hidden="true" />}

          {cards.map((item) => {
            const total = item.stats ? sum(item.stats) : null;
            return (
              <button
                key={item.profile.id}
                type="button"
                role="tab"
                aria-selected={selection === item.profile.id}
                className="cw-card"
                onClick={() => select(item.profile.id)}
                title={item.profile.sourceAccount ? `从 ${item.profile.sourceAccount} 存的` : undefined}
              >
                <span className="cw-card__eyebrow">方案{item.dirty > 0 && <span className="cw-card__dirty">· 没保存</span>}</span>
                <b>{item.profile.name}</b>
                <span className="cw-card__meta">
                  <span className="num">{item.profile.gameResolution}</span> · {formatDate(item.profile.updatedAt)}
                </span>
                {item.error ? (
                  <em className="cw-badge" data-tone="bad">读不了</em>
                ) : total === null ? (
                  <em className="cw-badge"><LoaderCircle className="as-spin" /></em>
                ) : total === 0 ? (
                  <em key="same" className="cw-badge" data-tone="ok"><Check />{connected ? '正在用' : '一样'}</em>
                ) : (
                  <em key="diff" className="cw-badge">差 <span className="num">{total}</span> 处</em>
                )}
              </button>
            );
          })}

          {naming ? (
            <form
              className="cw-card cw-card--naming"
              onSubmit={(event) => {
                event.preventDefault();
                void createProfile();
              }}
            >
              <span className="cw-card__eyebrow">存成新方案</span>
              <input
                autoFocus
                id="cw-new-profile-name"
                className="cw-card__input"
                value={newName}
                placeholder={`方案 ${profiles.length + 1}`}
                maxLength={40}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setNaming(false);
                }}
                onBlur={() => {
                  if (!newName.trim() && busy !== 'save-profile') setNaming(false);
                }}
              />
              <span className="cw-card__meta">
                {busy === 'save-profile' ? '正在保存…' : `回车保存 · 存下${isLive ? '这个号现在' : '这个方案'}的设置`}
              </span>
            </form>
          ) : (
            <button type="button" className="cw-card cw-card--add" onClick={startNaming} disabled={Boolean(busy) || !values}>
              <Plus />
              <span>存成方案</span>
            </button>
          )}
        </div>
        <div className="cw-deck-bar__tools">{dirControl}</div>
      </header>

      {profiles.length === 0 && !naming && (
        <p className="cw-hello">
          玩好几个号？在常用的号上把设置调顺手，点<b>「存成方案」</b>。以后换了号，回到这里点一下方案，就能把整套设置用上。
        </p>
      )}

      {/* ---------- 正文：目录 + 设置 ---------- */}
      <main data-settings-scroll className="cw-scroll">
        <div className="cw-title">
          <div>
            <h2>{isLive ? (connected ? `${accountShort} 现在的设置` : '这台电脑上的设置') : card.profile.name}</h2>
            <p>
              {isLive
                ? blockedReason
                  ? `${blockedReason}：现在可以看、可以存方案，改的设置要等打完才能应用`
                  : '直接改，改完点下面的「应用到游戏」才会写进去'
                : (
                  <>
                    {formatDate(card.profile.updatedAt)}保存
                    {card.profile.sourceAccount ? ` · 从 ${card.profile.sourceAccount} 存的` : ''}
                    {' · 在这里改的是方案本身，不会动游戏'}
                  </>
                )}
            </p>
          </div>
          {card && (
            <div className="cw-title__actions">
              <button
                type="button"
                className="as-btn as-btn--sm as-btn--ghost"
                disabled={Boolean(busy)}
                onClick={() => setConfirm('overwrite')}
                title="把方案换成「这个号现在」的设置"
              >
                <RotateCcw />
                换成这个号现在的
              </button>
              <button
                type="button"
                className="as-btn as-btn--sm as-btn--ghost"
                disabled={Boolean(busy)}
                onClick={() => setConfirm('delete')}
                aria-label="删除方案"
                title="删除方案"
              >
                <Trash2 />
              </button>
            </div>
          )}
        </div>

        {card?.error ? (
          <div className="as-empty"><CircleAlert /><b>看不了这个方案</b><span>{card.error}</span></div>
        ) : !values || !stats ? (
          <div className="as-empty"><LoaderCircle className="as-spin" /><b>正在读取方案…</b></div>
        ) : (
          <div className="cw-editor" data-off={card ? skippedParts.join(' ') : undefined}>
            <nav className="cw-toc" aria-label="设置分块">
              {TOC_GROUPS.map((group) => (
                <div key={group.label} className="cw-toc__group">
                  {group.parts.length > 1 && <span className="cw-toc__title">{group.label}</span>}
                  {group.parts.map((part) => {
                    const on = parts.has(part);
                    const diff = stats[part];
                    return (
                      <div
                        key={part}
                        className="cw-toc__item"
                        aria-current={activePart === part ? 'true' : undefined}
                        data-off={card && !on ? 'true' : undefined}
                      >
                        {card && (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            className="cw-check"
                            aria-label={`应用时带上「${PART_LABEL[part]}」`}
                            title={on ? `应用时会带上「${PART_LABEL[part]}」，点一下这次不带` : `这次不带「${PART_LABEL[part]}」，点一下带上`}
                            onClick={() => togglePart(part)}
                          >
                            {on && <Check />}
                          </button>
                        )}
                        <button
                          type="button"
                          className="cw-toc__link"
                          onClick={() => {
                            setActivePart(part);
                            scrollToSettingsSection('cw', part);
                          }}
                        >
                          <span>{PART_LABEL[part]}</span>
                          {diff > 0 && <em className="num" title={isLive ? `改了 ${diff} 项` : `和这个号不一样的有 ${diff} 处`}>{diff}</em>}
                        </button>
                        {card && part === 'video' && resolutionDiffers && on && (
                          <small className="cw-toc__hint">分辨率不一样，换了显示器就别带</small>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className="cw-toc__legend">
                {card
                  ? <>数字是和{connected ? ` ${accountShort} ` : '游戏里'}现在不一样的项数。勾掉的这次不带。</>
                  : '数字是改了还没应用的项数。'}
              </p>
            </nav>

            <SettingsCompareContext.Provider value={compare}>
              <div className="cw-body">
                <div className="cw-chapter">
                  <h2 className="cw-chapter__title">游戏内</h2>
                  <GameSettings values={values.game} onChange={updateGame} showNav={false} idPrefix="cw" />
                </div>
                <section id="cw-section-hotkeys" className="cw-part">
                  <h2 className="cw-part__title">热键</h2>
                  <HotkeySettings values={values.hotkeys} onChange={updateHotkey} showNav={false} />
                </section>
                <section id="cw-section-client" className="cw-part">
                  <h2 className="cw-part__title">客户端</h2>
                  <ClientSettings values={values.client} onChange={updateClient} showNav={false} showBlocked={isLive} />
                </section>
              </div>
            </SettingsCompareContext.Provider>
          </div>
        )}
      </main>

      {/* ---------- 底部：点下去会发生什么 ---------- */}
      {isLive ? (
        pending > 0 && (
          <footer className="cw-foot">
            <div className="cw-foot__text">
              <span className="cw-foot__line"><i className="cw-foot__dot" />改了 <b className="num">{pending}</b> 项，还没写进游戏</span>
              <small>{blockedReason ? `${blockedReason}，打完再应用` : connected ? `应用后会同步给 ${accountShort}` : '客户端没登录：只写进这台电脑的游戏文件'}</small>
            </div>
            <button type="button" className="as-btn as-btn--ghost" disabled={Boolean(busy)} onClick={onUndo}>
              <RotateCcw />
              撤销
            </button>
            <button type="button" className="as-btn" disabled={Boolean(busy)} onClick={startNaming}>
              <Save />
              存成方案
            </button>
            <button
              type="button"
              className="as-btn as-btn--primary"
              disabled={Boolean(busy) || Boolean(blockedReason)}
              onClick={onApplyDraft}
            >
              {busy === 'apply' ? <LoaderCircle className="as-spin" /> : <Upload />}
              应用到游戏
            </button>
          </footer>
        )
      ) : (
        <footer className="cw-foot" data-tone={willChange === 0 && stats && chosenParts.length > 0 ? 'ok' : undefined}>
          <div className="cw-foot__text">
            <span className="cw-foot__line">{footSentence}</span>
            <small>{footDetail}</small>
          </div>
          {card.dirty > 0 && (
            <>
              <span className="cw-foot__edits">方案里改了 <b className="num">{card.dirty}</b> 项</span>
              <button type="button" className="as-btn as-btn--ghost" disabled={Boolean(busy)} onClick={discardProfileEdits}>
                <RotateCcw />
                还原
              </button>
              <button type="button" className="as-btn" disabled={Boolean(busy)} onClick={() => void saveProfileEdits()}>
                {busy === 'save-profile' ? <LoaderCircle className="as-spin" /> : <Save />}
                保存方案
              </button>
            </>
          )}
          <button
            type="button"
            className="as-btn as-btn--primary"
            disabled={applyDisabled}
            onClick={() => (connected ? void applyProfile() : setConfirm('offline'))}
            title={blockedReason ? `${blockedReason}，打完再应用` : undefined}
          >
            {busy === 'apply-profile' ? <LoaderCircle className="as-spin" /> : <Upload />}
            {card.dirty > 0 ? `保存并${applyLabel}` : applyLabel}
          </button>
        </footer>
      )}

      <ConfirmDialog
        open={confirm === 'overwrite'}
        title="把方案换成这个号现在的设置"
        description={`「${card?.profile.name ?? ''}」里原来存的内容会被${connected ? ` ${accountShort} ` : '游戏里'}现在的设置替换${pending > 0 ? `（包括还没应用的 ${pending} 项改动）` : ''}。`}
        confirmLabel="替换方案"
        busy={busy === 'save-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (card) void onSaveProfile(card.profile.name, draft).then(() => setConfirm(null));
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="删除这个方案"
        description={`会删掉「${card?.profile.name ?? ''}」。不影响游戏里现在的设置，但删了就找不回来了。`}
        confirmLabel="删除方案"
        destructive
        busy={busy === 'delete-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (card) void onDeleteProfile(card.profile.id).then(() => setConfirm(null));
        }}
      />
      <ConfirmDialog
        open={confirm === 'offline'}
        title="客户端没登录，确定现在写进去吗？"
        description="现在只能写进这台电脑的游戏文件。登录时客户端会下载那个号自己的设置，把这些改动盖掉。建议先登录要用的号，再回来点应用。"
        confirmLabel="仍然写入文件"
        busy={busy === 'apply-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          setConfirm(null);
          void applyProfile();
        }}
      />
    </div>
  );
}
