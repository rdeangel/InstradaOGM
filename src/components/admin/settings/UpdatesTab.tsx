'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, ExternalLink, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';
import { formatVersionForDisplay } from '@/lib/version-utils';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { ScrollArea } from '@/components/ui/scroll-area';

interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  versionsSkipped?: number;
  error?: string;
  errorType?: 'not_found' | 'network' | 'unknown';
  message?: string;
}

export function UpdatesTab() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isAutoUpdateEnabled, setIsAutoUpdateEnabled] = useState<boolean>(true);

  const checkForUpdates = async () => {
    setIsLoading(true);
    try {
      // Trigger a manual check (this will call GitHub API)
      const response = await fetch('/api/updates/check');
      const data = await response.json();

      if (data.success && data.data) {
        setUpdateInfo(data.data);
        setLastChecked(new Date());
        logger.debug('Update check result:', data.data);
      } else {
        logger.warn('Failed to check for updates:', data.message);
        setUpdateInfo({
          updateAvailable: false,
          currentVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
          latestVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
          error: data.message || 'Failed to check for updates',
        });
      }
    } catch (error) {
      logger.error('Error checking for updates:', error);
      setUpdateInfo({
        updateAvailable: false,
        currentVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
        latestVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
        error: 'Network error - unable to check for updates',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load cached status on mount (doesn't trigger GitHub API call)
  useEffect(() => {
    const fetchCachedStatus = async () => {
      try {
        // Use the status endpoint which returns cached results
        const response = await fetch('/api/updates/status');
        const data = await response.json();

        if (data.success && data.data) {
          setUpdateInfo(data.data);
          if (data.data.lastChecked) {
            setLastChecked(new Date(data.data.lastChecked));
          }
          // Check if auto-update is enabled (from environment variable)
          if (data.data.autoUpdateEnabled !== undefined) {
            setIsAutoUpdateEnabled(data.data.autoUpdateEnabled);
          }
          logger.debug('Update status (cached):', data.data);
        }
      } catch (error) {
        logger.error('Error fetching update status:', error);
      }
    };

    fetchCachedStatus();
  }, []);

  return (
    <Card className="flex flex-col flex-1 mb-0 min-h-0">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center justify-between text-xl md:text-2xl">
            Application Updates
          </CardTitle>
          <CardDescription>
            Check for new versions of InstradaOGM
          </CardDescription>
        </div>
        <Button
          onClick={checkForUpdates}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="w-full md:w-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Check for Updates
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 p-2 md:p-6 pb-8 md:pb-6 relative flex flex-col flex-1 overflow-hidden">
        <ScrollArea className="flex-1 min-h-0 w-full">
          <div className="space-y-6">
            {/* Current Version */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Current Version</p>
                <p className="text-2xl font-bold">
                  {updateInfo?.currentVersion ? formatVersionForDisplay(updateInfo.currentVersion) : '...'}
                </p>
              </div>
              {lastChecked && (
                <p className="text-xs text-muted-foreground">
                  Last checked: {lastChecked.toLocaleString()}
                </p>
              )}
            </div>

            {/* Auto-Update Disabled Badge - show if disabled AND (no update info OR has the disabled message) */}
            {!isAutoUpdateEnabled && (!updateInfo || updateInfo.message?.includes('disabled')) && (
              <Alert className="border-gray-400 bg-gray-50 dark:bg-gray-900/20">
                <AlertCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <AlertTitle className="text-gray-900 dark:text-gray-100">
                  Automatic Update Checks Disabled
                </AlertTitle>
                <AlertDescription className="text-gray-800 dark:text-gray-200">
                  <p className="mb-2">
                    Automatic update checking is currently disabled via the AUTO_UPDATE_CHECK environment variable.
                  </p>
                  <p className="text-sm">
                    No automatic checks will be performed at startup or every 6 hours. You can still manually check for updates using the button above.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Update Status - don't show if it's the disabled message */}
            {updateInfo && !updateInfo.error && !updateInfo.message?.includes('disabled') && (
              <>
                {updateInfo.updateAvailable ? (
                  <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/20">
                    <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <AlertTitle className="text-blue-900 dark:text-blue-100">
                      Update Available: {formatVersionForDisplay(updateInfo.latestVersion)}
                    </AlertTitle>
                    <AlertDescription className="text-blue-800 dark:text-blue-200">
                      <p className="mb-4">
                        A new version is available!
                        {updateInfo.versionsSkipped !== undefined && updateInfo.versionsSkipped > 0 && (
                          <span className="font-semibold">
                            {' '}You are {updateInfo.versionsSkipped + 1} release{updateInfo.versionsSkipped + 1 > 1 ? 's' : ''} behind.
                          </span>
                        )}
                      </p>

                      {updateInfo.releaseNotes && (
                        <div className="border-l-2 border-blue-400 pl-4 py-2 mb-4 max-h-96 overflow-y-auto">
                          <div className="prose prose-base dark:prose-invert max-w-none prose-h1:text-5xl prose-h1:font-bold prose-h1:mb-3 prose-h1:mt-8 prose-h1:pb-3 prose-h1:border-b-2 prose-h1:border-blue-300 dark:prose-h1:border-blue-700 prose-hr:my-8 prose-hr:border-t-2 prose-hr:border-blue-200 dark:prose-hr:border-blue-800 prose-ul:list-disc prose-ul:ml-6 prose-li:ml-0 prose-li:pl-2">
                            <ReactMarkdown
                              rehypePlugins={[rehypeRaw]}
                              components={{
                                ul: ({ ...props }) => <ul style={{ listStyleType: 'disc', marginLeft: '1.5rem', paddingLeft: '0.5rem' }} {...props} />,
                                li: ({ ...props }) => <li style={{ display: 'list-item' }} {...props} />
                              }}
                            >
                              {updateInfo.releaseNotes}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {updateInfo.releaseUrl && (
                        <Button
                          variant="default"
                          onClick={() => window.open(updateInfo.releaseUrl, '_blank')}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Release on GitHub
                        </Button>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertTitle className="text-green-900 dark:text-green-100">
                      You&apos;re up to date!
                    </AlertTitle>
                    <AlertDescription className="text-green-800 dark:text-green-200">
                      You have the latest version of InstradaOGM.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {/* Error State */}
            {updateInfo?.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                  {updateInfo.errorType === 'not_found'
                    ? 'Repository Not Found'
                    : 'Unable to Check for Updates'}
                </AlertTitle>
                <AlertDescription>
                  <p className="mb-2">{updateInfo.error}</p>

                  {updateInfo.errorType === 'not_found' && (
                    <div className="text-sm mt-2">
                      <p className="font-medium mb-1">Possible reasons:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>The GitHub repository does not exist or is private</li>
                        <li>No releases have been published to the repository yet</li>
                        <li>The repository name or owner is incorrect</li>
                      </ul>
                    </div>
                  )}

                  {updateInfo.errorType === 'network' && (
                    <div className="text-sm mt-2">
                      <p className="font-medium mb-1">Possible reasons:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>The server cannot reach the internet</li>
                        <li>GitHub API (api.github.com) is unreachable</li>
                        <li>Network firewall is blocking the connection</li>
                        <li>Request timed out after 10 seconds</li>
                      </ul>
                    </div>
                  )}

                  {updateInfo.errorType === 'unknown' && (
                    <div className="text-sm mt-2">
                      <p>Please check the server logs for more details.</p>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

