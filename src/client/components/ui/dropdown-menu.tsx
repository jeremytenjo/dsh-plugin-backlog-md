import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'dshbm-ui dshbm-popoverContent dshbm-z-[2147483003] dshbm-min-w-[10rem] dshbm-overflow-hidden dshbm-rounded-md dshbm-p-1',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    destructive?: boolean;
  }
>(({ className, destructive = false, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'dshbm-relative dshbm-flex dshbm-cursor-default dshbm-select-none dshbm-items-center dshbm-gap-2 dshbm-rounded-sm dshbm-px-2 dshbm-py-1.5 dshbm-text-[12px] dshbm-outline-none focus:dshbm-bg-accent data-[disabled]:dshbm-pointer-events-none data-[disabled]:dshbm-opacity-50',
      destructive && 'dshbm-text-destructive focus:dshbm-bg-destructive/10',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(
      'dshbm-relative dshbm-flex dshbm-cursor-default dshbm-select-none dshbm-items-center dshbm-gap-2 dshbm-rounded-sm dshbm-py-1.5 dshbm-pl-7 dshbm-pr-2 dshbm-text-[12px] dshbm-outline-none focus:dshbm-bg-accent',
      className,
    )}
    {...props}
  >
    <span className="dshbm-absolute dshbm-left-2 dshbm-flex dshbm-h-3 dshbm-w-3 dshbm-items-center dshbm-justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check size={11} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'dshbm-px-2 dshbm-py-1 dshbm-text-[11.5px] dshbm-font-medium dshbm-text-muted-foreground',
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('dshbm-my-1 dshbm-h-px dshbm-bg-border', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
