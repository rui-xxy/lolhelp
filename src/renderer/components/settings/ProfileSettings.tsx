import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  CircleAlert,
  Gamepad2,
  Keyboard,
  LoaderCircle,
  MonitorCog,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  LolClientConfigValues,
  LolConfigClientState,
  LolConfigPart,
  LolConfigProfileDetail,
  LolConfigProfileSummary,
  LolConfigValues,
  LolGameConfigValues,
} from '../../../shared/api';
import { ALL_CONFIG_PARTS, CONFIG_PARTS, type ConfigPage } from '../../../shared/configParts';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  CLIENT_FIELDS,
  CLIENT_LAYOUT,
  CLIENT_PHASE_LABELS,
  CONFIG_BLOCKED_PHASES,
  GAME_FIELDS,
  GAME_LAYOUT,
  hotkeyDiffCount,
} from './configFields';
import { HERO_ACTION_LABELS, KeyCap } from './HotkeySettings';
import {
  HERO_HOTKEY_GROUPS,
  buildHotkeyCategories,
  displayHotkeyValue,
  flattenHotkeys,
  hotkeyLabel,
  isSwitchHotkey,
  quickbindKeyFor,
} from './hotkeyModel';

// 「方案」：把一套设置存起来，换号以后一键用上。
// 方案内容按设置页的样子展示：上面是「客户端 / 游戏内 / 热键」三页，
// 每页里的分区、分组和每一行的名字都和设置页一模一样，并标出和现在的设置哪里不一样。

const PAGES: Array<{ key: ConfigPage; label: string; icon: typeof MonitorCog }> = [
  { key: 'client', label: '客户端', icon: MonitorCog },
  { key: 'game', label: '游戏内', icon: Gamepad2 },
  { key: 'hotkeys', label: '热键', icon: Keyboard },
];

const PART_LABELS = Object.fromEntries(CONFIG_PARTS.map((part) => [part.key, part.label])) as Record<LolConfigPart, string>;

interface FieldLine {
  key: string;
  label: string;
  saved: string;
  now: string;
}

function gameLine(key: keyof LolGameConfigValues, saved: LolConfigValues, now: LolConfigValues): FieldLine {
  const meta = GAME_FIELDS[key];
  return { key, label: meta.label, saved: meta.format(saved.game[key], saved.game), now: meta.format(now.game[key], now.game) };
}

function clientLine(key: keyof LolClientConfigValues, saved: LolConfigValues, now: LolConfigValues): FieldLine {
  const meta = CLIENT_FIELDS[key];
  return { key, label: meta.label, saved: meta.format(saved.client[key], saved.client), now: meta.format(now.client[key], now.client) };
}

function hotkeyText(section: string, value: string | undefined): string {
  if (value === undefined) return '没有';
  if (isSwitchHotkey(section, value)) return value === '1' ? '开' : '关';
  return displayHotkeyValue(value);
}

const changedCount = (lines: FieldLine[]) => lines.filter((line) => line.saved !== line.now).length;

function formatDate(time: number): string {
  if (!time) return '';
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日`;
}

export function ProfileSettings({
  profiles,
  client,
  current,
  pendingChanges,
  busy,
  onSave,
  onApply,
  onDelete,
}: {
  profiles: LolConfigProfileSummary[];
  client?: LolConfigClientState;
  current: LolConfigValues;
  pendingChanges: number;
  busy: string | null;
  onSave: (name: string) => Promise<string | null>;
  onApply: (profileId: string, parts: LolConfigPart[]) => Promise<void>;
  onDelete: (profileId: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? '');
  const [details, setDetails] = useState<Map<string, LolConfigProfileDetail>>(new Map());
  const [detailError, setDetailError] = useState('');
  const [parts, setParts] = useState<Set<LolConfigPart>>(new Set(ALL_CONFIG_PARTS));
  const [page, setPage] = useState<ConfigPage>('game');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<'overwrite' | 'delete' | 'offline' | null>(null);

  // 方案列表变了（新建、删除）时，保证选中的还在。
  useEffect(() => {
    if (!profiles.some((profile) => profile.id === selectedId)) setSelectedId(profiles[0]?.id ?? '');
  }, [profiles, selectedId]);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;
  const detailKey = selected ? `${selected.id}:${selected.updatedAt}` : '';
  const detail = details.get(detailKey) ?? null;

  useEffect(() => {
    if (!selected || details.has(detailKey)) return undefined;
    let cancelled = false;
    setDetailError('');
    const load = typeof window.lolHelper.config.getProfile === 'function'
      ? window.lolHelper.config.getProfile(selected.id)
      : Promise.reject(new Error('请重启助手'));
    load
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) setDetailError('方案不存在');
        else setDetails((map) => new Map(map).set(detailKey, loaded));
      })
      .catch((error) => {
        if (cancelled) return;
        const text = error instanceof Error ? error.message : String(error);
        // 助手更新后后台没重启时，新接口还不存在。
        setDetailError(/No handler registered/i.test(text)
          ? '请重启助手'
          : text);
      });
    return () => {
      cancelled = true;
    };
  }, [detailKey, details, selected]);

  const blockedReason = client?.connected ? CONFIG_BLOCKED_PHASES[client.phase] : undefined;
  const chosenParts = ALL_CONFIG_PARTS.filter((part) => parts.has(part));
  const applying = busy === 'apply-profile';

  // 每一块和现在相比有几处不一样。
  const partStats = useMemo(() => {
    if (!detail) return null;
    const saved = detail.values;
    const stats = {} as Record<LolConfigPart, number>;
    for (const section of GAME_LAYOUT) {
      stats[section.part] = changedCount(section.groups.flatMap((group) => group.keys.map((key) => gameLine(key, saved, current))));
    }
    stats.client = changedCount(CLIENT_LAYOUT.flatMap((section) => section.groups.flatMap((group) => group.keys.map((key) => clientLine(key, saved, current)))));
    stats.hotkeys = hotkeyDiffCount(saved.hotkeys, current.hotkeys);
    return stats;
  }, [current, detail]);

  const totalDiff = partStats ? chosenParts.reduce((sum, part) => sum + partStats[part], 0) : 0;
  const skippedParts = ALL_CONFIG_PARTS.filter((part) => !parts.has(part));

  const create = async () => {
    const name = newName.trim() || `方案 ${profiles.length + 1}`;
    const id = await onSave(name);
    if (id) {
      setSelectedId(id);
      setNewName('');
      setCreating(false);
    }
  };

  const apply = () => {
    if (!selected) return;
    void onApply(selected.id, chosenParts);
  };

  const togglePart = (part: LolConfigPart) => setParts((set) => {
    const next = new Set(set);
    if (next.has(part)) next.delete(part);
    else next.add(part);
    return next;
  });

  const target = client?.connected ? client.summonerName || '当前登录的号' : '';

  return (
    <div className="pf">
      <section className="pf-intro">
        <div className="pf-intro__text">
          {profiles.length > 0 && (
            <button type="button" className="as-btn as-btn--primary pf-intro__save" disabled={Boolean(busy)} onClick={() => setCreating(true)}>
              <Save />
              把现在的设置存成方案
            </button>
          )}
        </div>
        <div className="pf-target" data-state={!client?.connected ? 'off' : blockedReason ? 'busy' : 'ok'}>
          <span className="pf-target__label">应用到</span>
          {client?.connected ? (
            <>
              <b>{target}</b>
              <span>
                <i />
                {blockedReason || (CLIENT_PHASE_LABELS[client.phase] ?? '在线')}
              </span>
            </>
          ) : (
            <>
              <b>客户端未登录</b>
            </>
          )}
        </div>
      </section>

      {profiles.length === 0 ? (
        <section className="pf-empty">
          <Save />
          <b>暂无方案</b>
          <div className="pf-new pf-new--inline">
            <input
              className="as-input"
              value={newName}
              placeholder="例如：主号习惯"
              maxLength={40}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void create(); }}
            />
            <button type="button" className="as-btn as-btn--primary" disabled={Boolean(busy)} onClick={() => void create()}>
              {busy === 'save-profile' ? <LoaderCircle className="as-spin" /> : <Save />}
              存成方案
            </button>
          </div>
        </section>
      ) : (
        <div className="pf-body">
          <aside className="pf-list">
            <div className="pf-list__head">
              <b>我的方案</b>
              <span>{profiles.length}</span>
            </div>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="pf-card"
                aria-pressed={profile.id === selectedId}
                onClick={() => setSelectedId(profile.id)}
              >
                <b>{profile.name}</b>
                <span>{profile.gameResolution}{profile.sourceAccount ? ` · 来自 ${profile.sourceAccount.split('#')[0]}` : ''}</span>
                <small>{formatDate(profile.updatedAt)}保存</small>
              </button>
            ))}
            {creating ? (
              <div className="pf-new">
                <input
                  autoFocus
                  className="as-input"
                  value={newName}
                  placeholder="给方案起个名字"
                  maxLength={40}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void create();
                    if (event.key === 'Escape') setCreating(false);
                  }}
                />
                <div>
                  <button type="button" className="as-btn as-btn--sm as-btn--ghost" onClick={() => setCreating(false)}>取消</button>
                  <button type="button" className="as-btn as-btn--sm as-btn--primary" disabled={Boolean(busy)} onClick={() => void create()}>
                    {busy === 'save-profile' && <LoaderCircle className="as-spin" />}
                    保存
                  </button>
                </div>
                {pendingChanges > 0 && <p>含 {pendingChanges} 项未应用的改动</p>}
              </div>
            ) : (
              <button type="button" className="pf-add" onClick={() => setCreating(true)}>
                <Plus />
                把现在的设置存成新方案
              </button>
            )}
          </aside>

          <section className="pf-detail">
            {selected && (
              <header className="pf-detail__head">
                <div>
                  <h3>{selected.name}</h3>
                  <p>
                    {formatDate(selected.updatedAt)}保存
                    {selected.sourceAccount ? ` · 从 ${selected.sourceAccount} 存的` : ''}
                  </p>
                </div>
                <button type="button" className="as-btn as-btn--sm" disabled={Boolean(busy)} onClick={() => setConfirm('overwrite')}>
                  <Save />
                  用现在的设置更新
                </button>
                <button type="button" className="as-btn as-btn--sm as-btn--ghost" disabled={Boolean(busy)} onClick={() => setConfirm('delete')} aria-label="删除方案" title="删除方案">
                  <Trash2 />
                </button>
              </header>
            )}

            {detailError ? (
              <div className="as-empty"><CircleAlert /><b>看不了方案内容</b><span>{detailError}</span></div>
            ) : !detail || !partStats ? (
              <div className="as-empty"><LoaderCircle className="as-spin" /><b>正在读取方案…</b></div>
            ) : (
              <>
                <div className="pf-pages" role="tablist" aria-label="方案内容">
                  {PAGES.map((item) => {
                    const Icon = item.icon;
                    const pageParts = CONFIG_PARTS.filter((part) => part.page === item.key);
                    const diff = pageParts.reduce((sum, part) => sum + partStats[part.key], 0);
                    const skipped = pageParts.filter((part) => !parts.has(part.key)).length;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={page === item.key}
                        className="pf-page"
                        onClick={() => setPage(item.key)}
                      >
                        <Icon />
                        <b>{item.label}</b>
                        <span data-tone={skipped === pageParts.length ? 'off' : diff > 0 ? 'diff' : undefined}>
                          {skipped === pageParts.length
                            ? '不应用'
                            : skipped > 0 ? `${diff > 0 ? `${diff} 处不同 · ` : ''}不带 ${skipped} 块`
                              : diff > 0 ? `${diff} 处不同` : '和现在一样'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="pf-pagebody">
                  {page === 'game' && GAME_LAYOUT.map((section) => (
                    <ProfileSection
                      key={section.key}
                      title={section.label}
                      checked={parts.has(section.part)}
                      diff={partStats[section.part]}
                      onToggle={() => togglePart(section.part)}
                    >
                      {section.groups.map((group, index) => (
                        <div key={group.title ?? index} className="pf-group">
                          {group.title && <h5>{group.title}</h5>}
                          <FieldList lines={group.keys.map((key) => gameLine(key, detail.values, current))} />
                        </div>
                      ))}
                    </ProfileSection>
                  ))}

                  {page === 'client' && (
                    <ProfileSection
                      title="客户端"
                      checked={parts.has('client')}
                      diff={partStats.client}
                      onToggle={() => togglePart('client')}
                    >
                      {CLIENT_LAYOUT.map((section) => (
                        <div key={section.key} className="pf-group">
                          <h5>{section.label}</h5>
                          {section.groups.map((group, index) => (
                            <FieldList key={index} lines={group.keys.map((key) => clientLine(key, detail.values, current))} />
                          ))}
                        </div>
                      ))}
                    </ProfileSection>
                  )}

                  {page === 'hotkeys' && (
                    <ProfileSection
                      title="热键"
                      checked={parts.has('hotkeys')}
                      diff={partStats.hotkeys}
                      onToggle={() => togglePart('hotkeys')}
                    >
                      <HotkeyContents saved={detail.values} now={current} />
                    </ProfileSection>
                  )}
                </div>
              </>
            )}

            {selected && (
              <footer className="pf-apply">
                <div>
                  <b>
                    {chosenParts.length === 0
                      ? '至少勾一项'
                      : skippedParts.length === 0 ? '应用整套方案' : `不带：${skippedParts.map((part) => PART_LABELS[part]).join('、')}`}
                  </b>
                  <span>
                    {blockedReason
                      ? blockedReason
                      : partStats
                        ? (totalDiff > 0 ? `改动 ${totalDiff} 项` : '无改动')
                        : detailError ? '' : '读取中…'}
                  </span>
                </div>
                <button
                  type="button"
                  className="as-btn as-btn--primary"
                  disabled={Boolean(busy) || !partStats || chosenParts.length === 0 || Boolean(blockedReason)}
                  onClick={() => (client?.connected ? apply() : setConfirm('offline'))}
                >
                  {applying ? <LoaderCircle className="as-spin" /> : <Gamepad2 />}
                  {client?.connected ? `应用到 ${target.split('#')[0]}` : '应用到这台电脑'}
                </button>
              </footer>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'overwrite'}
        title="用现在的设置更新这个方案"
        description={`用当前设置覆盖「${selected?.name ?? ''}」${pendingChanges > 0 ? `（含 ${pendingChanges} 项未应用的改动）` : ''}`}
        confirmLabel="更新方案"
        busy={busy === 'save-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (selected) void onSave(selected.name).then(() => setConfirm(null));
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="删除这个方案"
        description={`删除「${selected?.name ?? ''}」后无法恢复`}
        confirmLabel="删除方案"
        destructive
        busy={busy === 'delete-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (selected) void onDelete(selected.id).then(() => setConfirm(null));
        }}
      />
      <ConfirmDialog
        open={confirm === 'offline'}
        title="客户端没登录，确定现在应用吗？"
        description="只会写入本机游戏文件，登录后可能被账号设置覆盖"
        confirmLabel="仍然写入文件"
        busy={applying}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          apply();
          setConfirm(null);
        }}
      />
    </div>
  );
}

function ProfileSection({
  title,
  note,
  checked,
  diff,
  onToggle,
  children,
}: {
  title: string;
  note?: string;
  checked: boolean;
  diff: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="pf-sec" data-off={checked ? undefined : 'true'}>
      <header className="pf-sec__head">
        <button
          type="button"
          className="pf-check"
          role="checkbox"
          aria-checked={checked}
          aria-label={`应用时带上「${title}」`}
          title={checked ? `应用时会带上「${title}」，点一下不带` : `应用时不带「${title}」，点一下带上`}
          onClick={onToggle}
        >
          {checked && <Check />}
        </button>
        <b>{title}</b>
        {note && <small>{note}</small>}
        <span className="pf-diff" data-same={diff === 0 ? 'true' : undefined}>
          {!checked ? '这次不应用' : diff === 0 ? '和现在一样' : `和现在不同 ${diff} 处`}
        </span>
      </header>
      <div className="pf-sec__body">{children}</div>
    </section>
  );
}

function FieldList({ lines }: { lines: FieldLine[] }) {
  return (
    <dl className="pf-fields">
      {lines.map((line) => {
        const changed = line.saved !== line.now;
        return (
          <div key={line.key} data-changed={changed ? 'true' : undefined}>
            <dt>{line.label}</dt>
            <dd>
              {line.saved}
              {changed && <s title="现在的设置">{line.now}</s>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// 热键页：上面是英雄热键的键帽，下面按设置页的分组列出其他每一个按键。
function HotkeyContents({ saved, now }: { saved: LolConfigValues; now: LolConfigValues }) {
  const heroGroups = HERO_HOTKEY_GROUPS
    .map((group) => ({ ...group, refs: group.refs.filter((ref) => saved.hotkeys[ref.section]?.[ref.key] !== undefined) }))
    .filter((group) => group.refs.length > 0);
  const categories = buildHotkeyCategories(flattenHotkeys(saved.hotkeys)).filter((category) => category.key !== 'hero');

  if (heroGroups.length === 0 && categories.length === 0) {
    return <p className="pf-note">无热键</p>;
  }

  return (
    <>
      {heroGroups.length > 0 && (
        <div className="pf-group">
          <h5>英雄热键</h5>
          <div className="pf-keys">
            {heroGroups.map((group) => (
              <div key={group.label} className="pf-keys__group">
                <span>{group.label}</span>
                <div>
                  {group.refs.map((ref) => {
                    const value = saved.hotkeys[ref.section]?.[ref.key] ?? '';
                    const quickKey = quickbindKeyFor(ref.key);
                    const quick = quickKey ? saved.hotkeys.Quickbinds?.[quickKey] : undefined;
                    const changed = value.toLowerCase() !== (now.hotkeys[ref.section]?.[ref.key] ?? '').toLowerCase()
                      || (quickKey ? quick !== now.hotkeys.Quickbinds?.[quickKey] : false);
                    return (
                      <div key={ref.key} className="pf-keys__cap" data-changed={changed ? 'true' : undefined}>
                        <KeyCap compact action={HERO_ACTION_LABELS[ref.key] ?? ref.label} value={value} quick={quick} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {categories.map((category) => (
        <div key={category.key} className="pf-group">
          <h5>{category.label}</h5>
          <FieldList
            lines={category.bindings.map((binding) => ({
              key: `${binding.section}.${binding.key}`,
              label: hotkeyLabel(binding.key),
              saved: hotkeyText(binding.section, binding.value),
              now: hotkeyText(binding.section, now.hotkeys[binding.section]?.[binding.key]),
            }))}
          />
        </div>
      ))}
    </>
  );
}
