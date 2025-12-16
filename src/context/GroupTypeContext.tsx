'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useSecureUI } from '@/context/SecureUIContext';

interface GroupTypeSettings {
  enableGroupTypes: boolean;
  enableSelfServiceMultiSelect: boolean;
  singleSelectName: string;
  multiSelectName: string;
  singleSelectIcon: string;
  multiSelectIcon: string;
}

interface GroupTypeContextType extends GroupTypeSettings {
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
}

const GroupTypeContext = createContext<GroupTypeContextType | undefined>(undefined);

interface GroupTypeProviderProps {
  children: ReactNode;
}

export function GroupTypeProvider({ children }: GroupTypeProviderProps) {
  // Use the secure context as the primary and only source
  const secureUI = useSecureUI();

  // Map secure context to group type settings
  const settings: GroupTypeSettings = {
    enableGroupTypes: secureUI.groupTypesEnabled,
    enableSelfServiceMultiSelect: secureUI.selfServiceMultiSelectEnabled,
    singleSelectName: secureUI.groupTypeConfig.singleSelectLabel,
    multiSelectName: secureUI.groupTypeConfig.multiSelectLabel,
    singleSelectIcon: secureUI.groupTypeConfig.singleSelectIcon,
    multiSelectIcon: secureUI.groupTypeConfig.multiSelectIcon,
  };

  // Use secure context data directly - no fallback needed
  const contextValue: GroupTypeContextType = {
    ...settings,
    isLoading: secureUI.isLoading,
    refreshSettings: secureUI.refreshConfig,
  };

  return (
    <GroupTypeContext.Provider value={contextValue}>
      {children}
    </GroupTypeContext.Provider>
  );
}

export function useGroupType(): GroupTypeContextType {
  const context = useContext(GroupTypeContext);
  if (context === undefined) {
    throw new Error('useGroupType must be used within a GroupTypeProvider');
  }
  return context;
}
