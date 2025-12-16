// src/app/auth/register/page.tsx
'use client'; // This is a client component

import React from 'react';
import Link from 'next/link';
import RegistrationForm from '@/components/RegistrationForm'; // Assuming @/components alias is set up
import { Loader2, ArrowLeft } from 'lucide-react'; // Import Loader2 icon
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InstradaOgmIcon } from '@/components/icons/InstradaOgmIcon';
import { useSecureUI } from '@/context/SecureUIContext';

export default function RegisterPage() {
  const { registrationEnabled, isLoading: isUIConfigLoading } = useSecureUI();

  // Use the optimized context data
  const enableRegistration = registrationEnabled;
  const isLoading = isUIConfigLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading registration settings...</p>
      </div>
    );
  }



  if (!enableRegistration) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center p-3 sm:p-4">
            <div className="flex justify-center mb-1 sm:mb-2">
              <InstradaOgmIcon width={72} height={72} src="/images/InstradaOGM-logo.svg" />
            </div>
            <CardTitle className="text-2xl font-bold">Registration Closed</CardTitle>
            <CardDescription>
              New user registration is currently disabled.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Please contact an administrator if you need an account.
            </p>
            <div className="pt-4">
              <Link href="/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background p-1 sm:p-2 lg:p-4">
      <div className="flex-grow flex items-center justify-center">
        <RegistrationForm />
      </div>
    </div>
  );
}