import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tokens.css 里自定义的字号（text-cap / text-meta …）要告诉 tailwind-merge，
// 否则它会把 `text-meta` 当成文字颜色，和 `text-text-1` 合并时被丢掉。
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['cap', 'meta', 'body', 'list', 'section', 'title', 'hero'],
    },
  },
});

// shadcn 组件标配的类名合并工具：clsx 拼接 + tailwind-merge 去重冲突类。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 数据源给的更新时间可能是 ISO 串（2026-10-29T07:59:23.058Z），统一显示成「10月29日 15:59」。
// 解析不了的原样返回。
export function formatUpdatedAt(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value);
  const looksLikeIso = /^\d{4}-\d{2}-\d{2}T/.test(text) || typeof value === 'number';
  if (!looksLikeIso) return text;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
