import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn 组件标配的类名合并工具：clsx 拼接 + tailwind-merge 去重冲突类。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
