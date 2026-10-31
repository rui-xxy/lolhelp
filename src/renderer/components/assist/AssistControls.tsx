import type { CSSProperties, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { SwitchControl } from '../settings/SettingsControls';

// 助手页的基础积木。样式都在 styles/features/assist.css（as- 前缀）。

export function Panel({
  title,
  count,
  description,
  extra,
  muted = false,
  children,
}: {
  title: string;
  count?: number;
  description?: ReactNode;
  extra?: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="as-panel" data-muted={muted ? 'true' : undefined}>
      <header className="as-panel__head">
        <div>
          <h3 className="as-panel__title">
            {title}
            {count !== undefined && <small>{count}</small>}
          </h3>
          {description && <p className="as-panel__desc">{description}</p>}
        </div>
        {extra && <div className="as-panel__extra">{extra}</div>}
      </header>
      {children}
    </section>
  );
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="as-panel__body">{children}</div>;
}

export function PanelFoot({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <footer className="as-panel__foot">
      <p>{note}</p>
      {children}
    </footer>
  );
}

// 一个功能：图标 + 名字 + 一句话说明它替你做什么 + 开关。打开后才展开它的细节。
export function Feature({
  icon,
  title,
  description,
  checked,
  onChange,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  checked?: boolean;
  onChange?: (value: boolean) => void;
  children?: ReactNode;
}) {
  const hasSwitch = checked !== undefined && onChange;
  const showOptions = Boolean(children) && (!hasSwitch || checked);
  return (
    <div className="as-feature" data-on={checked ? 'true' : undefined}>
      <span className="as-feature__icon" aria-hidden="true">{icon}</span>
      <div>
        <div className="as-feature__title">{title}</div>
        <div className="as-feature__desc">{description}</div>
      </div>
      {hasSwitch ? <SwitchControl checked={Boolean(checked)} onChange={onChange} /> : <span />}
      {showOptions && <div className="as-feature__options">{children}</div>}
    </div>
  );
}

// 单选卡片：互斥的几种做法放在一起，一眼看出现在选的是哪个。
export function Choices<T extends string>({
  value,
  options,
  onChange,
  columns,
  label,
}: {
  value: T;
  options: Array<{ value: T; title: string; description?: string }>;
  onChange: (value: T) => void;
  columns?: number;
  label: string;
}) {
  return (
    <div
      className="as-choices"
      role="radiogroup"
      aria-label={label}
      style={{ '--as-cols': columns ?? options.length } as CSSProperties}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="as-choice"
          onClick={() => onChange(option.value)}
        >
          <span className="as-choice__title">{option.title}</span>
          {option.description && <span className="as-choice__desc">{option.description}</span>}
        </button>
      ))}
    </div>
  );
}

// 一排胶囊选项（单选）。
export function ChipChoices<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="as-chips" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          className="as-chip"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  optional = false,
  hint,
  wide = false,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`as-field ${wide ? 'as-field--wide' : ''}`}>
      <span className="as-field__label">
        {label}
        {optional && <em>选填</em>}
      </span>
      {children}
      {hint && <span className="as-field__hint">{hint}</span>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  maxLength,
  onEnter,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  maxLength?: number;
  onEnter?: () => void;
}) {
  return (
    <input
      className="as-input"
      type={type}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onEnter) onEnter();
      }}
    />
  );
}

export function Btn({
  children,
  onClick,
  tone = 'default',
  size = 'md',
  disabled = false,
  busy = false,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  disabled?: boolean;
  busy?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || busy}
      onClick={onClick}
      className={`as-btn ${tone !== 'default' ? `as-btn--${tone}` : ''} ${size === 'sm' ? 'as-btn--sm' : ''}`}
    >
      {busy && <LoaderCircle className="as-spin" />}
      {children}
    </button>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="as-empty">
      {icon}
      <b>{title}</b>
      {children && <span>{children}</span>}
    </div>
  );
}
