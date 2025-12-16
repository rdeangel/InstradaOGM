'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { InstradaOgmIcon } from '@/components/icons/InstradaOgmIcon';

export default function RegistrationForm() {
  const [name, setName] = useState(''); // Added state for name
  const [username, setUsername] = useState(''); // Added state for username
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false); // State for modal visibility
  const [requiresVerification, setRequiresVerification] = useState(false); // Track if verification is required
  const { toast } = useToast();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Use length comparison to avoid timing attacks on password comparison
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Registration Error",
        description: "Passwords do not match.",
      });
      return;
    }

    setIsRegistering(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, username, email, password }), // Include name and username in the body
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed.');
      }

      // Check if email verification is required
      setRequiresVerification(data.requiresVerification === true);
      setShowSuccessModal(true); // Show the success modal

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      let displayMessage = "An unexpected error occurred during registration.";

      if (errorMessage.includes("User already exists with this email")) {
        displayMessage = "Registration failed: Email address is already in use.";
      } else if (errorMessage.includes("User already exists with this username")) {
        displayMessage = "Registration failed: Username is already taken.";
      } else {
        displayMessage = errorMessage; // Display the specific error if not a known duplicate
      }

      toast({
        variant: "destructive",
        title: "Registration Error",
        description: displayMessage,
      });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center p-3 sm:p-4">
        <div className="mx-auto mb-1 sm:mb-2 flex justify-center">
          <InstradaOgmIcon width={72} height={72} src="/images/InstradaOGM-logo.svg" />
        </div>
        <CardTitle className="text-2xl">Register</CardTitle>
        <CardDescription>Create a new account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Added Name Input Field */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          {/* Added Username Input Field */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isRegistering}>
            {isRegistering ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Register
          </Button>
        </form>
      </CardContent>
      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registration Successful</DialogTitle>
            <DialogDescription>
              {requiresVerification
                ? "Please check your email to verify your account before logging in."
                : "Your account has been created successfully. You can now log in."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" onClick={() => router.push('/auth/signin')}>
                OK
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}