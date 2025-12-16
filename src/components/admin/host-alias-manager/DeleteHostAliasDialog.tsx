import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Loader2, Trash2 } from 'lucide-react';
import type { OpnsenseAliasDetailFromExport } from '@/types/opnsense';

interface DeleteHostAliasDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  aliasToDelete: OpnsenseAliasDetailFromExport | null;
  onConfirmDelete: () => Promise<void>;
  isProcessingAction: boolean;
  onCancelDelete: () => void;
}

export function DeleteHostAliasDialog({
  isOpen,
  onOpenChange,
  aliasToDelete,
  onConfirmDelete,
  isProcessingAction,
  onCancelDelete,
}: DeleteHostAliasDialogProps) {
  if (!aliasToDelete) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete this host alias?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the host alias
            <span className="font-semibold"> {aliasToDelete.name}</span> ({aliasToDelete.content}).
            If this alias is used in any network groups or firewall rules, those references will become invalid.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancelDelete}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmDelete} disabled={isProcessingAction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete Alias
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}