'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClientOnly } from '@/components/util/ClientOnly';
import { AlertCircle as AlertCircleIcon } from 'lucide-react';
import type { User } from '@prisma/client';

// Define a type for the props the component will accept
interface GroupMembershipTooltipProps {
  user: User & {
    authMethod?: string;
    directGroups?: { id: string; name: string; description: string | null; }[];
    mappedGroups?: { id: string; name: string; description: string | null; }[];
    ssoProvider?: string;
  };
  oidcProviders: { id: string; name: string }[]; // Add oidcProviders prop
}

export default function GroupMembershipTooltip({ user, oidcProviders }: GroupMembershipTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center">
            <ClientOnly><AlertCircleIcon className="h-4 w-4 ml-2" /></ClientOnly>
            <div className="ml-1">Group membership</div>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-semibold mb-1 text-center">Group Memberships</p>
          {user.authMethod === 'oauth' && (
            <p className="text-xs text-muted-foreground mb-2">Only mapped Local groups are shown here.</p>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="font-medium">Direct Local Groups:</p>
              {user.directGroups?.length === 0 ? (
                <p>- None -</p>
              ) : (
                user.directGroups?.map(group => (
                  <span key={group.id} className="mr-1">{group.name}</span>
                ))
              )}
            </div>
            <div>
              <p className="font-medium">
                {user.authMethod === 'Local'
                  ? 'Not managed by SSO'
                  : `Mapped SSO Groups (${oidcProviders.find(p => p.id === user.ssoProvider)?.name || user.ssoProvider || 'Unknown Provider'})`}
              </p>
              {user.authMethod !== 'Local' && (
                user.mappedGroups?.length === 0 ? (
                  <p>- None -</p>
                ) : (
                  Array.from(new Set(user.mappedGroups?.map(group => group.id))).map(groupId => {
                    const group = user.mappedGroups?.find(g => g.id === groupId);
                    return group ? (
                      <span key={group.id} className="mr-1">{group.name}</span>
                    ) : null;
                  })
                )
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}