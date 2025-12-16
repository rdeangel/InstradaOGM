import { Suspense } from 'react';
import { ClientOnly } from '@/components/util/ClientOnly';
import SSOLoadingClient from '@/components/sso/SSOLoadingClient';

export default function SSOLoadingPage() {
  return (
    <Suspense fallback={<div>Loading SSO...</div>}>
      <ClientOnly>
        <SSOLoadingClient />
      </ClientOnly>
    </Suspense>
  );
}