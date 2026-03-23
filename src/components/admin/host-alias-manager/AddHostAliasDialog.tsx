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
import type { HostAliasFormState } from './types';
interface AddHostAliasDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newAliasForm: HostAliasFormState;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement> | boolean, name?: string) => void;
  onCreateAlias: () => Promise<void>;
  isProcessingAction: boolean;
}

export function AddHostAliasDialog({
  isOpen,
  onOpenChange,
  newAliasForm,
  onFormChange,
  onCreateAlias,
  isProcessingAction,
}: AddHostAliasDialogProps) {
  const isValid = () => {
    return (
      newAliasForm.name.trim() !== '' &&
      newAliasForm.content.trim() !== ''
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Host Alias</DialogTitle>
          <DialogDescription>
            Enter the details for the new host alias. This will create a new &apos;host&apos; type alias in OPNsense.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 pb-4">
          <div className="space-y-1">
            <Label htmlFor="new-alias-name">Name</Label>
            <Input
              id="new-alias-name"
              name="name"
              value={newAliasForm.name}
              onChange={onFormChange}
              placeholder="e.g., My Host Alias"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-alias-content">IP Address (Content)</Label>
            <Input
              id="new-alias-content"
              name="content"
              value={newAliasForm.content}
              onChange={onFormChange}
              placeholder="e.g., 192.168.1.1"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-alias-description">Description</Label>
            <Input
              id="new-alias-description"
              name="description"
              value={newAliasForm.description}
              onChange={onFormChange}
              placeholder="Optional description"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="new-alias-enabled" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Enable
            </Label>
            <Switch
              id="new-alias-enabled"
              name="enabled"
              checked={newAliasForm.enabled}
              onCheckedChange={(checked) => onFormChange(checked as boolean, 'enabled')}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={onCreateAlias} disabled={isProcessingAction || !isValid()}>
            {isProcessingAction ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Create Alias
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}