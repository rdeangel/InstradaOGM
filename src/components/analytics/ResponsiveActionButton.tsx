"use client";

import { Button, ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ResponsiveActionButtonProps extends ButtonProps {
  icon: React.ReactNode;
  label: string;
}

export function ResponsiveActionButton({ icon, label, className, ...props }: ResponsiveActionButtonProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn("w-10 h-10", className)}
              aria-label={label}
              {...props}
            >
              {icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button variant="outline" size="sm" className={cn("flex items-center gap-2", className)} {...props}>
      {icon}
      {label}
    </Button>
  );
}