import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SwitchControl } from '../settings/SettingsControls';

export function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 px-0.5">
        <h3 className="text-[15px] font-semibold text-app-text">{title}</h3>
        {description && <p className="mt-1 max-w-2xl text-xs leading-5 text-app-muted">{description}</p>}
      </div>
      <div className="divide-y divide-app-border/60 overflow-hidden rounded-md border border-app-border/80 bg-app-bg-soft/45 px-4">
        {children}
      </div>
    </section>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-5 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-app-body">{label}</div>
        {description && <div className="mt-0.5 text-xs text-app-muted">{description}</div>}
      </div>
      <SwitchControl checked={checked} onChange={onChange} />
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-sm border border-app-border bg-app-surface px-3 text-sm text-app-text outline-none transition-[border-color,box-shadow] placeholder:text-app-subtle hover:border-app-border-strong focus:border-app-primary focus:shadow-[0_0_0_3px_rgba(94,106,210,0.07)]"
    />
  );
}

export function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <span className="relative block w-full">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full appearance-none rounded-sm border border-app-border bg-app-surface pr-9 pl-3 text-sm text-app-text outline-none transition-colors hover:border-app-border-strong focus:border-app-primary"
      >
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>{label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-app-subtle" />
    </span>
  );
}

export function HotkeyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        if (!recording) return;
        event.preventDefault();
        if (event.key === 'Escape') {
          setRecording(false);
          return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          onChange('');
          setRecording(false);
          return;
        }
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
        const parts: string[] = [];
        if (event.ctrlKey || event.metaKey) parts.push('CTRL');
        if (event.altKey) parts.push('ALT');
        if (event.shiftKey) parts.push('SHIFT');
        parts.push(event.key === ' ' ? 'SPACE' : event.key.toUpperCase());
        onChange(parts.join('+'));
        setRecording(false);
      }}
      className={`h-9 w-full rounded-sm border px-3 text-left font-mono text-xs outline-none transition-[border-color,background-color,box-shadow] ${
        recording
          ? 'border-app-focus bg-blue-50/60 text-app-text shadow-[0_0_0_3px_rgba(51,156,255,0.1)]'
          : 'border-app-border bg-app-surface text-app-text hover:border-app-border-strong'
      }`}
    >
      {recording ? '请按下快捷键…（Esc 取消）' : value || '点击录入快捷键'}
    </button>
  );
}

export function ActionButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 rounded-sm bg-app-primary px-3.5 text-xs font-semibold text-app-primary-foreground transition-[background-color,box-shadow] hover:bg-app-primary-hover hover:shadow-[0_2px_8px_rgba(94,106,210,0.16)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
