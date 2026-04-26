'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getClipboardErrorDescription } from '@/lib/clipboard-utils';

interface CidrListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cidrs: string[];
  title?: string;
}

export function CidrListDialog({ open, onOpenChange, cidrs, title = 'CIDR Addresses' }: CidrListDialogProps) {
  const [search, setSearch] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const { toast } = useToast();

  const filtered = useMemo(() => {
    if (!search.trim()) return cidrs;
    const q = search.toLowerCase();
    return cidrs.filter(c => c.toLowerCase().includes(q));
  }, [cidrs, search]);

  const copyText = useCallback(async (text: string, index?: number) => {
    let success = false;

    // Method 1: Modern Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        // Fall through
      }
    }

    // Method 2: Override clipboard via copy event (works inside focus-trapped dialogs)
    if (!success) {
      try {
        const handler = (e: ClipboardEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const dt = e.clipboardData;
          if (dt) {
            dt.setData('text/plain', text);
            dt.setData('text/html', text);
          }
        };
        document.addEventListener('copy', handler, true);
        document.execCommand('copy');
        document.removeEventListener('copy', handler, true);
        success = true;
      } catch {
        success = false;
      }
    }

    if (success) {
      toast({ title: 'Copied!', description: index !== undefined ? text : 'All CIDRs copied to clipboard', variant: 'success' });
      if (index !== undefined) {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 1500);
      } else {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 1500);
      }
    } else {
      toast({ title: 'Copy Failed', description: getClipboardErrorDescription(), variant: 'destructive' });
    }
  }, [toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search CIDRs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => copyText(cidrs.join('\n'))}
            title="Copy all CIDRs"
          >
            {copiedAll ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No matching CIDRs.</p>
            ) : (
              filtered.map((cidr, i) => (
                <div
                  key={i}
                  className="font-mono text-sm px-2 py-1.5 rounded bg-muted flex items-center justify-between group"
                >
                  <span>{cidr}</span>
                  <button
                    onClick={() => copyText(cidr, i)}
                    className="p-1 rounded hover:bg-muted-foreground/20"
                    title="Copy"
                  >
                    {copiedIndex === i
                      ? <Check className="h-3.5 w-3.5 text-green-500" />
                      : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <p className="text-xs text-muted-foreground text-center">
          {filtered.length === cidrs.length
            ? `${cidrs.length} CIDR${cidrs.length !== 1 ? 's' : ''}`
            : `${filtered.length} of ${cidrs.length} CIDRs`}
        </p>
      </DialogContent>
    </Dialog>
  );
}
