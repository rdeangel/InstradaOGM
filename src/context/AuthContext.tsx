'use client';

import { useSession } from 'next-auth/react';
// Removed unused import AppUserType
import { Role } from '@/types/opnsense'; // Keep the application specific Role enum
import type { Session } from 'next-auth'; // Import NextAuth Session type

// Define a type for the session user that includes our custom properties
interface CustomSessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: Role; // Include the custom role
  authMethod?: string;
  externalGroups?: string[];
}

// Extend the NextAuth Session type to include our custom user type
interface CustomSession extends Session {
  user?: CustomSessionUser;
}

// Define the return type for our useAuth hook
interface UseAuthReturn {
  data: CustomSession | null;
  status: 'authenticated' | 'unauthenticated' | 'loading';
  // Add other properties from useSession if needed, e.g., update
  // update: (data?: any) => Promise<Session | null>;
}

// This hook now simply wraps useSession from next-auth/react
export function useAuth(): UseAuthReturn {
  const { data, status } = useSession() as { data: CustomSession | null, status: 'authenticated' | 'unauthenticated' | 'loading' };
  return { data, status };
}

// The AuthProvider is no longer needed as SessionProvider is used in layout.tsx
// export function AuthProvider({ children }: { children: ReactNode }) {
//   // ... mock logic removed ...
// }
