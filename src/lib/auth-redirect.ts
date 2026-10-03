/**
 * Post-login redirect target. Origin-checked so a callbackUrl cannot send
 * the browser to another site. Private IPv4 literals (and localhost) are
 * optional for LAN-IP logins.
 *
 * Backslashes are normalised to slashes before parsing so Node matches
 * browsers that treat `/\evil.com` as protocol-relative.
 */
function isPrivateIP(ipAddress: string): boolean {
  if (!ipAddress) return false;
  const parts = ipAddress.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

export function safeRedirect(url: string, baseUrl: string, allowPrivate: boolean): string {
  const normalized = url.replace(/\\/g, '/');
  const isRootRelative =
    normalized.startsWith('/') || normalized.startsWith('?') || normalized.startsWith('#');
  if (!isRootRelative) {
    try {
      const abs = new URL(normalized);
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return baseUrl;
    } catch {
      return baseUrl;
    }
  }

  let t: URL;
  try {
    t = new URL(normalized, baseUrl);
  } catch {
    return baseUrl;
  }
  if (t.protocol !== 'http:' && t.protocol !== 'https:') return baseUrl;
  if (t.origin === new URL(baseUrl).origin) return t.toString();
  // ponytail: IP-literal LAN allowance kept for LAN-IP logins (audit step 22); v4 only, like v1.2.3
  const h = t.hostname;
  if (allowPrivate && (h === 'localhost' || h === '127.0.0.1' || isPrivateIP(h))) return t.toString();
  return baseUrl;
}
