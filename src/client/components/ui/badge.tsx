import * as React from 'react';

import { cn } from '../../lib/utils';

export function Badge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'dshbm-inline-flex dshbm-items-center dshbm-gap-1 dshbm-whitespace-nowrap dshbm-rounded-full dshbm-border dshbm-px-1.5 dshbm-py-[1px] dshbm-text-2xs dshbm-font-medium dshbm-leading-4',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
