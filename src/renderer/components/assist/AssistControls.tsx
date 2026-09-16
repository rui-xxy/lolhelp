import { useState } from 'react';
import { SwitchControl } from '../settings/SettingsControls';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';

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
    <Input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
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
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>{label}</option>
      ))}
    </Select>
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
    <Button
      type="button"
      variant="outline"
      size="lg"
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
      className={`w-full justify-start px-3 text-left font-mono text-xs ${
        recording
          ? 'border-app-focus bg-app-info-soft text-app-text shadow-ui-info-focus'
          : 'border-app-border bg-app-surface text-app-text hover:border-app-border-strong hover:bg-app-surface'
      }`}
    >
      {recording ? '请按下快捷键…（Esc 取消）' : value || '点击录入快捷键'}
    </Button>
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
    <Button
      type="button"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="text-xs font-semibold hover:bg-app-primary-hover hover:shadow-ui-primary-hover"
    >
      {children}
    </Button>
  );
}
