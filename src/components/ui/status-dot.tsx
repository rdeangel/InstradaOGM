'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from status configuration. All uses are safe.
import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Info } from 'lucide-react';

export type StatusDotColor = 'green' | 'red' | 'grey' | 'outline';

interface StatusDotProps {
  color: StatusDotColor;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

interface StatusDotWithTooltipProps extends StatusDotProps {
  tooltip?: string | React.ReactNode;
}

interface StatusDotLegendProps {
  className?: string;
}

const sizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4'
};

const colorClasses = {
  green: 'bg-green-500',
  red: 'bg-red-500',
  grey: 'bg-gray-400',
  outline: 'border-2 border-gray-400 dark:border-gray-500 bg-transparent'
};

export function StatusDot({ color, className, size = 'md' }: StatusDotProps) {
  return (
    <div
      className={cn(
        'rounded-full flex-shrink-0',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
    />
  );
}

export function StatusDotWithTooltip({ color, tooltip, className, size = 'md' }: StatusDotWithTooltipProps) {
  if (!tooltip) {
    return <StatusDot color={color} className={className} size={size} />;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">
            <StatusDot color={color} className={className} size={size} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {typeof tooltip === 'string' ? <p>{tooltip}</p> : tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function StatusDotLegend({ className }: StatusDotLegendProps) {
  const [showDialog, setShowDialog] = React.useState(false);

  return (
    <>
      <Info
        className={cn("h-4 w-4 text-muted-foreground cursor-pointer", className)}
        onClick={() => setShowDialog(true)}
      />
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Status Indicators</DialogTitle>
            <DialogDescription>
              Explanation of the different status indicators used throughout the application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StatusDot color="green" size="sm" />
              <span className="text-sm">Active (ARP active)</span>
            </div>
            <div className="flex items-center gap-3">
              <StatusDot color="red" size="sm" />
              <span className="text-sm">Inactive (no ARP detected)</span>
            </div>
            <div className="flex items-center gap-3">
              <StatusDot color="grey" size="sm" />
              <span className="text-sm">Disabled</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helper function to determine status dot color based on host alias state
export function getHostAliasStatusColor(
  isEnabled: boolean,
  hasArpEntry: boolean
): StatusDotColor {
  // Grey if disabled
  if (!isEnabled) {
    return 'grey';
  }

  // Green if ARP active (online device)
  if (hasArpEntry) {
    return 'green';
  }

  // Red if no ARP entry (offline)
  return 'red';
}
