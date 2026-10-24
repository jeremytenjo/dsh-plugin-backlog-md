import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'dshbm-inline-flex dshbm-items-center dshbm-justify-center dshbm-gap-1.5 dshbm-whitespace-nowrap dshbm-rounded-md dshbm-text-xs dshbm-font-medium dshbm-transition-colors active:dshbm-translate-y-px focus-visible:dshbm-outline-none focus-visible:dshbm-ring-2 focus-visible:dshbm-ring-ring focus-visible:dshbm-ring-offset-1 disabled:dshbm-pointer-events-none disabled:dshbm-opacity-45',
  {
    variants: {
      variant: {
        default: 'dshbm-bg-primary dshbm-text-primary-foreground hover:dshbm-bg-primary/90',
        outline:
          'dshbm-border dshbm-border-border dshbm-bg-transparent dshbm-text-foreground hover:dshbm-bg-accent',
        ghost:
          'dshbm-bg-transparent dshbm-text-muted-foreground hover:dshbm-bg-accent hover:dshbm-text-accent-foreground',
        secondary: 'dshbm-bg-secondary dshbm-text-secondary-foreground hover:dshbm-bg-accent',
        destructive:
          'dshbm-bg-destructive dshbm-text-destructive-foreground hover:dshbm-opacity-90',
        subtle:
          'dshbm-bg-transparent dshbm-text-muted-foreground hover:dshbm-bg-secondary hover:dshbm-text-foreground',
      },
      size: {
        default: 'dshbm-h-8 dshbm-px-3',
        sm: 'dshbm-h-7 dshbm-px-2.5 dshbm-text-[11.5px]',
        xs: 'dshbm-h-7 dshbm-px-2 dshbm-text-[11.5px]',
        icon: 'dshbm-h-8 dshbm-w-8',
        iconSm: 'dshbm-h-7 dshbm-w-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
