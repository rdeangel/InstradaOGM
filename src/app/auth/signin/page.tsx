'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import dynamic from 'next/dynamic';

// Dynamically import the component with ssr: false
const SignInPageContent = dynamic(() => Promise.resolve(function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showVerificationSuccessModal, setShowVerificationSuccessModal] = useState(false);

  useEffect(() => {
    const verified = searchParams.get('verified');

    if (verified === 'true') {
      setShowVerificationSuccessModal(true);
    } else {
      // Redirect to the main login page if not verified
      router.push('/login');
    }
  }, [router, searchParams]);

  const handleModalClose = () => {
    setShowVerificationSuccessModal(false);
    router.push('/login');
  };

  // Optionally, render a loading state or a message before redirecting
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 bg-gray-50 dark:bg-gray-900">
      <p>Redirecting to login page...</p>

      {/* Email Verification Success Modal */}
      <Dialog open={showVerificationSuccessModal} onOpenChange={setShowVerificationSuccessModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Verification Successful</DialogTitle>
            <DialogDescription>
              Your email has been successfully verified. Proceed to Login.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" onClick={handleModalClose}>
                OK
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}), { ssr: false });

export default function SignInPage() {
  return <SignInPageContent />;
}