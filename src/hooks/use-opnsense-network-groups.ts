'use client';

import { useState, useEffect } from 'react';
import type { NetworkGroup } from '@/types/opnsense';

interface UseOpnsenseNetworkGroupsResult {
  groups: NetworkGroup[];
  isLoading: boolean;
  error: string | null;
}

export function useOpnsenseNetworkGroups(): UseOpnsenseNetworkGroupsResult {
  const [groups, setGroups] = useState<NetworkGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch('/api/opnsense/network-groups')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch network groups');
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          const list = Array.isArray(data) ? data : (Array.isArray(data?.networkGroups) ? data.networkGroups : []);
          setGroups(list);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch network groups');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { groups, isLoading, error };
}
