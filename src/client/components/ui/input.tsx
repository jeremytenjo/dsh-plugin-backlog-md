import * as React from 'react';

import { cn } from '../../lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'dshbm-flex dshbm-h-8 dshbm-w-full dshbm-rounded-md dshbm-border dshbm-border-border dshbm-bg-background dshbm-px-2 dshbm-text-[12.5px] dshbm-text-foreground placeholder:dshbm-text-muted-foreground hover:dshbm-border-[var(--dsw-alias-border-l3)] focus-visible:dshbm-outline-none focus-visible:dshbm-ring-1 focus-visible:dshbm-ring-ring disabled:dshbm-opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'dshbm-flex dshbm-min-h-24 dshbm-w-full dshbm-resize-y dshbm-rounded-md dshbm-border dshbm-border-border dshbm-bg-background dshbm-px-2.5 dshbm-py-2 dshbm-text-[12.5px] dshbm-leading-relaxed dshbm-text-foreground placeholder:dshbm-text-muted-foreground hover:dshbm-border-[var(--dsw-alias-border-l3)] focus-visible:dshbm-outline-none focus-visible:dshbm-ring-1 focus-visible:dshbm-ring-ring disabled:dshbm-opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('dshbm-text-[11.5px] dshbm-font-medium dshbm-text-muted-foreground', className)}
    {...props}
  />
));
Label.displayName = 'Label';
