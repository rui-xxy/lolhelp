import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '../../lib/utils';

function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <span data-slot="select-root" className="relative block w-full">
      <select
        data-slot="select"
        className={cn(
          'h-9 w-full appearance-none rounded-sm border border-app-border bg-app-surface pr-9 pl-3 text-sm text-app-text outline-none transition-[border-color,box-shadow] hover:border-app-border-strong focus:border-app-primary focus:shadow-ui-focus-soft disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-app-subtle" />
    </span>
  );
}

export { Select };
