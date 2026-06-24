export type IniData = Record<string, Record<string, string>>;

export function parseIni(content: string | null): IniData {
  const data: IniData = {};
  if (!content) return data;

  let section = '';
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      data[section] = data[section] ?? {};
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    data[section] = data[section] ?? {};
    data[section][key] = value;
  }

  return data;
}

export function iniValue(
  data: IniData,
  section: string,
  key: string,
  fallback: string,
): string {
  return data[section]?.[key] ?? fallback;
}

export function flagToBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === '1') return true;
  if (value === '0') return false;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return fallback;
}

export function boolFlag(value: boolean): string {
  return value ? '1' : '0';
}

export function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ratioToPercent(value: string | undefined, fallback: number): number {
  const parsed = toNumber(value, fallback / 100);
  return clamp(Math.round(parsed * 100), 0, 100);
}

export function percentToRatio(value: number): string {
  return (clamp(value, 0, 100) / 100).toFixed(4);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function yamlScalar(content: string | null, key: string): string | null {
  if (!content) return null;
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}:\\s*(.*?)\\s*$`, 'm');
  const match = content.match(pattern);
  if (!match) return null;
  return unquoteYamlScalar(match[1]);
}

export function yamlBool(content: string | null, key: string, fallback: boolean): boolean {
  const value = yamlScalar(content, key);
  if (value === null) return fallback;
  return flagToBool(value, fallback);
}

export function yamlNumber(content: string | null, key: string, fallback: number): number {
  const value = yamlScalar(content, key);
  return toNumber(value ?? undefined, fallback);
}

export function setIniValue(
  content: string,
  section: string,
  key: string,
  value: string,
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content ? content.split(/\r?\n/) : [];
  const sectionPattern = new RegExp(`^\\s*\\[${escapeRegExp(section)}]\\s*$`, 'i');
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, 'i');

  const sectionIndex = lines.findIndex((line) => sectionPattern.test(line));
  if (sectionIndex === -1) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`[${section}]`, `${key}=${value}`);
    return lines.join(newline);
  }

  let nextSectionIndex = lines.length;
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+]\s*$/.test(lines[index])) {
      nextSectionIndex = index;
      break;
    }
  }

  for (let index = sectionIndex + 1; index < nextSectionIndex; index += 1) {
    if (keyPattern.test(lines[index])) {
      lines[index] = `${key}=${value}`;
      return lines.join(newline);
    }
  }

  lines.splice(nextSectionIndex, 0, `${key}=${value}`);
  return lines.join(newline);
}

function formatYamlValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

export function setFirstYamlScalar(
  content: string,
  key: string,
  value: string | number | boolean,
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const pattern = new RegExp(`^(\\s*)${escapeRegExp(key)}:\\s*.*$`);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (match) {
      lines[index] = `${match[1]}${key}: ${formatYamlValue(value)}`;
      return lines.join(newline);
    }
  }
  return content;
}

function indentation(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

export function setYamlSectionChildScalar(
  content: string,
  sectionKey: string,
  childKey: string,
  value: string | number | boolean,
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const sectionPattern = new RegExp(`^\\s*${escapeRegExp(sectionKey)}:\\s*$`);

  for (let index = 0; index < lines.length; index += 1) {
    if (!sectionPattern.test(lines[index])) continue;
    const sectionIndent = indentation(lines[index]);
    const childPattern = new RegExp(`^(\\s*)${escapeRegExp(childKey)}:\\s*.*$`);

    for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
      if (lines[childIndex].trim() && indentation(lines[childIndex]) <= sectionIndent) break;
      const match = lines[childIndex].match(childPattern);
      if (match) {
        lines[childIndex] = `${match[1]}${childKey}: ${formatYamlValue(value)}`;
        return lines.join(newline);
      }
    }
  }

  return content;
}
