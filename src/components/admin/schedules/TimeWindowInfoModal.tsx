'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useOpnsenseNetworkGroups } from '@/hooks/use-opnsense-network-groups';
import { Clock, CheckCircle2, ShieldOff, Trash2, Loader2, ArrowRight, Settings } from 'lucide-react';
import type { TimeWindowFormData } from './BoundaryActionEditor';

interface TimeWindowInfoModalProps {
    open: boolean;
    dayName: string;
    window: TimeWindowFormData;
    onClose: () => void;
    onEdit: () => void;
}

export function TimeWindowInfoModal({
    open,
    dayName,
    window,
    onClose,
    onEdit,
}: TimeWindowInfoModalProps) {
    const { groups, isLoading } = useOpnsenseNetworkGroups();

    if (!window) return null;

    const startActions = window.actions
        .filter(a => a.boundaryType === 'START')
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const endActions = window.actions
        .filter(a => a.boundaryType === 'END')
        .sort((a, b) => a.sortOrder - b.sortOrder);

    function getGroupName(uuid?: string) {
        if (!uuid) return 'Unknown Group';
        const group = groups.find(g => g.uuid === uuid);
        return group ? group.name : 'Unknown Group';
    }

    function renderActionIcon(operation: string) {
        switch (operation) {
            case 'ASSIGN':
                return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
            case 'UNASSIGN':
                return <ShieldOff className="h-4 w-4 text-amber-500" />;
            case 'CLEAR_ALL':
                return <Trash2 className="h-4 w-4 text-destructive" />;
            default:
                return <Settings className="h-4 w-4 text-muted-foreground" />;
        }
    }

    function renderOperationText(operation: string) {
        if (operation === 'CLEAR_ALL') return 'Clear All Groups';
        return operation === 'ASSIGN' ? 'Assign to' : 'Unassign from';
    }

    return (
        <Dialog open={open} onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-w-md w-full sm:max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="shrink-0 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" />
                        <span>Time Window Details</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                            {/* Header Box */}
                            <div className="bg-muted/50 p-4 rounded-lg border flex flex-col gap-2">
                                <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                                    {dayName}
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl font-semibold tracking-tight">{window.startTime}</div>
                                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                    <div className="text-2xl font-semibold tracking-tight">{window.endTime}</div>
                                </div>
                                {window.label && (
                                    <div className="mt-2 text-sm text-muted-foreground italic border-t pt-2 max-w-[90%] truncate">
                                        &quot;{window.label}&quot;
                                    </div>
                                )}
                            </div>

                            {/* Start Actions */}
                            <div>
                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">At Start</span>
                                    <span className="text-muted-foreground font-normal">({window.startTime})</span>
                                </h4>
                                {startActions.length > 0 ? (
                                    <div className="space-y-2">
                                        {startActions.map((action, i) => (
                                            <div key={i} className="flex items-center gap-3 bg-background border p-2.5 rounded-md shadow-sm">
                                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                                    {renderActionIcon(action.operation)}
                                                </div>
                                                <div className="flex items-baseline gap-1.5 text-sm truncate">
                                                    <span className="font-medium text-foreground">{renderOperationText(action.operation)}</span>
                                                    {action.operation !== 'CLEAR_ALL' && (
                                                        <span className="font-semibold text-primary truncate max-w-[200px]">
                                                            {getGroupName(action.targetGroupUuid)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground italic bg-muted/20 border border-dashed rounded-md p-3 text-center">
                                        No actions defined at start.
                                    </div>
                                )}
                            </div>

                            {/* End Actions */}
                            <div>
                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full text-xs">At End</span>
                                    <span className="text-muted-foreground font-normal">({window.endTime})</span>
                                </h4>
                                {endActions.length > 0 ? (
                                    <div className="space-y-2">
                                        {endActions.map((action, i) => (
                                            <div key={i} className="flex items-center gap-3 bg-background border p-2.5 rounded-md shadow-sm">
                                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                                    {renderActionIcon(action.operation)}
                                                </div>
                                                <div className="flex items-baseline gap-1.5 text-sm truncate">
                                                    <span className="font-medium text-foreground">{renderOperationText(action.operation)}</span>
                                                    {action.operation !== 'CLEAR_ALL' && (
                                                        <span className="font-semibold text-primary truncate max-w-[200px]">
                                                            {getGroupName(action.targetGroupUuid)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground italic bg-muted/20 border border-dashed rounded-md p-3 text-center">
                                        No actions defined at end.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t mt-2">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={() => {
                        onClose();
                        onEdit();
                    }}>
                        <Settings className="h-4 w-4 mr-2" />
                        Edit Window
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
