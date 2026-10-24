import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'dshbm-checker dshbm-inline-flex dshbm-h-3.5 dshbm-w-3.5 dshbm-flex-none dshbm-items-center dshbm-justify-center dshbm-rounded-[4px] dshbm-border focus-visible:dshbm-outline-none focus-visible:dshbm-ring-1 focus-visible:dshbm-ring-ring disabled:dshbm-opacity-40',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="dshbm-flex dshbm-items-center dshbm-justify-center">
      <Check size={10} strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';
