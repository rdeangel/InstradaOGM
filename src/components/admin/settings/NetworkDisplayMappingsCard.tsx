import React, { useState, useRef, useEffect, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconPicker } from '@/components/ui/icon-picker';
import { Switch } from '@/components/ui/switch';
import { useGroupType } from '@/context/GroupTypeContext'; // Import Switch component
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit } from 'lucide-react';
import type { OpnsenseGroupDisplay, CustomLucideIcon, CustomEmoji, CustomFlag } from '@/types/settings';
import type { NetworkGroup } from '@/types/opnsense';
import { NetworkGroupDescriptionDialog } from './NetworkGroupDescriptionDialog';

interface NetworkDisplayMappingsCardProps {
  group: NetworkGroup;
  initialMapping: OpnsenseGroupDisplay | undefined;
  onMappingChange: (updatedMapping: OpnsenseGroupDisplay) => void;

  onRefreshData: () => void;
  customLucideIcons: CustomLucideIcon[];
  customEmojis: CustomEmoji[];
  customFlags: CustomFlag[];
  onValidationCheck?: (uuid: string, networkGroup: NetworkGroup) => Promise<boolean>;
}

const NetworkDisplayMappingsCard: React.FC<NetworkDisplayMappingsCardProps> = memo(({
  group,
  initialMapping,
  onMappingChange,

  onRefreshData,
  customLucideIcons,
  customEmojis,
  customFlags,
  onValidationCheck,
}) => {
  const { enableGroupTypes, singleSelectName, multiSelectName } = useGroupType();
  const [currentMapping, setCurrentMapping] = useState<OpnsenseGroupDisplay>(() =>
    initialMapping || { id: String(Date.now()), opnsenseUuid: group.uuid, friendlyName: '', iconIdentifier: null, isGloballyDisabled: false, groupType: 'SingleSelect' }
  );
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State for the edit description dialog
  const [isEditDescriptionDialogOpen, setIsEditDescriptionDialogOpen] = useState(false);

  useEffect(() => {
    setCurrentMapping(initialMapping || { id: String(Date.now()), opnsenseUuid: group.uuid, friendlyName: '', iconIdentifier: null, isGloballyDisabled: false, groupType: 'SingleSelect' });
  }, [initialMapping, group.uuid]);

  const handleFriendlyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFriendlyName = e.target.value;
    setCurrentMapping(prev => ({ ...prev, friendlyName: newFriendlyName }));

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const updated = { ...currentMapping, friendlyName: newFriendlyName };
      onMappingChange(updated);
    }, 100); // Reduced to 100ms for even better responsiveness
  };

  const handleIconChange = (newIcon: string | null) => {
    setCurrentMapping(prev => ({ ...prev, iconIdentifier: newIcon }));
    const updated = { ...currentMapping, iconIdentifier: newIcon };
    onMappingChange(updated);
  };

  const handleGloballyDisabledChange = async (checked: boolean) => {
    // If trying to enable (checked = true), check for host aliases first
    if (checked && onValidationCheck) {
      const canToggle = await onValidationCheck(group.uuid, group);
      if (!canToggle) {
        return; // Don't proceed with toggle if validation failed
      }
    }

    setCurrentMapping(prev => ({ ...prev, isGloballyDisabled: checked }));
    const updated = { ...currentMapping, isGloballyDisabled: checked };
    onMappingChange(updated);
  };

  const handleGroupTypeChange = (groupType: 'SingleSelect' | 'MultiSelect') => {
    setCurrentMapping(prev => ({ ...prev, groupType }));
    const updated = { ...currentMapping, groupType };
    onMappingChange(updated);
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
    <Card key={`mapping-card-${group.uuid}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className={`text-base ${isDisabled ? 'text-muted-foreground' : ''}`}>{group.name}</CardTitle>
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

      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <label htmlFor={`mapped-name-${group.uuid}`} className="block text-sm font-medium text-muted-foreground mb-1">User-Friendly Name</label>
          <Input
            id={`mapped-name-${group.uuid}`}
            type="text"
            placeholder="Enter friendly name"
            value={currentMapping.friendlyName}
            onChange={handleFriendlyNameChange}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor={`mapped-icon-${group.uuid}`} className="block text-sm font-medium text-muted-foreground mb-1">Icon</label>
          <IconPicker
            value={currentMapping.iconIdentifier}
            onChange={handleIconChange}
            additionalLucideIcons={customLucideIcons}
            additionalEmojis={customEmojis}
            additionalFlags={customFlags}
          />
        </div>
        {enableGroupTypes && (
          <div>
            <label htmlFor={`group-type-${group.uuid}`} className="block text-sm font-medium text-muted-foreground mb-1">Group Type</label>
            <select
              id={`group-type-${group.uuid}`}
              value={currentMapping.groupType || 'SingleSelect'}
              onChange={(e) => handleGroupTypeChange(e.target.value as 'SingleSelect' | 'MultiSelect')}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
            >
              <option value="SingleSelect">{singleSelectName}</option>
              <option value="MultiSelect">{multiSelectName}</option>
            </select>
          </div>
        )}
        <div className="flex items-center justify-between space-x-2">
          <label htmlFor={`globally-disabled-${group.uuid}`} className="text-sm font-medium text-muted-foreground">Globally Disabled</label>
          <Switch
            id={`globally-disabled-${group.uuid}`}
            checked={currentMapping.isGloballyDisabled}
            onCheckedChange={handleGloballyDisabledChange}
            aria-label="Globally Disable Group"
          />
        </div>

      </CardContent>
      
      {/* Edit Description Dialog */}
      <NetworkGroupDescriptionDialog
        isOpen={isEditDescriptionDialogOpen}
        onClose={handleCloseEditDescriptionDialog}
        editingGroup={group}
        onSaveSuccess={handleEditDescriptionSaveSuccess}
      />
    </Card>
  );
});

NetworkDisplayMappingsCard.displayName = 'NetworkDisplayMappingsCard';

export default NetworkDisplayMappingsCard;