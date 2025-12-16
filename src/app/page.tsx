import SelfServiceGuard from '@/components/SelfServiceGuard';
import SelfServicePageClient from '@/components/SelfServicePageClient';

// Force dynamic rendering to ensure SSR runs in Docker containers
export const dynamic = 'force-dynamic';

/**
 * Server component that wraps the self-service page with server-side protection.
 * This matches the working implementation before client-side guards were added.
 */
export default function OpnSenseManagerPage() {
  return (
    <SelfServiceGuard>
      <SelfServicePageClient />
    </SelfServiceGuard>
  );
}
