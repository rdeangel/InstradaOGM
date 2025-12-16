'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NetworkGroup } from '@/types/opnsense';

interface NetworkGroupDescriptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingGroup: NetworkGroup | null;
  onSaveSuccess: () => void;
}

export function NetworkGroupDescriptionDialog({
  isOpen,
  onClose,
  editingGroup,
  onSaveSuccess,
}: NetworkGroupDescriptionDialogProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [originalName, setOriginalName] = useState('');
  const [originalDescription, setOriginalDescription] = useState('');
  const [originalEnabled, setOriginalEnabled] = useState(true);

  // Reset form when dialog opens/closes or editingGroup changes
  useEffect(() => {
    if (isOpen && editingGroup) {
      setName(editingGroup.name || '');
      setDescription(editingGroup.description || '');
      setEnabled(editingGroup.enabled);
      setOriginalName(editingGroup.name || '');
      setOriginalDescription(editingGroup.description || '');
      setOriginalEnabled(editingGroup.enabled);
    } else {
      setName('');
      setDescription('');
      setEnabled(true);
      setOriginalName('');
      setOriginalDescription('');
      setOriginalEnabled(true);
    }
  }, [isOpen, editingGroup]);

  const hasChanges = () => {
    return (
      name !== originalName ||
      description !== originalDescription ||
      enabled !== originalEnabled
    );
  };

  const handleSave = async () => {
    if (!editingGroup) return;

    setIsProcessing(true);
    try {
      // Update name, description, and enabled status in OPNsense (if changed)
      if (name !== editingGroup.name || description !== editingGroup.description || enabled !== editingGroup.enabled) {
        const aliasPayload = {
          alias: {
            name: name.trim(),
            type: editingGroup.type || 'networkgroup',
            content: editingGroup.rawContent || '',
            description: description.trim(),
            enabled: enabled ? '1' : '0',
            proto: editingGroup.proto || '',
            interface: editingGroup.interface || '',
            counters: editingGroup.counters || '',
            updatefreq: editingGroup.updatefreq || '',
            categories: editingGroup.categories || '',
          }
        };

        const aliasResponse = await fetch(`/api/opnsense/aliases/${editingGroup.uuid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(aliasPayload),
        });

        if (!aliasResponse.ok) {
          const errorData = await aliasResponse.json();
          throw new Error(errorData.message || 'Failed to update group in OPNsense');
        }
      }

      toast({
        title: "Success",
        description: "Network group updated successfully.",
        variant: "success",
      });

      onSaveSuccess();
      onClose();
    } catch (error) {
      logger.error('Error updating network group description:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Network Group</DialogTitle>
          <DialogDescription>
            Update the name and description for this network group.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">OPNsense Group Name</Label>
            <Input
              id="name"
              placeholder="Enter the OPNsense group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isProcessing}
            />
          </div>

          <div>
            <Label htmlFor="description" className="pb-2">Description</Label>
            <Textarea
              id="description"
              placeholder="Enter a description for this network group"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isProcessing}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This description will be updated in OPNsense.
            </p>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="enabled" className="text-sm font-medium">Enable Group</Label>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={isProcessing}
              aria-label="Enable or disable this network group"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isProcessing || !hasChanges()}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 