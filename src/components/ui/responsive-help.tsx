'use client';

import { useState, useEffect, useRef } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface ResponsiveHelpProps {
    title: string;
    children: React.ReactNode;
    triggerClassName?: string;
    iconClassName?: string;
    disableTooltip?: boolean; // New prop to disable tooltip entirely
}

/**
 * ResponsiveHelp Component
 * 
 * A mobile-friendly help component that:
 * - Shows a Dialog/Modal on mobile devices (click/tap to open)
 * - Shows a Tooltip on desktop devices (hover to see)
 * - Uses the same content for both formats
 * 
 * Usage:
 * ```tsx
 * <ResponsiveHelp title="Search Help">
 *   <div>Your help content here</div>
 * </ResponsiveHelp>
 * ```
 * 
 * The component uses a responsive approach:
 * - Mobile (< md breakpoint): Dialog is visible, Tooltip is hidden
 * - Desktop (>= md breakpoint): Tooltip is visible, Dialog is hidden
 */
export function ResponsiveHelp({
    title,
    children,
    triggerClassName = '',
    iconClassName = 'h-4 w-4 text-muted-foreground',
    disableTooltip = false,
}: ResponsiveHelpProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [tooltipEnabled, setTooltipEnabled] = useState(false);
    const hasInteracted = useRef(false);

    // Only enable tooltip after user has interacted with the page (unless disabled)
    useEffect(() => {
        if (disableTooltip) {
            setTooltipEnabled(true);
            return;
        }

        const enableTooltip = () => {
            if (!hasInteracted.current) {
                hasInteracted.current = true;
                setTooltipEnabled(true);
            }
        };

        // Enable tooltip after first user interaction (mouse move, key press, or scroll)
        const events = ['mousemove', 'keydown', 'scroll'];
        events.forEach(event => {
            document.addEventListener(event, enableTooltip, { once: true });
        });

        // Fallback: enable after 2 seconds if no interaction
        const fallbackTimer = setTimeout(() => {
            enableTooltip();
        }, 2000);

        return () => {
            events.forEach(event => {
                document.removeEventListener(event, enableTooltip);
            });
            clearTimeout(fallbackTimer);
        };
    }, [disableTooltip]);

    return (
        <>
            {/* Mobile: Dialog (visible on small screens) */}
            <div className="md:hidden">
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`shrink-0 ${triggerClassName}`}
                        >
                            <HelpCircle className={iconClassName} />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>{title}</DialogTitle>
                            <DialogDescription>
                                Help and guidance for using this feature.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="mt-2">{children}</div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Desktop: Tooltip (visible on medium+ screens) */}
            <div className="hidden md:block">
                {!disableTooltip ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`shrink-0 ${triggerClassName}`}
                                    >
                                        <HelpCircle className={iconClassName} />
                                    </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-md p-4">
                                {tooltipEnabled ? children : <div>Loading help...</div>}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`shrink-0 ${triggerClassName}`}
                        onClick={() => setDialogOpen(true)}
                    >
                        <HelpCircle className={iconClassName} />
                    </Button>
                )}
            </div>
        </>
    );
}

