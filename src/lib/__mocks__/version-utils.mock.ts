/**
 * Mock data for version update testing
 * Only used when MOCK_UPDATE_AVAILABLE=true
 */

import type { GitHubRelease } from '../version-utils';

/**
 * Generate a mock version that's higher than the current version
 */
export function generateMockVersion(currentVersion: string): string {
  const cleanVersion = currentVersion.replace(/^v/, '');
  const parts = cleanVersion.split('.');
  
  const major = parseInt(parts[0] || '1', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10);
  
  return `v${major}.${minor + 1}.${patch}`;
}

/**
 * Generate mock release data for testing
 */
export function generateMockRelease(currentVersion?: string): GitHubRelease {
  const mockVersion = currentVersion
    ? generateMockVersion(currentVersion)
    : 'v1.1.0';

  return {
    tag_name: mockVersion,
    name: `InstradaOGM ${mockVersion} - Mock Release`,
    html_url: `https://github.com/rdeangel/InstradaOGM/releases/tag/${mockVersion}`,
    published_at: new Date().toISOString(),
    body: getMockReleaseNotes(),
    prerelease: false,
    draft: false,
  };
}

/**
 * Mock release notes for testing
 * Customize this to test different changelog scenarios
 */
function getMockReleaseNotes(): string {
  return `## 🎉 Mock Release for Testing

### New Features
- Feature A: Improved performance
- Feature B: New dashboard widgets
- Feature C: Enhanced security

### Bug Fixes
- Fixed issue X: Memory leak in background tasks
- Fixed issue Y: UI rendering on mobile devices

### Breaking Changes
- None

---

**Note:** This is mock data for testing purposes only.`;
}

