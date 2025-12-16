import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { logger } from '@/lib/logger';

const secret = process.env.NEXTAUTH_SECRET;

/**
 * Detects if the request is coming from a reverse proxy (NGINX, Traefik, Caddy, etc.)
 * Reverse proxies set the X-Forwarded-Proto header to indicate the original protocol
 * @param req The incoming request
 * @returns true if the request is from a reverse proxy, false if direct browser access
 */
function isFromReverseProxy(req: NextRequest): boolean {
  // Check for common reverse proxy headers
  const xForwardedProto = req.headers.get('x-forwarded-proto');
  const xRealIp = req.headers.get('x-real-ip');

  // If X-Forwarded-Proto is set to 'https', it's definitely from a reverse proxy
  // that's handling HTTPS termination
  if (xForwardedProto === 'https') {
    return true;
  }

  // If X-Real-IP is present, it's likely from a reverse proxy
  if (xRealIp) {
    return true;
  }

  // For X-Forwarded-For, we need to be more careful
  // Docker might set this header when accessing from the host machine
  // A true reverse proxy would have X-Forwarded-Proto set to 'https' (for HTTPS termination)
  // If X-Forwarded-Proto is 'http' and X-Forwarded-For is set, it's likely direct browser access
  // through Docker, not a reverse proxy
  // So we don't consider X-Forwarded-For alone as a sign of a reverse proxy

  return false;
}

/**
 * Gets the actual protocol being used (considering reverse proxies)
 * @param req The incoming request
 * @returns 'https' or 'http'
 */
function getActualProtocol(req: NextRequest): 'https' | 'http' {
  // Check X-Forwarded-Proto header (set by reverse proxies)
  const xForwardedProto = req.headers.get('x-forwarded-proto');
  if (xForwardedProto) {
    return xForwardedProto === 'https' ? 'https' : 'http';
  }

  // Fall back to the request protocol
  return req.nextUrl.protocol === 'https:' ? 'https' : 'http';
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const allowHttp = process.env.ALLOW_HTTP === 'true';
  const actualProtocol = getActualProtocol(req);
  const isReverseProxy = isFromReverseProxy(req);

  // Exclude health check endpoint from HTTP-to-HTTPS redirect
  // Health checks are used by load balancers (Traefik) and monitoring systems
  // that access the container directly via HTTP on the internal network
  const isHealthCheck = pathname === '/api/health';

  // If ALLOW_HTTP is false and the request is over HTTP (and not from a reverse proxy),
  // redirect to HTTPS (except for health check endpoint)
  if (!allowHttp && actualProtocol === 'http' && !isReverseProxy && !isHealthCheck) {
    const httpsUrl = new URL(req.url);
    httpsUrl.protocol = 'https:';

    // If the request has X-Forwarded-For header (from Docker), use the original host
    // Otherwise, use the host from the request
    const xForwardedFor = req.headers.get('x-forwarded-for');
    if (xForwardedFor) {
      // Extract the first IP from X-Forwarded-For (the original client IP)
      const originalIp = xForwardedFor.split(',')[0].trim();
      httpsUrl.hostname = originalIp;
    }

    return NextResponse.redirect(httpsUrl, { status: 307 });
  }

  // Configure getToken to work with proxy setup
  // When behind a reverse proxy, we need to tell NextAuth about the secure cookie setting
  const token = await getToken({
    req,
    secret,
    secureCookie: process.env.ALLOW_HTTP === 'true' ? false : actualProtocol === 'https',
  });

  const protectedPaths = ['/account', '/settings']; // Add other protected paths here
  const isProtected = protectedPaths.some(path => pathname.startsWith(path));
  const isLoginPage = pathname === '/login';

  // Debug logging for protected paths
  if (isProtected) {
    logger.debug('[Middleware] Protected path request:', {
      pathname,
      hasToken: !!token,
      tokenSub: token?.sub,
      cookies: req.cookies.getAll().map(c => c.name),
      xForwardedProto: req.headers.get('x-forwarded-proto'),
      host: req.headers.get('host'),
      actualProtocol,
      isReverseProxy,
    });
  }

  let response: NextResponse;

  if (!token && isProtected && pathname !== '/admin' && !pathname.startsWith('/admin/user-management')) {
    // Redirect unauthenticated users from protected paths to login
    logger.debug('[Middleware] Redirecting unauthenticated user to login:', {
      pathname,
      hasToken: !!token,
      host: req.headers.get('host'),
    });
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname); // Optional: add callbackUrl
    response = NextResponse.redirect(loginUrl);
  } else if (token && isLoginPage) {
    // Redirect authenticated users from login page to home or dashboard
    logger.debug('[Middleware] Redirecting authenticated user from login to home:', {
      tokenSub: token?.sub,
    });
    response = NextResponse.redirect(new URL('/', req.url));
  } else {
    // Allow the request to proceed for all other cases
    response = NextResponse.next();
  }

  // Add security headers at RUNTIME (evaluated on each request)
  // This allows ALLOW_HTTP to be changed without rebuilding

  // Content Security Policy (CSP)
  const cspValue = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: https: ${allowHttp ? 'http:' : ''} blob:`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(allowHttp ? [] : ['upgrade-insecure-requests']),
  ]
    .filter(Boolean)
    .join('; ');

  response.headers.set('Content-Security-Policy', cspValue);

  // HTTP Strict Transport Security (HSTS)
  if (!allowHttp) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Other security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()'
  );
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  return response;
}

// Configure Matching - Apply middleware to all paths
export const config = {
  matcher: [
    /*
     * Match all request paths including root
     */
    '/',
    '/:path*',
  ],
};