'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface RefreshRequiredDialogProps {
  isOpen: boolean;
  onRefresh: () => void;
  title?: string;
  description?: string;
}

export function RefreshRequiredDialog({
  isOpen,
  onRefresh,
  title = "Page Refresh Required",
  description = "The changes you made require a full page refresh to take effect. This will update the menu and refresh all components."
}: RefreshRequiredDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}} modal>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onRefresh} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
