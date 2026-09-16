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
if (importantCount > 35) {
  errors.push(`!important 数量从基线 35 增长到 ${importantCount}。`);
}

const legacyCssColorCount = cssFiles
  .filter((file) => path.basename(file) !== 'tokens.css')
  .reduce(
    (total, file) => total + count(
      fs.readFileSync(file, 'utf8'),
      /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\s*\(/g,
    ),
    0,
  );
if (legacyCssColorCount > 786) {
  errors.push(`CSS 硬编码颜色数量从基线 786 增长到 ${legacyCssColorCount}。`);
}

const tsxFiles = walk(rendererRoot, ['.tsx']);
const allowedColorFiles = new Set([
  'src/renderer/components/match/DamageEnergyBar.tsx',
  'src/renderer/components/scout/ScoutEnergyCore.tsx',
  'src/renderer/components/scout/ScoutSearchVisualizer.tsx',
]);

for (const file of tsxFiles) {
  const name = relative(file);
  if (name.endsWith('.test.tsx') || allowedColorFiles.has(name)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const hardcodedColors = [...source.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/g)];
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
