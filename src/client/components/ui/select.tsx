import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'dshbm-flex dshbm-h-7 dshbm-w-full dshbm-items-center dshbm-justify-between dshbm-gap-1 dshbm-rounded-md dshbm-border dshbm-border-border dshbm-bg-transparent dshbm-px-2 dshbm-text-xs dshbm-text-foreground focus-visible:dshbm-outline-none focus-visible:dshbm-ring-1 focus-visible:dshbm-ring-ring disabled:dshbm-opacity-50 [&>span]:dshbm-truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown size={12} className="dshbm-opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'dshbm-popoverContent dshbm-relative dshbm-z-[2147483003] dshbm-max-h-72 dshbm-min-w-[8rem] dshbm-overflow-hidden dshbm-rounded-md',
        position === 'popper' &&
          'data-[side=bottom]:dshbm-translate-y-1 data-[side=top]:-dshbm-translate-y-1',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="dshbm-flex dshbm-h-5 dshbm-items-center dshbm-justify-center">
        <ChevronUp size={12} />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="dshbm-p-1">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="dshbm-flex dshbm-h-5 dshbm-items-center dshbm-justify-center">
        <ChevronDown size={12} />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      'dshbm-px-2 dshbm-py-1 dshbm-text-2xs dshbm-font-medium dshbm-uppercase dshbm-tracking-wide dshbm-text-muted-foreground',
      className,
    )}
    {...props}
  />
));
SelectLabel.displayName = 'SelectLabel';

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'dshbm-relative dshbm-flex dshbm-w-full dshbm-cursor-default dshbm-select-none dshbm-items-center dshbm-rounded-sm dshbm-py-1 dshbm-pl-6 dshbm-pr-2 dshbm-text-xs dshbm-outline-none focus:dshbm-bg-accent data-[disabled]:dshbm-pointer-events-none data-[disabled]:dshbm-opacity-50',
      className,
    )}
    {...props}
  >
    <span className="dshbm-absolute dshbm-left-1.5 dshbm-flex dshbm-h-3.5 dshbm-w-3.5 dshbm-items-center dshbm-justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check size={11} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('dshbm-my-1 dshbm-h-px dshbm-bg-border', className)}
    {...props}
  />
));
SelectSeparator.displayName = 'SelectSeparator';

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
