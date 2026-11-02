import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Ellipsis,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import type { LolConfigPart, LolConfigProfileSummary } from '../../../shared/api';
import { PART_LABEL, PART_ORDER } from './configDiff';
import { PART_ICON } from './ConfigPanels';

// 设置页顶上：选哪个方案、现在登录的是哪个号，以及最要紧的一句话——它俩一不一样。
// 左边一个七段的小环，一段是一块设置（画面、操作…客户端）：绿的是一样，金的是不一样。

export type HeroState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'error'; text: string }
  | { kind: 'synced' }
  | { kind: 'diff'; total: number; stats: Record<LolConfigPart, number> }
  | { kind: 'pending'; total: number; stats: Record<LolConfigPart, number> };

export interface HeroProfile {
  profile: LolConfigProfileSummary;
  total: number | null;
  error: string;
}

export interface HeroAccount {
  connected: boolean;
  name: string;
  tag: string;
  /** 标题里怎么称呼它：号名，没登录时是「这台电脑」 */
  who: string;
  phase: string;
  blocked?: string;
}

function formatDate(time: number): string {
  if (!time) return '';
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日`;
}

export function ConfigHero({
  state,
  profiles,
  selected,
  account,
  excluded,
  busy,
  saving,
  naming,
  dirControl,
  onPick,
  onStartNaming,
  onCancelNaming,
  onCreate,
  onOverwrite,
  onDelete,
  onToggleExclude,
  onApply,
  onUpdateProfile,
  onWrite,
  onUndo,
  onRefreshClient,
}: {
  state: HeroState;
  profiles: HeroProfile[];
  selected: HeroProfile | null;
  account: HeroAccount;
  excluded: Set<LolConfigPart>;
  busy: string | null;
  saving: boolean;
  naming: boolean;
  dirControl: ReactNode;
  onPick: (id: string) => void;
  onStartNaming: () => void;
  onCancelNaming: () => void;
  onCreate: (name: string) => void;
  onOverwrite: () => void;
  onDelete: () => void;
  onToggleExclude: (part: LolConfigPart) => void;
  onApply: () => void;
  onUpdateProfile: () => void;
  onWrite: () => void;
  onUndo: () => void;
  onRefreshClient: () => void;
}) {
  const name = selected?.profile.name ?? '';
  const tone = state.kind === 'synced' ? 'ok'
    : state.kind === 'diff' || state.kind === 'pending' ? 'gold'
      : state.kind === 'error' ? 'bad' : 'idle';

  // ---------- 一句话 ----------
  let title: ReactNode;
  let sub: ReactNode = null;
  let actions: ReactNode = null;
  let note = '';

  const nameInput = (
    <NameInput
      placeholder={`方案 ${profiles.length + 1}`}
      busy={busy === 'save-profile'}
      onSubmit={onCreate}
      onCancel={onCancelNaming}
    />
  );

  if (state.kind === 'none') {
    title = <>把游戏里的设置存成方案</>;
    sub = <p>画面、操作、热键、客户端设置一次存好。换号、重装之后点一下，熟悉的手感就回来了。</p>;
    actions = naming ? nameInput : (
      <button type="button" className="cw-btn cw-btn--primary" disabled={Boolean(busy)} onClick={onStartNaming}>
        <Save />
        存成方案
      </button>
    );
  } else if (state.kind === 'loading') {
    title = <>正在读方案「{name}」…</>;
  } else if (state.kind === 'error') {
    title = <>方案「{name}」读不出来</>;
    sub = <p>{state.text}</p>;
  } else if (state.kind === 'synced') {
    title = <><b>{account.who}</b>和「{name}」完全一样</>;
    sub = <p>七块设置都对得上。换了号再来看一眼，有不一样的点一下就同步过去。</p>;
  } else if (state.kind === 'diff') {
    const parts = PART_ORDER.filter((part) => state.stats[part] > 0);
    const taken = parts.filter((part) => !excluded.has(part));
    const takenRows = taken.reduce((total, part) => total + state.stats[part], 0);
    title = <><b>{account.who}</b>和「{name}」有 <em className="num">{state.total}</em> 处不一样</>;
    sub = (
      <div className="cw-hero__parts" role="group" aria-label="应用时带上哪几块">
        {parts.map((part) => {
          const Icon = PART_ICON[part];
          const on = !excluded.has(part);
          return (
            <button
              key={part}
              type="button"
              className="cw-part"
              aria-pressed={on}
              title={on ? `应用时带上${PART_LABEL[part]}，点一下不带` : `这次不带${PART_LABEL[part]}，点一下带上`}
              onClick={() => onToggleExclude(part)}
            >
              <Icon />
              {PART_LABEL[part]}
              <b className="num">{state.stats[part]}</b>
            </button>
          );
        })}
      </div>
    );
    actions = (
      <>
        <button
          type="button"
          className="cw-btn"
          disabled={Boolean(busy)}
          onClick={onUpdateProfile}
          title={`反过来：把${account.connected ? ` ${account.who} ` : '游戏里'}现在的设置存进「${name}」`}
        >
          <ArrowLeft />
          存进方案
        </button>
        <button
          type="button"
          className="cw-btn cw-btn--primary"
          disabled={Boolean(busy) || Boolean(account.blocked) || taken.length === 0}
          onClick={onApply}
          title={`把「${name}」里的${taken.map((part) => PART_LABEL[part]).join('、')}应用到${account.connected ? ` ${account.who}` : '这台电脑'}`}
        >
          {busy === 'apply-profile' ? <LoaderCircle className="as-spin" /> : null}
          应用到{account.connected ? '这个号' : '本机'}
          {busy !== 'apply-profile' && <ArrowRight />}
        </button>
      </>
    );
    note = account.blocked
      ? `${account.blocked}，打完再应用`
      : taken.length === 0 ? '至少带上一块才能应用'
        : taken.length < parts.length ? `只应用 ${takenRows} 处，改之前会自动备份` : '改之前会自动备份原来的设置文件';
  } else {
    title = <>改了 <em className="num">{state.total}</em> 项，还没写进游戏</>;
    const parts = PART_ORDER.filter((part) => state.stats[part] > 0);
    sub = (
      <div className="cw-hero__parts">
        {parts.map((part) => {
          const Icon = PART_ICON[part];
          return (
            <span key={part} className="cw-part" data-static="true">
              <Icon />
              {PART_LABEL[part]}
              <b className="num">{state.stats[part]}</b>
            </span>
          );
        })}
      </div>
    );
    actions = (
      <>
        <button type="button" className="cw-btn" disabled={Boolean(busy)} onClick={onUndo}>
          <RotateCcw />
          撤销
        </button>
        <button type="button" className="cw-btn cw-btn--primary" disabled={Boolean(busy) || Boolean(account.blocked)} onClick={onWrite}>
          {busy === 'apply' ? <LoaderCircle className="as-spin" /> : <Upload />}
          写入游戏
        </button>
      </>
    );
    note = account.blocked ? `${account.blocked}，打完再写入` : '写入前会自动备份原来的设置文件';
  }

  // ---------- 小环 ----------
  const ringTone = (part: LolConfigPart): string => {
    if (state.kind === 'synced') return 'ok';
    if (state.kind === 'diff') return state.stats[part] === 0 ? 'ok' : excluded.has(part) ? 'off' : 'gold';
    if (state.kind === 'pending') return state.stats[part] > 0 ? 'gold' : 'idle';
    return 'idle';
  };
  let center: ReactNode;
  if (state.kind === 'synced') center = <Check className="cw-ring__icon" />;
  else if (state.kind === 'diff' || state.kind === 'pending') center = <b className="num">{state.total}</b>;
  else if (state.kind === 'loading') center = <LoaderCircle className="cw-ring__icon as-spin" />;
  else if (state.kind === 'error') center = <CircleAlert className="cw-ring__icon" />;
  else center = <Save className="cw-ring__icon" />;

  const ringLabel = PART_ORDER.map((part) => {
    const tone = ringTone(part);
    return `${PART_LABEL[part]}${tone === 'ok' ? '一样' : tone === 'gold' ? '不一样' : tone === 'off' ? '不带' : ''}`;
  }).join('，');

  return (
    <header className="cw-hero" data-tone={tone}>
      <div className="cw-hero__top">
        <div className="cw-slots">
          {profiles.length > 0 && <span className="cw-slots__label">方案</span>}
          {profiles.map((item) => {
            const isSelected = item.profile.id === selected?.profile.id;
            return (
              <button
                key={item.profile.id}
                type="button"
                className="cw-slot"
                aria-pressed={isSelected}
                onClick={() => onPick(item.profile.id)}
                title={`${item.profile.name} · ${formatDate(item.profile.updatedAt)}存${item.profile.sourceAccount ? ` · 来自 ${item.profile.sourceAccount.split('#')[0]}` : ''}`}
              >
                <span className="cw-slot__name">{item.profile.name}</span>
                {item.error ? (
                  <i className="cw-slot__state" data-tone="bad"><CircleAlert /></i>
                ) : item.total === null ? null : item.total === 0 ? (
                  <i className="cw-slot__state" data-tone="ok"><Check /></i>
                ) : (
                  <i className="cw-slot__state num" data-tone="gold">{item.total}</i>
                )}
                {isSelected && saving && <i className="cw-slot__saving" aria-label="保存中" />}
              </button>
            );
          })}
          {profiles.length > 0 && (naming ? nameInput : (
            <button type="button" className="cw-slot cw-slot--add" disabled={Boolean(busy)} onClick={onStartNaming} title="把游戏里现在的设置存成一个新方案">
              <Plus />
              新方案
            </button>
          ))}
          {selected && (
            <SlotMenu profile={selected.profile} who={account.connected ? account.who : '游戏里'} busy={busy} onOverwrite={onOverwrite} onDelete={onDelete} />
          )}
        </div>
        <div className="cw-who" data-state={!account.connected ? 'off' : account.blocked ? 'busy' : 'on'}>
          <i aria-hidden="true" />
          {account.connected ? (
            <span className="cw-who__name">
              <b>{account.name}</b>
              {account.tag && <span className="num">#{account.tag}</span>}
            </span>
          ) : (
            <span className="cw-who__name"><b>客户端没登录</b></span>
          )}
          <span className="cw-who__phase">{account.connected ? account.phase : '改的是这台电脑上的游戏文件'}</span>
          <button type="button" className="cw-icon-btn" onClick={onRefreshClient} title="重新看一下登录的是哪个号" aria-label="刷新登录状态">
            <RefreshCw />
          </button>
          <span className="cw-who__dir">{dirControl}</span>
        </div>
      </div>

      <div className="cw-hero__main">
        <div className="cw-ring" role="img" aria-label={ringLabel}>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            {PART_ORDER.map((part, index) => (
              <circle
                key={part}
                className="cw-ring__seg"
                data-tone={ringTone(part)}
                cx="32"
                cy="32"
                r="27"
                pathLength={700}
                strokeDasharray="86 614"
                transform={`rotate(${-90 + index * (360 / 7) + 3.6} 32 32)`}
              />
            ))}
          </svg>
          <span className="cw-ring__center">{center}</span>
        </div>
        <div className="cw-hero__text">
          <h2>{title}</h2>
          {sub}
        </div>
        {(actions || note) && (
          <div className="cw-hero__actions">
            <div>{actions}</div>
            {note && <small>{note}</small>}
          </div>
        )}
      </div>
    </header>
  );
}

// ---------- 起名字 ----------

function NameInput({
  placeholder,
  busy,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      className="cw-name"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value.trim() || placeholder);
      }}
    >
      <input
        autoFocus
        id="cw-new-profile"
        value={value}
        placeholder={placeholder}
        maxLength={40}
        aria-label="新方案的名字"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
        onBlur={() => {
          if (!value.trim() && !busy) onCancel();
        }}
      />
      <button type="submit" className="cw-name__ok" disabled={busy} aria-label="保存" onMouseDown={(event) => event.preventDefault()}>
        {busy ? <LoaderCircle className="as-spin" /> : <Check />}
      </button>
    </form>
  );
}

// ---------- 方案菜单：覆盖、删除 ----------

function SlotMenu({
  profile,
  who,
  busy,
  onOverwrite,
  onDelete,
}: {
  profile: LolConfigProfileSummary;
  who: string;
  busy: string | null;
  onOverwrite: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="cw-menu" ref={ref}>
      <button
        type="button"
        className="cw-icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`方案「${profile.name}」的更多操作`}
        onClick={() => setOpen((value) => !value)}
      >
        <Ellipsis />
      </button>
      {open && (
        <div className="cw-menu__pop" role="menu">
          <div className="cw-menu__meta">
            <b>{profile.name}</b>
            <span>
              {formatDate(profile.updatedAt)}存
              {profile.sourceAccount ? ` · 来自 ${profile.sourceAccount.split('#')[0]}` : ''}
              {profile.gameResolution ? ` · ${profile.gameResolution.replace(/\s*x\s*/i, '×')}` : ''}
            </span>
          </div>
          <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => { setOpen(false); onOverwrite(); }}>
            <ArrowLeft />
            <span>用{who}现在的设置覆盖它</span>
          </button>
          <button type="button" role="menuitem" data-tone="danger" disabled={Boolean(busy)} onClick={() => { setOpen(false); onDelete(); }}>
            <Trash2 />
            <span>删除这个方案</span>
          </button>
        </div>
      )}
    </div>
  );
}
