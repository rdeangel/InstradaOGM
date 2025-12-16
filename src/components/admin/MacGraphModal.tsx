'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { MacHistoryGraph } from './MacHistoryGraph';
import { Activity } from 'lucide-react';

interface MacIpHistoryEntry {
    id: string;
    ipAddress?: string;
    ipAddresses?: string[];
    firstSeen: Date;
    lastSeen: Date;
    isActive?: boolean;
    hostname?: string | null;
    hostAlias?: string | null;
    hostnames?: Array<{ ipAddress: string; hostname: string }>;
    hostAliases?: Array<{ ipAddress: string; alias: string }>;
}

interface MacGraphModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    history: MacIpHistoryEntry[];
    macAddress: string;
}

export function MacGraphModal({ open, onOpenChange, history, macAddress }: MacGraphModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Activity Graph: {macAddress}
                    </DialogTitle>
                    <DialogDescription>
                        Visual timeline of active and inactive periods.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4">
                    <MacHistoryGraph history={history} className="border-0 shadow-none" />
                </div>
            </DialogContent>
        </Dialog>
    );
}
