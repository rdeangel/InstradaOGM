'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Group } from '@prisma/client';
import { Loader2 } from 'lucide-react'; // Import icons

import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';

interface SsoGroupMembersDialogProps {
  group: Group | null;
  isOpen: boolean;
  onClose: () => void;
}

interface SsoUserForDisplay {
  id: string;
  email: string;
  name?: string;
  username?: string; // Add username
  isSso: boolean;
}

export default function SsoGroupMembersDialog({ group, isOpen, onClose }: SsoGroupMembersDialogProps) {
  const [ssoMembers, setSsoMembers] = useState<SsoUserForDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null); // New state for error message

  const fetchSsoMembers = useCallback(async () => {
    if (!group) {
      setSsoMembers([]);
      setIsLoading(false);
      setError(null); // Clear error if group is null
      return;
    }

    setIsLoading(true);
    setError(null); // Clear previous errors
    try {
      const response = await fetch(`/api/admin/groups/${group.id}/sso-members`);
      const data: SsoUserForDisplay[] = await response.json();
      if (response.ok && Array.isArray(data)) {
        setSsoMembers(data);
      } else {
        const errorMsg = data && (data as { message?: string }).message || 'Failed to fetch SSO members.';
        logger.error('Failed to fetch SSO members:', data);
        setSsoMembers([]);
        setError(errorMsg);
      }
    } catch (error: unknown) {
      logger.error('Error fetching SSO members:', error);
      setSsoMembers([]);
      setError(error instanceof Error ? error.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [group]);

  useEffect(() => {
    if (isOpen) {
      fetchSsoMembers();
    } else {
      setSsoMembers([]); // Clear members when dialog closes
      setSearchTerm(''); // Clear search term
      setError(null); // Clear error when dialog closes
    }
  }, [isOpen, fetchSsoMembers]);

  const filteredSsoMembers = ssoMembers.filter(member =>
    member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (member.name && member.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (member.username && member.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SSO Members for {group?.name}</DialogTitle>
          <DialogDescription>
            View existing SSO members who have access to this group. These memberships are managed via your SSO provider.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-[150px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center text-destructive py-4">
              <p>Error: {error}</p>
              <p>Could not load SSO members.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                placeholder="Search SSO members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="border rounded-md p-2 h-[200px] overflow-y-auto">
                {filteredSsoMembers.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center">No SSO members found for this group.</p>
                ) : (
                    <ul>
                      {filteredSsoMembers.map(member => (
                        <li
                          key={member.id}
                          className="flex flex-col py-1 px-2 text-sm rounded-sm hover:bg-gray-100 dark:hover:bg-gray-800 cursor-default"
                        >
                          <span className="font-medium">{member.name || member.email}</span>
                          {member.username && <span className="text-muted-foreground">Username: {member.username}</span>}
                          <span className="text-muted-foreground">Email: {member.email}</span>
                          <Badge variant="outline" className="ml-auto w-fit">SSO</Badge>
                        </li>
                      ))}
                    </ul>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}