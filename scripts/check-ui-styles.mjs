import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const rendererRoot = path.join(projectRoot, 'src', 'renderer');
const stylesRoot = path.join(rendererRoot, 'styles');
const errors = [];

function walk(directory, extensions) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(target);
  }
  return files;
}

function relative(file) {
  return path.relative(projectRoot, file).replaceAll('\\', '/');
}

function count(source, expression) {
  return source.match(expression)?.length ?? 0;
}

const cssFiles = walk(stylesRoot, ['.css']);
const indexPath = path.join(stylesRoot, 'index.css');
const indexLines = fs.readFileSync(indexPath, 'utf8').split(/\r?\n/).filter(Boolean);

if (indexLines.some((line) => !/^@import\s+"[^"]+";$/.test(line))) {
  errors.push('src/renderer/styles/index.css 只能包含 @import。');
}

for (const file of cssFiles) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
  if (file !== indexPath && lines > 2000) {
    errors.push(`${relative(file)} 有 ${lines} 行，超过单模块 2000 行上限。`);
  }
}

const importantCount = cssFiles.reduce(
  (total, file) => total + count(fs.readFileSync(file, 'utf8'), /!important\b/g),
  0,
);
if (importantCount > 26) {
  errors.push(`!important 数量从基线 26 增长到 ${importantCount}。`);
}

// tokens.css / themes.css 是颜色定义本身；light.css 是浅色模式对老样式的颜色修正表，三者都不计入。
const COLOR_DEFINITION_FILES = new Set(['tokens.css', 'themes.css', 'light.css']);
const legacyCssColorCount = cssFiles
  .filter((file) => !COLOR_DEFINITION_FILES.has(path.basename(file)))
  .reduce(
    (total, file) => total + count(
      fs.readFileSync(file, 'utf8'),
      /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\s*\(/g,
    ),
    0,
  );
// 2026-10 改版后的基线：每迁移一页就把这个数调低，只许减少。
const LEGACY_CSS_COLOR_BUDGET = 395;
if (legacyCssColorCount > LEGACY_CSS_COLOR_BUDGET) {
  errors.push(`CSS 硬编码颜色数量从基线 ${LEGACY_CSS_COLOR_BUDGET} 增长到 ${legacyCssColorCount}。`);
}

// 设计基线（tokens.css）：字号不小于 11px、不用衬线字体、圆角只用 token 或 0/1/2/999px。
for (const file of cssFiles) {
  if (COLOR_DEFINITION_FILES.has(path.basename(file))) continue;
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  lines.forEach((text, index) => {
    const location = `${relative(file)}:${index + 1}`;
    const size = text.match(/font-size:\s*([0-9.]+)px/);
    if (size && Number(size[1]) < 11) errors.push(`${location} 字号 ${size[1]}px 小于 11px。`);
    if (/font-family:[^;]*\b(Georgia|Times New Roman|serif)\b/.test(text) && !/sans-serif/.test(text)) {
      errors.push(`${location} 使用了衬线字体；数字请用 var(--font-num)。`);
    }
    const radius = text.match(/border-radius:\s*([0-9.]+)px\s*;/);
    if (radius && ![0, 1, 2, 999].includes(Number(radius[1]))) {
      errors.push(`${location} 圆角 ${radius[1]}px 不在规范内；请用 var(--radius-xs|sm|lg) 或 999px。`);
    }
  });
}

const tsxFiles = walk(rendererRoot, ['.tsx']);
const allowedColorFiles = new Set([
  'src/renderer/components/match/DamageEnergyBar.tsx',
]);

for (const file of tsxFiles) {
  const name = relative(file);
  if (name.endsWith('.test.tsx') || allowedColorFiles.has(name)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const hardcodedColors = [...source.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/g)];
  const paletteClass = source.match(/\b(?:bg|text|border|ring|divide|from|to|fill|stroke)-(?:red|green|blue|yellow|gray|slate|zinc|neutral|stone|emerald|amber|rose|sky|orange|lime|teal|cyan|indigo|violet|purple|fuchsia|pink)-\d{2,3}\b|\b(?:bg|text|border|ring)-(?:white|black)\b/);
  if (paletteClass) {
    const line = source.slice(0, paletteClass.index).split(/\r?\n/).length;
    errors.push(`${name}:${line} 使用了 Tailwind 原生色板 ${paletteClass[0]}；请用 tokens.css 的语义色。`);
  }
  const tinyText = source.match(/text-\[(?:[0-9]|10)(?:\.\d+)?px\]/);
  if (tinyText) {
    const line = source.slice(0, tinyText.index).split(/\r?\n/).length;
    errors.push(`${name}:${line} ${tinyText[0]} 小于 11px。`);
  }
  if (hardcodedColors.length > 0) {
    const line = source.slice(0, hardcodedColors[0].index).split(/\r?\n/).length;
    errors.push(`${name}:${line} 含硬编码颜色；请使用 tokens.css 或 styles/palette.ts。`);
  }
}

const arbitraryBudgets = [
  { label: 'text-[…]', expression: /text-\[[^\]]+\]/g, maximum: 111 },
  { label: 'rounded-[…]', expression: /rounded-\[[^\]]+\]/g, maximum: 3 },
  { label: 'shadow-[…]', expression: /(?:shadow|drop-shadow)-\[[^\]]+\]/g, maximum: 5 },
];

for (const budget of arbitraryBudgets) {
  const total = tsxFiles.reduce(
    (sum, file) => sum + count(fs.readFileSync(file, 'utf8'), budget.expression),
    0,
  );
  if (total > budget.maximum) {
    errors.push(`${budget.label} 数量从基线 ${budget.maximum} 增长到 ${total}。`);
  }
}

if (errors.length > 0) {
  console.error(['UI style check failed:', ...errors.map((error) => `- ${error}`)].join('\n'));
  process.exit(1);
}

console.log(
  `UI style check passed (${cssFiles.length} CSS modules, ${importantCount} legacy !important declarations, ${legacyCssColorCount} legacy CSS colors).`,
);
