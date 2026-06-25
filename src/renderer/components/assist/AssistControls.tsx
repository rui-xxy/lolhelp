import { useState } from 'react';
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
    <section className="rounded-md border border-app-border bg-app-surface p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-app-text">{title}</h3>
        {description && <p className="mt-1 text-xs text-app-muted">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
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
    <div className="flex items-center justify-between gap-5 border-b border-app-border/70 py-2 last:border-b-0">
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
      className="h-9 w-full rounded-sm border border-app-border bg-app-bg px-3 text-sm text-app-text outline-none transition-colors focus:border-app-primary"
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
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-sm border border-app-border bg-app-bg px-3 text-sm text-app-text outline-none focus:border-app-primary"
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>{label}</option>
      ))}
    </select>
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
      className={`h-9 w-full rounded-sm border px-3 text-left text-sm outline-none transition-colors ${
        recording
          ? 'border-app-primary bg-app-primary-soft text-app-primary'
          : 'border-app-border bg-app-bg text-app-text hover:border-app-border-strong'
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
      className="rounded-sm bg-app-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
