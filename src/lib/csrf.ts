/**
 * Cookie-session CSRF check for /api writes (Go 1.25 CrossOriginProtection
 * order: Sec-Fetch-Site when present, Origin only when it is absent).
 *
 * Edge-safe: no node: imports, no logger.
 */

export type CsrfRequest = {
  method: string;
  pathname: string;
  hasSessionCookie: boolean;
  hasApiKeyHeader: boolean;
  secFetchSite: string | null;
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  nextauthUrl: string | undefined;
};

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

function allowedHosts(
  host: string | null,
  forwardedHost: string | null,
  nextauthUrl: string | undefined,
): Set<string> {
  const allowed = new Set<string>();
  if (host) {
    const h = host.trim().toLowerCase();
    if (h) allowed.add(h);
  }
  if (forwardedHost) {
    const first = forwardedHost.split(',')[0].trim().toLowerCase();
    if (first) allowed.add(first);
  }
  if (nextauthUrl) {
    try {
      const h = new URL(nextauthUrl).host.toLowerCase();
      if (h) allowed.add(h);
    } catch {
      /* ignore unparseable NEXTAUTH_URL */
    }
  }
  return allowed;
}

export function csrfAllowed(r: CsrfRequest): boolean {
  const method = r.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (!r.pathname.startsWith('/api/')) return true;
  // Cookieless writes skip Origin/SFS only on NextAuth public auth routes
  // (OIDC form_post, credentials sign-in). Other /api/* writes are checked.
  if (!r.hasSessionCookie && r.pathname.startsWith('/api/auth/')) return true;
  if (r.hasApiKeyHeader) return true;

  const sfs = (r.secFetchSite ?? '').trim().toLowerCase();
  if (sfs) {
    return sfs === 'same-origin' || sfs === 'none';
  }

  const origin = (r.origin ?? '').trim();
  if (!origin) return true;
  if (origin.toLowerCase() === 'null') return false;

  const oh = originHost(origin);
  if (!oh) return false;
  return allowedHosts(r.host, r.forwardedHost, r.nextauthUrl).has(oh);
}
