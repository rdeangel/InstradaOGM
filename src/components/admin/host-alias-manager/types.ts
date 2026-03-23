export interface HostAliasFormState {
  name: string;
  content: string;
  description: string;
  enabled: boolean;
}

export interface DuplicateAliasEntry {
  uuid: string;
  name: string;
  content: string;
  description?: string;
  enabled?: string | null;
  memberOfGroups?: { uuid: string; name: string; friendlyName?: string }[];
  hasHiddenGroups?: boolean;
}

export interface DuplicateResult {
  type: 'ip' | 'name';
  value: string;
  aliases: DuplicateAliasEntry[];
}