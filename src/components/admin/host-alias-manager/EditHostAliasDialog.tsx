import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save } from 'lucide-react';
import type { OpnsenseAliasDetailFromExport } from '@/types/opnsense';
import type { HostAliasFormState } from './types';

interface EditHostAliasDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingAlias: OpnsenseAliasDetailFromExport | null;
  editAliasForm: HostAliasFormState;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement> | boolean, name?: string) => void;
  onUpdateAlias: () => Promise<void>;
  isProcessingAction: boolean;
  hasChanges: () => boolean;
}

export function EditHostAliasDialog({
  isOpen,
  onOpenChange,
  editingAlias,
  editAliasForm,
  onFormChange,
  onUpdateAlias,
  isProcessingAction,
  hasChanges,
}: EditHostAliasDialogProps) {
  if (!editingAlias) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Host Alias</DialogTitle>
          <DialogDescription>
            Modify the details of the host alias.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 pb-4">
          <div className="space-y-1">
            <Label htmlFor="edit-alias-name">Name</Label>
            <Input
              id="edit-alias-name"
              name="name"
              value={editAliasForm.name}
              onChange={onFormChange}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-alias-content">IP Address (Content)</Label>
            <Input
              id="edit-alias-content"
              name="content"
              value={editAliasForm.content}
              onChange={onFormChange}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-alias-description">Description</Label>
            <Input
              id="edit-alias-description"
              name="description"
              value={editAliasForm.description}
              onChange={onFormChange}
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="edit-alias-enabled" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Enable
            </Label>
            <Switch
              id="edit-alias-enabled"
              name="enabled"
              checked={editAliasForm.enabled}
              onCheckedChange={(checked) => onFormChange(checked as boolean, 'enabled')}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={onUpdateAlias} disabled={isProcessingAction || !hasChanges()}>
            {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}