'use client';

import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button'; // Import the shared Button component

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Import Card components
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea component
import { useSession } from 'next-auth/react'; // Import useSession
import Image from 'next/image';
import { logger } from '@/lib/logger';
import { Check, Copy } from 'lucide-react';

interface User2FAStatus {
  is2FAEnabled: boolean;
}

interface SetupData {
  secret: string;
  qrCodeDataURL: string;
}

interface VerifyResponse {
  success: boolean;
  message: string;
  backupCodes?: string[];
}

export default function TwoFactorAuthSettings() {
  const { data: session, status: sessionStatus } = useSession(); // Use useSession hook
  const [status, setStatus] = useState<User2FAStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false); // To display codes after successful setup
  const [backupCodesStatus, setBackupCodesStatus] = useState<{ hasBackupCodes: boolean; backupCodesCount: number; isLowOnCodes: boolean } | null>(null);
  const [isRegeneratingCodes, setIsRegeneratingCodes] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');

  // Fetch backup codes status
  const fetchBackupCodesStatus = useCallback(async () => {
    if (!session || !status?.is2FAEnabled) return;

    try {
      const response = await fetch('/api/auth/2fa/backup-codes');
      if (response.ok) {
        const data = await response.json();
        setBackupCodesStatus(data);
      }
    } catch (err) {
      logger.error('Failed to fetch backup codes status:', err);
    }
  }, [session, status?.is2FAEnabled]);

  // Fetch current 2FA status on component mount or when session status changes
  useEffect(() => {
    const fetchStatus = async () => {
      if (sessionStatus === 'loading') return; // Don't fetch if session is still loading
      if (!session) { // If no session, 2FA is not applicable
        setStatus({ is2FAEnabled: false });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setSetupData(null); // Clear previous setup state on refresh
      setShowBackupCodes(false); // Hide backup codes on refresh
      try {
        const response = await fetch('/api/auth/2fa-status'); // Use the correct API endpoint
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})); // Try to parse error
          throw new Error(errorData.error || `Failed to fetch status (${response.status})`);
        }
        const data: User2FAStatus = await response.json();
        setStatus(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load 2FA status.');
        setStatus({ is2FAEnabled: false }); // Assume disabled on error? Or show error state?
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, [session, sessionStatus]); // Re-run when session or sessionStatus changes

  // Fetch backup codes status when 2FA is enabled
  useEffect(() => {
    fetchBackupCodesStatus();
  }, [status?.is2FAEnabled, session, fetchBackupCodesStatus]);

  // Function to refresh status, e.g., after enabling/disabling
  // Note: Currently not used as state is updated manually in handlers,
  // but could be useful for a dedicated refresh button.
  // const refreshStatus = async () => {
  //     setIsLoading(true);
  //     setError(null);
  //     try {
  //       const response = await fetch('/api/auth/2fa-status');
  //       if (!response.ok) throw new Error('Failed to fetch status');
  //       const data: User2FAStatus = await response.json();
  //       setStatus(data);
  //     } catch (err: unknown) {
  //       setError(err instanceof Error ? err.message : 'Failed to load 2FA status.');
  //     } finally {
  //       setIsLoading(false);
  //     }
  // };


  const handleEnableClick = async () => {
    setIsLoading(true);
    setError(null);
    setSetupData(null);
    setBackupCodes(null);
    setShowBackupCodes(false);
    try {
      const response = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start 2FA setup.');
      }
      setSetupData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyClick = async () => {
    if (!setupData || !verificationCode) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode }),
      });
      const data: VerifyResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to verify code.');
      }
      // Success! 2FA is enabled.
      setStatus({ is2FAEnabled: true });
      setSetupData(null); // Clear setup data
      setVerificationCode('');
      setBackupCodes(data.backupCodes || []);
      setShowBackupCodes(true); // Show backup codes section
      // Optionally display success message: setError('2FA enabled successfully! Save your backup codes.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to verify code.');
      setVerificationCode(''); // Clear code on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableClick = async () => {
    // Optional: Add a confirmation dialog here
    setIsLoading(true);
    setError(null);
    setShowBackupCodes(false); // Hide backup codes if shown
    setBackupCodes(null);
    try {
      const response = await fetch('/api/auth/2fa/disable', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to disable 2FA.');
      }
      // Success! 2FA is disabled.
      setStatus({ is2FAEnabled: false });
      // Optionally display success message: setError('2FA disabled successfully.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCodes = async () => {
    if (backupCodes) {
      const { safeClipboardCopy } = await import('@/lib/clipboard-utils');
      const success = await safeClipboardCopy(backupCodes.join('\n'));
      if (success) {
        setCopySuccess('Copied!');
        setTimeout(() => setCopySuccess(''), 2000);
      } else {
        logger.error('Failed to copy backup codes');
        setError('Failed to copy codes to clipboard.');
      }
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setIsRegeneratingCodes(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/2fa/backup-codes', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate backup codes.');
      }
      setBackupCodes(data.backupCodes || []);
      setShowBackupCodes(true);
      // Clear any previous errors since regeneration was successful
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate backup codes.');
    } finally {
      setIsRegeneratingCodes(false);
    }
  };

  if (sessionStatus === 'loading' || (isLoading && !status)) { // Show loading if session is loading or initial status is loading
    return null; // Don't show anything while loading
  }

  if (!session) { // If no session, show a message or redirect (handled by page.tsx)
    return <div className="text-gray-600 dark:text-gray-400">Please sign in to manage 2FA settings.</div>;
  }

  if (error && !setupData && !showBackupCodes) { // Show general errors if not in setup/backup code view
    return <div className="text-red-600 dark:text-red-400">{error}</div>;
  }

  // Hide 2FA settings for OIDC authenticated users
  if (session?.user?.authMethod === 'oauth') {
    return null; // Or return a message indicating 2FA is not applicable for OIDC
  }

  return (
    // Added bg-gray-50 dark:bg-gray-800 shadow-sm to match other account sections
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Two-Factor Authentication (2FA)</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
        <ScrollArea className="flex-1 h-full w-full">
          <div className="space-y-6 p-6">

            {status?.is2FAEnabled ? (
              // --- 2FA Enabled View ---
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-green-600 dark:text-green-400">
                    Status: Enabled
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Your account is protected with two-factor authentication.
                  </p>
                </div>

                {/* Backup Codes Section */}
                <div className="space-y-3 p-4 border border-gray-200 rounded-lg dark:border-gray-600 bg-white dark:bg-gray-900">
                  <h4 className="font-medium text-gray-900 dark:text-white">Backup Codes</h4>

                  {showBackupCodes && backupCodes ? (
                    // Show newly generated backup codes
                    <div className="space-y-4">
                      <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                        <h5 className="font-medium text-orange-800 dark:text-orange-200 mb-2">Your New Backup Codes</h5>
                        <p className="text-sm text-orange-700 dark:text-orange-300 mb-3">
                          Save these backup codes in a secure location. Each code can only be used once.
                        </p>
                        <pre className="p-3 space-y-1 font-mono text-sm bg-white dark:bg-gray-800 rounded border">
                          {backupCodes.map((code: string, index: number) => (
                            <div key={index}>{code}</div>
                          ))}
                        </pre>
                        <div className="flex space-x-2 mt-3">
                          <Button onClick={handleCopyCodes} variant="outline" size="sm" className="min-w-[120px]">
                            {copySuccess === 'Copied!' ? (
                              <>
                                <Check className="mr-2 h-4 w-4" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="mr-2 h-4 w-4" />
                                Copy Codes
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={() => {
                              setShowBackupCodes(false);
                              fetchBackupCodesStatus(); // Refresh status after dismissing codes
                            }}
                            variant="default"
                            size="sm"
                          >
                            I&apos;ve Saved These Codes
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : backupCodesStatus ? (
                    // Show backup codes status and management
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        You have <span className="font-medium">{backupCodesStatus.backupCodesCount}</span> backup codes remaining.
                      </p>
                      {backupCodesStatus.isLowOnCodes && (
                        <p className="text-sm text-orange-600 dark:text-orange-400">
                          ⚠️ You&apos;re running low on backup codes. Consider regenerating them.
                        </p>
                      )}
                      <div className="flex space-x-2">
                        <Button
                          onClick={handleRegenerateBackupCodes}
                          disabled={isRegeneratingCodes}
                          variant="outline"
                          size="sm"
                        >
                          {isRegeneratingCodes ? 'Regenerating...' : 'Regenerate Codes'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading backup codes status...</p>
                  )}
                </div>

                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                <Button
                  onClick={handleDisableClick}
                  disabled={isLoading}
                  variant="destructive" // Use the destructive variant for disabling
                >
                  {isLoading ? 'Disabling...' : 'Disable 2FA'}
                </Button>
              </div>
            ) : setupData ? (
              // --- 2FA Setup View ---
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Scan the QR code below with your authenticator app (like Google Authenticator, Authy, etc.).
                </p>
                <div className="flex justify-center">
                  <Image
                    src={setupData.qrCodeDataURL}
                    alt="QR Code for 2FA Setup"
                    width={200}
                    height={200}
                    className="border dark:border-gray-600"
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Or manually enter this setup key:
                </p>
                <pre className="p-2 font-mono text-sm break-all bg-gray-100 rounded dark:bg-gray-700">
                  <code>{setupData.secret}</code>
                </pre>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  After scanning or entering the key, enter the 6-digit code generated by your app below to verify and enable 2FA.
                </p>
                <div>
                  <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Verification Code
                  </label>
                  <input
                    id="verificationCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={verificationCode}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVerificationCode(e.target.value)}
                    maxLength={6}
                    className="block w-full h-10 max-w-xs p-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="123456"
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <div className="flex space-x-3">
                  <Button
                    onClick={handleVerifyClick}
                    disabled={isLoading || verificationCode.length !== 6}
                    variant="default" // Use the default variant for verification
                  >
                    {isLoading ? 'Verifying...' : 'Verify & Enable'}
                  </Button>
                  <Button
                    onClick={() => { setSetupData(null); setError(null); }} // Cancel setup
                    disabled={isLoading}
                    variant="outline" // Use the outline variant for cancel
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : showBackupCodes ? (
              // --- Backup Codes View ---
              <div className="space-y-4">
                <h4 className="font-medium text-orange-600 dark:text-orange-400">Save Your Backup Codes!</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  If you lose access to your authenticator app, you can use these backup codes to sign in.
                  Store them securely. Each code can only be used once.
                </p>
                <pre className="p-4 space-y-1 font-mono text-sm bg-gray-100 rounded dark:bg-gray-800">
                  {backupCodes?.map((code: string, index: number) => (
                    <div key={index}>{code}</div>
                  ))}
                </pre>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <div className="flex space-x-3">
                  <Button onClick={handleCopyCodes} variant="outline" className="min-w-[120px]">
                    {copySuccess === 'Copied!' ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Codes
                      </>
                    )}
                  </Button> {/* Use outline variant */}
                  <Button onClick={() => setShowBackupCodes(false)} variant="default">Done</Button> {/* Use default variant */}
                </div>
              </div>
            ) : (
              // --- 2FA Disabled View (Initial) ---
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Add an extra layer of security to your account using an authenticator app.
                </p>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <Button
                  onClick={handleEnableClick}
                  disabled={isLoading}
                  variant="default" // Use the default variant for enabling
                >
                  {isLoading ? 'Loading...' : 'Enable 2FA'}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card >
  );
}