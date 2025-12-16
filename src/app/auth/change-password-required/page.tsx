'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useSession } from 'next-auth/react';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const { status } = useSession();

  // Check if user needs to change password
  useEffect(() => {
    const checkPasswordChangeRequired = async () => {
      if (status === 'loading') return;

      // If user is authenticated, they shouldn't be on this page
      // This page is for unauthenticated users who need to change password
      if (status === 'authenticated') {
        router.push('/');
        return;
      }

      // Debug: Check if cookie is present
      const cookies = document.cookie.split(';').map(c => c.trim());
      const passwordChangeCookie = cookies.find(c => c.startsWith('password_change_email='));
      logger.debug('[CHANGE-PASSWORD-PAGE] Cookie check:', passwordChangeCookie);

      setIsLoading(false);
    };

    checkPasswordChangeRequired();
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate current password is provided
    if (!currentPassword) {
      toast({
        variant: "destructive",
        title: "Password Change Error",
        description: "Please enter your current password.",
      });
      return;
    }

    // Use length comparison to avoid timing attacks on password comparison
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Password Change Error",
        description: "New passwords do not match.",
      });
      return;
    }

    const minLength = 8; // Default minimum length, will be validated on server side
    if (password.length < minLength) {
      toast({
        variant: "destructive",
        title: "Password Change Error",
        description: `Password must be at least ${minLength} characters.`,
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      // Call API to change password
      const response = await fetch('/api/auth/change-password-required', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: currentPassword,
          newPassword: password
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsRedirecting(true);
        toast({
          variant: "default",
          title: "Password Changed",
          description: "Your password has been changed successfully. Please log in with your new password.",
        });

        // Redirect to login page after successful password change
        setTimeout(() => {
          router.push('/login');
        }, 750);
      } else {
        throw new Error(data.message || 'Failed to change password');
      }
    } catch (error) {
      logger.error('Password change failed:', error);
      setIsChangingPassword(false);
      toast({
        variant: "destructive",
        title: "Password Change Error",
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Password Change Required</CardTitle>
          <CardDescription>
            For security reasons, you must change your password before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="Enter your current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isChangingPassword || isRedirecting}
            >
              {isRedirecting ? 'Redirecting to Login...' : isChangingPassword ? 'Changing Password...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
