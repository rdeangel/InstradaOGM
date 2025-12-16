'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types/opnsense';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, X, ExternalLink, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { logger } from '@/lib/logger';
import { formatVersionForDisplay } from '@/lib/version-utils';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  error?: string;
}

/**
 * UpdateNotification Component
 * 
 * Displays a notification banner when a new version is available.
 * Only visible to SUPER_ADMIN users.
 * 
 * Features:
 * - Auto-checks for updates on mount
 * - Dismissible (stores dismissal in localStorage)
 * - Shows version info and link to release notes
 * - Manual refresh capability
 */
export function UpdateNotification() {
  const { data: session } = useAuth();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Only show to SUPER_ADMIN
  const isSuperAdmin = session?.user?.role === Role.SUPER_ADMIN;

  // Check localStorage for dismissal
  useEffect(() => {
    if (!isSuperAdmin) return;

    const dismissedVersion = localStorage.getItem('update-notification-dismissed');
    if (dismissedVersion) {
      setIsDismissed(true);
    }
  }, [isSuperAdmin]);

  // Fetch update info
  const checkForUpdates = useCallback(async () => {
    if (!isSuperAdmin) return;

    setIsLoading(true);
    try {
      // Trigger a manual check (this will call GitHub API)
      const response = await fetch('/api/updates/check');
      const data = await response.json();

      if (data.success && data.data) {
        setUpdateInfo(data.data);

        // Check if this version was previously dismissed
        const dismissedVersion = localStorage.getItem('update-notification-dismissed');
        if (dismissedVersion === data.data.latestVersion) {
          setIsDismissed(true);
        } else {
          setIsDismissed(false);
        }

        logger.debug('Update check result:', data.data);
      } else {
        logger.warn('Failed to check for updates:', data.message);
      }
    } catch (error) {
      logger.error('Error checking for updates:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isSuperAdmin]);

  // Auto-check on mount - use cached status to avoid GitHub API call
  useEffect(() => {
    const fetchCachedStatus = async () => {
      if (!isSuperAdmin || isDismissed) return;

      try {
        // Use the status endpoint which returns cached results
        const response = await fetch('/api/updates/status');
        const data = await response.json();

        if (data.success && data.data) {
          setUpdateInfo(data.data);

          // Check if this version was previously dismissed
          const dismissedVersion = localStorage.getItem('update-notification-dismissed');
          if (dismissedVersion === data.data.latestVersion) {
            setIsDismissed(true);
          } else {
            setIsDismissed(false);
          }

          logger.debug('Update status (cached):', data.data);
        }
      } catch (error) {
        logger.error('Error fetching update status:', error);
      }
    };

    if (isSuperAdmin && !isDismissed) {
      fetchCachedStatus();
    }
  }, [isSuperAdmin, isDismissed]);

  // Show notification with animation after data loads
  useEffect(() => {
    if (updateInfo?.updateAvailable && !isDismissed) {
      // Small delay for smooth appearance
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [updateInfo, isDismissed]);

  // Handle dismiss
  const handleDismiss = () => {
    if (updateInfo?.latestVersion) {
      localStorage.setItem('update-notification-dismissed', updateInfo.latestVersion);
      setIsDismissed(true);
      setIsVisible(false);
    }
  };

  // Don't render if not super admin or no update available or dismissed
  if (!isSuperAdmin || !updateInfo?.updateAvailable || isDismissed) {
    return null;
  }

  // Extract first 3 lines of release notes for preview
  const getChangelogPreview = (notes?: string) => {
    if (!notes) return null;
    const lines = notes.split('\n').filter(line => line.trim());
    return lines.slice(0, 3).join('\n');
  };

  const hasChangelog = updateInfo.releaseNotes && updateInfo.releaseNotes.trim().length > 0;
  const changelogPreview = getChangelogPreview(updateInfo.releaseNotes);

  return (
    <div
      className={`transition-all duration-300 ease-in-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
        }`}
    >
      <Alert className="mb-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
        <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertTitle className="flex items-center justify-between">
          <span className="text-blue-900 dark:text-blue-100">
            Update Available: {formatVersionForDisplay(updateInfo.latestVersion)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mr-2"
            onClick={handleDismiss}
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </Button>
        </AlertTitle>
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <div className="flex flex-col gap-3">
            <p>
              A new version is available (current: v{updateInfo.currentVersion}).
            </p>

            {/* Changelog Preview/Full Display */}
            {hasChangelog && (
              <div className="border-l-2 border-blue-400 pl-3 py-1">
                <div className="prose prose-sm dark:prose-invert max-w-none prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-2 prose-h1:mt-4 prose-h1:pb-2 prose-h1:border-b-2 prose-h1:border-blue-300 dark:prose-h1:border-blue-700 prose-hr:my-6 prose-hr:border-t-2 prose-hr:border-blue-200 dark:prose-hr:border-blue-800 prose-headings:text-blue-900 dark:prose-headings:text-blue-100 prose-p:text-blue-800 dark:prose-p:text-blue-200 prose-li:text-blue-800 dark:prose-li:text-blue-200 prose-strong:text-blue-900 dark:prose-strong:text-blue-100 prose-ul:list-disc prose-ul:ml-6 prose-li:ml-0 prose-li:pl-2">
                  <ReactMarkdown
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      ul: ({ ...props }) => <ul style={{ listStyleType: 'disc', marginLeft: '1.5rem', paddingLeft: '0.5rem' }} {...props} />,
                      li: ({ ...props }) => <li style={{ display: 'list-item' }} {...props} />
                    }}
                  >
                    {isExpanded ? updateInfo.releaseNotes : changelogPreview || ''}
                  </ReactMarkdown>
                </div>
                {updateInfo.releaseNotes && updateInfo.releaseNotes.split('\n').filter(l => l.trim()).length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-auto py-1 px-2 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-950"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Show More
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              {updateInfo.releaseUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-600 text-blue-600 hover:bg-blue-100 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950"
                  onClick={() => window.open(updateInfo.releaseUrl, '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View on GitHub
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-950"
                onClick={checkForUpdates}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

