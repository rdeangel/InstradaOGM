import { logger } from './logger';

/**
 * GitHub repository configuration
 */
const GITHUB_REPO_OWNER = 'rdeangel';
const GITHUB_REPO_NAME = 'InstradaOGM';
const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Cache for GitHub release data to avoid rate limiting
 */
interface ReleaseCache {
  data: GitHubRelease | null;
  timestamp: number;
}

let releaseCache: ReleaseCache = {
  data: null,
  timestamp: 0,
};

// Cache duration: 1 hour (in milliseconds)
const CACHE_DURATION = 60 * 60 * 1000;

/**
 * Custom error classes for better error handling
 */
class GitHubNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubNotFoundError';
  }
}

class GitHubNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubNetworkError';
  }
}

/**
 * GitHub Release API response type
 */
export interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  body: string;
  prerelease: boolean;
  draft: boolean;
}

/**
 * Update check result
 */
export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  versionsSkipped?: number; // Number of versions between current and latest (0 if only 1 version behind)
  error?: string;
  errorType?: 'not_found' | 'network' | 'unknown'; // Type of error for better messaging
}

/**
 * Format version for display (always adds "v" prefix)
 * @param version - Version string with or without "v" prefix
 * @returns Formatted version with "v" prefix (e.g., "v1.0.0")
 */
export function formatVersionForDisplay(version: string): string {
  const clean = version.replace(/^v/, '');
  return `v${clean}`;
}

/**
 * Compare two semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  // Remove 'v' prefix if present
  const clean1 = v1.replace(/^v/, '');
  const clean2 = v2.replace(/^v/, '');

  const parts1 = clean1.split('.').map(Number);
  const parts2 = clean2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    // eslint-disable-next-line security/detect-object-injection
    const num1 = parts1[i] || 0;
    // eslint-disable-next-line security/detect-object-injection
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}



/**
 * Increment a version by patch number
 */
function incrementVersion(version: string, incrementBy: number): string {
  const cleanVersion = version.replace(/^v/, '');
  const parts = cleanVersion.split('.');

  const major = parseInt(parts[0] || '1', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10);

  return `v${major}.${minor}.${patch + incrementBy}`;
}


/**
 * Fetch all releases from GitHub API
 */
export async function fetchAllReleases(): Promise<GitHubRelease[]> {
  // Development/Testing Mode: Return mock data if enabled
  if (process.env.MOCK_UPDATE_AVAILABLE === 'true') {
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
    logger.debug('Mock mode enabled - generating simulated releases based on current version:', currentVersion);

    // Generate mock versions: current + 1 and current + 2
    const version1 = incrementVersion(currentVersion, 1);
    const version2 = incrementVersion(currentVersion, 2);

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const mockReleases: GitHubRelease[] = [
      {
        tag_name: version2,
        name: `InstradaOGM ${version2}`,
        html_url: `https://github.com/rdeangel/InstradaOGM/releases/tag/${version2}`,
        published_at: now.toISOString(),
        body: `## What's New in ${version2}\n\n### ✨ New Features\n\n- feat: Add advanced user analytics dashboard\n- feat: Implement real-time notification system\n- feat: Add export to CSV functionality for all reports\n\n### 🐛 Bug Fixes\n\n- fix: Resolve memory leak in background sync\n- fix: Correct timezone handling in date pickers\n\n### 🚀 Improvements\n\n- improve: Enhanced search performance by 50%\n- improve: Optimized database queries for large datasets\n\n### 📚 Documentation\n\n- docs: Add comprehensive API documentation\n- docs: Update installation guide with Docker support`,
        prerelease: false,
        draft: false,
      },
      {
        tag_name: version1,
        name: `InstradaOGM ${version1}`,
        html_url: `https://github.com/rdeangel/InstradaOGM/releases/tag/${version1}`,
        published_at: oneDayAgo.toISOString(),
        body: `## What's New in ${version1}\n\n### ✨ New Features\n\n- feat: Add dark mode support\n- feat: Implement two-factor authentication\n\n### 🐛 Bug Fixes\n\n- fix: Authentication token refresh issue\n- fix: UI rendering on mobile devices\n- fix: File upload size validation\n\n### 🚀 Improvements\n\n- improve: Faster page load times\n- improve: Better error messages\n\n### 📝 Chore\n\n- chore: Update dependencies to latest versions\n- chore: Improve code quality with ESLint rules`,
        prerelease: false,
        draft: false,
      },
      {
        tag_name: `v${currentVersion.replace(/^v/, '')}`,
        name: `InstradaOGM v${currentVersion.replace(/^v/, '')}`,
        html_url: `https://github.com/rdeangel/InstradaOGM/releases/tag/v${currentVersion.replace(/^v/, '')}`,
        published_at: twoDaysAgo.toISOString(),
        body: `## What's New in v${currentVersion.replace(/^v/, '')}\n\n### ✨ New Features\n\n- feat: Current version features\n\n### 🐛 Bug Fixes\n\n- fix: Various bug fixes`,
        prerelease: false,
        draft: false,
      },
    ];

    return mockReleases;
  }

  try {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`;
    logger.debug(`Fetching all releases from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'InstradaOGM-Update-Checker',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('No releases found on GitHub');
        return [];
      }
      if (response.status === 403) {
        logger.warn('GitHub API rate limit exceeded (403) - returning empty releases list');
        return [];
      }
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
    }

    const releases: GitHubRelease[] = await response.json();
    logger.debug(`Fetched ${releases.length} releases from GitHub`);
    return releases.filter(r => !r.draft && !r.prerelease);
  } catch (error) {
    logger.error('Failed to fetch releases from GitHub:', error);
    return [];
  }
}

/**
 * Fetch latest release from GitHub API
 * @param currentVersion - Optional current version for mock mode
 * @param forceRefresh - If true, bypass cache and fetch fresh data
 */
export async function fetchLatestRelease(currentVersion?: string, forceRefresh = false): Promise<GitHubRelease | null> {
  // Development/Testing Mode: Return mock data if enabled
  // ⚠️ WARNING: This should only be enabled in development/testing environments
  // Set MOCK_UPDATE_AVAILABLE=true in .env to enable mock mode
  if (process.env.MOCK_UPDATE_AVAILABLE === 'true') {
    // Log warning in production
    if (process.env.NODE_ENV === 'production') {
      logger.warn('⚠️ MOCK_UPDATE_AVAILABLE is enabled in production! This should only be used for testing.');
    }

    const actualCurrentVersion = currentVersion || process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
    const mockVersion = incrementVersion(actualCurrentVersion, 2); // Match fetchAllReleases (current + 2)

    logger.debug(`Mock mode enabled - returning simulated update: ${mockVersion} (from ${actualCurrentVersion})`);
    const mockRelease: GitHubRelease = {
      tag_name: mockVersion,
      name: `InstradaOGM ${mockVersion}`,
      html_url: `https://github.com/rdeangel/InstradaOGM/releases/tag/${mockVersion}`,
      published_at: new Date().toISOString(),
      body: `## What's New in ${mockVersion}\n\n### ✨ New Features\n\n- feat: Add advanced user analytics dashboard\n- feat: Implement real-time notification system\n- feat: Add export to CSV functionality for all reports\n\n### 🐛 Bug Fixes\n\n- fix: Resolve memory leak in background sync\n- fix: Correct timezone handling in date pickers\n\n### 🚀 Improvements\n\n- improve: Enhanced search performance by 50%\n- improve: Optimized database queries for large datasets\n\n### 📚 Documentation\n\n- docs: Add comprehensive API documentation\n- docs: Update installation guide with Docker support`,
      prerelease: false,
      draft: false,
    };
    return mockRelease;
  }

  // Check cache first (unless force refresh is requested)
  const now = Date.now();
  if (!forceRefresh && releaseCache.data && (now - releaseCache.timestamp) < CACHE_DURATION) {
    logger.debug('Using cached GitHub release data');
    return releaseCache.data;
  }

  if (forceRefresh) {
    logger.debug('Force refresh requested - bypassing cache');
  }

  try {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
    logger.debug(`Fetching latest release from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'InstradaOGM-Update-Checker',
      },
      // Add timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('GitHub repository or releases not found (404)');
        throw new GitHubNotFoundError('GitHub repository not found or no releases have been published');
      }
      if (response.status === 403) {
        logger.warn('GitHub API rate limit exceeded (403)');
        // If we have cached data, return it even if expired rather than failing
        if (releaseCache.data) {
          logger.info('Returning stale cache due to rate limit');
          return releaseCache.data;
        }
        throw new GitHubNetworkError('GitHub API rate limit exceeded. Please try again later.');
      }
      throw new GitHubNetworkError(`GitHub API returned ${response.status}: ${response.statusText}`);
    }

    const release: GitHubRelease = await response.json();

    // Update cache
    releaseCache = {
      data: release,
      timestamp: now,
    };

    logger.debug(`Latest release fetched: ${release.tag_name}`);
    return release;
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof GitHubNotFoundError || error instanceof GitHubNetworkError) {
      throw error;
    }

    // Network/timeout errors
    logger.error('Failed to fetch latest release from GitHub:', error);
    throw new GitHubNetworkError('Unable to connect to GitHub API. Please check your internet connection.');
  }
}

/**
 * Get all releases between current version and latest version
 */
export async function getReleasesBetween(currentVersion: string, latestVersion: string): Promise<GitHubRelease[]> {
  const allReleases = await fetchAllReleases();

  if (allReleases.length === 0) {
    return [];
  }

  // Filter releases that are newer than current version and up to latest version
  const releasesBetween = allReleases.filter(release => {
    const releaseVersion = release.tag_name.replace(/^v/, '');
    const isNewer = compareVersions(releaseVersion, currentVersion) > 0;
    const isNotBeyondLatest = compareVersions(releaseVersion, latestVersion) <= 0;
    return isNewer && isNotBeyondLatest;
  });

  // Sort by version (newest first)
  releasesBetween.sort((a, b) => {
    const versionA = a.tag_name.replace(/^v/, '');
    const versionB = b.tag_name.replace(/^v/, '');
    return compareVersions(versionB, versionA);
  });

  return releasesBetween;
}

/**
 * Check for available updates
 * @param currentVersion - Current version to compare against
 * @param forceRefresh - If true, bypass cache and fetch fresh data from GitHub
 */
export async function checkForUpdates(currentVersion: string, forceRefresh = false): Promise<UpdateCheckResult> {
  try {
    const latestRelease = await fetchLatestRelease(currentVersion, forceRefresh);

    if (!latestRelease) {
      return {
        updateAvailable: false,
        currentVersion: currentVersion.replace(/^v/, ''),
        latestVersion: currentVersion.replace(/^v/, ''),
        error: 'Could not fetch latest release info.',
        errorType: 'unknown',
      };
    }

    const latestVersion = latestRelease.tag_name.replace(/^v/, '');
    const cleanCurrentVersion = currentVersion.replace(/^v/, '');
    const comparison = compareVersions(latestVersion, cleanCurrentVersion);

    logger.debug(`Version comparison: latest=${latestVersion}, current=${cleanCurrentVersion}, comparison=${comparison}`);

    const updateAvailable = comparison > 0;

    // If update is available, get all releases between current and latest
    let allReleaseNotes = latestRelease.body;
    let intermediateReleases: GitHubRelease[] = [];

    if (updateAvailable) {
      intermediateReleases = await getReleasesBetween(cleanCurrentVersion, latestVersion);

      // If there are multiple releases, combine their release notes
      if (intermediateReleases.length > 1) {
        allReleaseNotes = intermediateReleases
          .map((release, index) => {
            const version = release.tag_name;
            const date = new Date(release.published_at).toLocaleDateString();
            const versionContent = `# 🚀 ${version}\n**Released:** ${date}\n\n${release.body || 'No release notes available.'}`;

            // Add spacing wrapper for all but the last version
            if (index < intermediateReleases.length - 1) {
              return versionContent + '\n\n<div style="margin-bottom: 2rem;"></div>\n\n---\n\n<div style="margin-bottom: 2rem;"></div>';
            }
            return versionContent;
          })
          .join('\n\n');
      }
    }

    return {
      updateAvailable,
      currentVersion: cleanCurrentVersion,
      latestVersion,
      releaseUrl: latestRelease.html_url,
      releaseNotes: allReleaseNotes,
      publishedAt: latestRelease.published_at,
      versionsSkipped: intermediateReleases.length > 1 ? intermediateReleases.length - 1 : 0,
    };
  } catch (error) {
    logger.error('Error checking for updates:', error);

    // Determine error type and message
    let errorMessage: string;
    let errorType: 'not_found' | 'network' | 'unknown';

    if (error instanceof GitHubNotFoundError) {
      errorType = 'not_found';
      errorMessage = 'GitHub repository not found or no releases have been published yet.';
    } else if (error instanceof GitHubNetworkError) {
      errorType = 'network';
      errorMessage = 'Unable to connect to GitHub. Please check your internet connection.';
    } else {
      errorType = 'unknown';
      errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while checking for updates.';
    }

    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      error: errorMessage,
      errorType,
    };
  }
}

