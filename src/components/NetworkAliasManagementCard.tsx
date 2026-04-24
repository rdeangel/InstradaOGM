'use client';

import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Waypoints, RefreshCcw, Loader2, Search, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClientOnly } from '@/components/util/ClientOnly';
import { logger } from '@/lib/logger';
import type { NetworkAlias } from '@/types/opnsense';

export interface NetworkAliasManagementCardHandles {
  refreshNetworkAliases: () => Promise<void>;
}

interface NetworkAliasManagementCardProps {
  selectedAlias: NetworkAlias | null;
  onSelectAlias: (alias: NetworkAlias | null) => void;
}

const NetworkAliasManagementCard = forwardRef<NetworkAliasManagementCardHandles, NetworkAliasManagementCardProps>(({
  selectedAlias,
  onSelectAlias,
}, ref) => {
  const [aliases, setAliases] = useState<NetworkAlias[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchAliases = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else { setIsLoading(true); setError(null); }
    try {
      const resp = await fetch('/api/user/network-aliases', { cache: 'no-store' });
      if (!resp.ok) {
        if (resp.status === 403) { setError('Network alias management is disabled.'); return; }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data: NetworkAlias[] = await resp.json();
      setAliases(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      logger.error('[NetworkAliasManagementCard] fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    refreshNetworkAliases: () => fetchAliases(true),
  }), [fetchAliases]);

  useEffect(() => { fetchAliases(); }, [fetchAliases]);

  const filtered = aliases.filter(a => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q) ||
      (a.description && a.description.toLowerCase().includes(q))
    );
  });

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClientOnly><Waypoints className="h-5 w-5 text-primary" /></ClientOnly>
              Network Aliases
            </CardTitle>
            <CardDescription className="text-sm mt-1">
              Select a network alias to manage its group assignments.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchAliases(true)}
            disabled={isLoading || isRefreshing}
          >
            <ClientOnly>
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            </ClientOnly>
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search aliases..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}
          </div>
        ) : error ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            {searchTerm ? 'No aliases match your search.' : 'No network aliases found.'}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-1 p-2">
              {filtered.map(alias => (
                <button
                  key={alias.uuid}
                  onClick={() => onSelectAlias(selectedAlias?.uuid === alias.uuid ? null : alias)}
                  className={cn(
                    'w-full text-left rounded-md border p-3 transition-colors hover:bg-accent',
                    selectedAlias?.uuid === alias.uuid && 'border-primary bg-accent/50',
                    alias.enabled === '0' && 'opacity-50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{alias.name}</span>
                    <Badge variant={alias.enabled === '1' ? 'default' : 'secondary'} className="text-xs shrink-0">
                      {alias.enabled === '1' ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-1 truncate">
                    {alias.content || 'No content'}
                  </div>
                  {alias.memberOfGroups && alias.memberOfGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {alias.memberOfGroups.slice(0, 3).map(g => (
                        <Badge key={g.uuid} variant="outline" className="text-[10px] px-1.5 py-0">
                          {g.name}
                        </Badge>
                      ))}
                      {alias.memberOfGroups.length > 3 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          +{alias.memberOfGroups.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
});

NetworkAliasManagementCard.displayName = 'NetworkAliasManagementCard';

export default NetworkAliasManagementCard;
