import * as React from 'react';

import { cn } from '../../lib/utils';

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'h-9 w-full rounded-sm border border-app-border bg-app-surface px-3 text-sm text-app-text outline-none transition-[border-color,box-shadow] placeholder:text-app-subtle hover:border-app-border-strong focus:border-app-primary focus:shadow-ui-focus-soft disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
