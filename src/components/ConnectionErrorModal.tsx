'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClientOnly } from '@/components/util/ClientOnly';
import { AlertCircle } from 'lucide-react';

interface ConnectionErrorModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConnectionErrorModal({ isOpen, onOpenChange }: ConnectionErrorModalProps) {
  return (
    <ClientOnly>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600 dark:text-red-400">
              <AlertCircle className="mr-2" /> OPNsense Connection Error
            </DialogTitle>
            <DialogDescription>
              Could not connect to the OPNsense API, contact your Administrator.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </ClientOnly>
  );
}