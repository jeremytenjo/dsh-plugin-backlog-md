import * as React from 'react';

import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input, Label } from './ui/input';

export function BacklogConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy = false,
  destructive = false,
  requireText,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  requireText?: string;
  error?: string | null;
  onConfirm: () => void;
}) {
  const [value, setValue] = React.useState('');
  React.useEffect(() => {
    if (open) setValue('');
  }, [open]);
  const blocked = Boolean(requireText) && value.trim() !== requireText;
  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <DialogContent aria-describedby="backlog-confirm-description">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="backlog-confirm-description">{description}</DialogDescription>
        </DialogHeader>
        {requireText ? (
          <div className="dshbm-mb-3 dshbm-flex dshbm-flex-col dshbm-gap-1">
            <Label htmlFor="backlog-confirm-input">
              Type <code className="dshbm-font-mono">{requireText}</code> to confirm
            </Label>
            <Input
              id="backlog-confirm-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          </div>
        ) : null}
        {error ? (
          <p className="dshbm-m-0 dshbm-rounded-md dshbm-bg-destructive/10 dshbm-px-2 dshbm-py-1.5 dshbm-text-2xs dshbm-text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={busy || blocked}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
