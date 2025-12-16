import React, { useState, useRef, useEffect, memo } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconPicker } from '@/components/ui/icon-picker';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit } from 'lucide-react';
import type { OpnsenseGroupDisplay, CustomLucideIcon, CustomEmoji, CustomFlag } from '@/types/settings';
import type { NetworkGroup } from '@/types/opnsense';
import { NetworkGroupDescriptionDialog } from './NetworkGroupDescriptionDialog';

interface NetworkDisplayMappingsRowProps {
  group: NetworkGroup;
  initialMapping: OpnsenseGroupDisplay | undefined;
  onMappingChange: (updatedMapping: OpnsenseGroupDisplay) => void;
  onDeleteMapping: (uuid: string, groupName: string) => void;
  onRefreshData: () => void;
  customLucideIcons: CustomLucideIcon[];
  customEmojis: CustomEmoji[];
  customFlags: CustomFlag[];
}

const NetworkDisplayMappingsRow: React.FC<NetworkDisplayMappingsRowProps> = memo(({
  group,
  initialMapping,
  onMappingChange,
  onDeleteMapping,
  onRefreshData,
  customLucideIcons,
  customEmojis,
  customFlags,
}) => {
  const [currentMapping, setCurrentMapping] = useState<OpnsenseGroupDisplay>(() =>
    initialMapping || { id: String(Date.now()), opnsenseUuid: group.uuid, friendlyName: '', iconIdentifier: null, isGloballyDisabled: false }
  );
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State for the edit description dialog
  const [isEditDescriptionDialogOpen, setIsEditDescriptionDialogOpen] = useState(false);

  useEffect(() => {
    setCurrentMapping(initialMapping || { id: String(Date.now()), opnsenseUuid: group.uuid, friendlyName: '', iconIdentifier: null, isGloballyDisabled: false });
  }, [initialMapping, group.uuid]);

  const handleFriendlyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFriendlyName = e.target.value;
    setCurrentMapping(prev => ({ ...prev, friendlyName: newFriendlyName }));

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const updated = { ...currentMapping, friendlyName: newFriendlyName };
      if (newFriendlyName.trim() === '' && !updated.iconIdentifier && !updated.isGloballyDisabled) {
        onDeleteMapping(group.uuid, group.name);
      } else {
        onMappingChange(updated);
      }
    }, 300);
  };

  const handleIconChange = (newIcon: string | null) => {
    setCurrentMapping(prev => ({ ...prev, iconIdentifier: newIcon }));
    const updated = { ...currentMapping, iconIdentifier: newIcon };
    if (!updated.friendlyName && !newIcon && !updated.isGloballyDisabled) {
      onDeleteMapping(group.uuid, group.name);
    } else {
      onMappingChange(updated);
    }
  };

  const handleGloballyDisabledChange = (checked: boolean) => {
    setCurrentMapping(prev => ({ ...prev, isGloballyDisabled: checked }));
    const updated = { ...currentMapping, isGloballyDisabled: checked };
    if (!updated.friendlyName && !updated.iconIdentifier && !checked) {
      onDeleteMapping(group.uuid, group.name);
    } else {
      onMappingChange(updated);
    }
  };

  const handleDelete = () => {
    onDeleteMapping(group.uuid, group.name);
  };

  const handleOpenEditDescriptionDialog = () => {
    setIsEditDescriptionDialogOpen(true);
  };

  const handleCloseEditDescriptionDialog = () => {
    setIsEditDescriptionDialogOpen(false);
  };

  const handleEditDescriptionSaveSuccess = () => {
    onRefreshData();
  };

  const isDisabled = !group.enabled;

  return (
    <TableRow>
      <TableCell>
        <div className={`flex items-start justify-between ${isDisabled ? 'opacity-50' : ''}`}>
          <div className="flex-1 min-w-0">
            <div className={`font-medium ${isDisabled ? 'text-muted-foreground' : ''}`}>{group.name}</div>
            {group.description && (
              <div className="text-sm text-muted-foreground mt-1 break-words">
                {group.description}
              </div>
            )}
          </div>
          {!currentMapping.isGloballyDisabled && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleOpenEditDescriptionDialog}
                    className="h-6 w-6 hover:bg-transparent ml-2 flex-shrink-0"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edit group name and description</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="text"
          placeholder="Enter friendly name"
          value={currentMapping.friendlyName}
          onChange={handleFriendlyNameChange}
          className="w-full"
        />
      </TableCell>
      <TableCell>
        <IconPicker
          value={currentMapping.iconIdentifier}
          onChange={handleIconChange}
          additionalLucideIcons={customLucideIcons}
          additionalEmojis={customEmojis}
          additionalFlags={customFlags}
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={currentMapping.isGloballyDisabled}
          onCheckedChange={handleGloballyDisabledChange}
          aria-label="Globally Disable Group"
        />
      </TableCell>
      <TableCell className="text-right">
        {(currentMapping.friendlyName || currentMapping.iconIdentifier || currentMapping.isGloballyDisabled) && (
          <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
        )}
      </TableCell>
      
      {/* Edit Description Dialog */}
      <NetworkGroupDescriptionDialog
        isOpen={isEditDescriptionDialogOpen}
        onClose={handleCloseEditDescriptionDialog}
        editingGroup={group}
        onSaveSuccess={handleEditDescriptionSaveSuccess}
      />
    </TableRow>
  );
});

NetworkDisplayMappingsRow.displayName = 'NetworkDisplayMappingsRow';

export default NetworkDisplayMappingsRow;