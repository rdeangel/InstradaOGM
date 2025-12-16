import { Metadata } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Role } from '@/types/opnsense';

// Force dynamic rendering since we use getServerSession
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'API Key Usage - Moved',
  description: 'API Key Usage has been moved to Monitoring & Analytics',
};

export default async function ApiKeyUsagePage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/auth/signin');
  }

  // Check if user has admin privileges
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.SUPER_ADMIN) {
    redirect('/dashboard');
  }

  // Redirect to the new location in monitoring analytics with the API key usage tab
  redirect('/admin/monitoring-analytics?tab=api-key-usage');
}
