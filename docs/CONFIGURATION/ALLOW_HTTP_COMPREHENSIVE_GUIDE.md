# ALLOW_HTTP Comprehensive Guide

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Configuration](./)

## Overview

The `ALLOW_HTTP` environment variable provides centralized control over HTTP/HTTPS enforcement across InstradaOGM. It controls security headers, cookie settings, and CSP directives to enable seamless switching between development (HTTP) and production (HTTPS) modes.

## Quick Reference

| Setting | Development | Production |
|---------|-------------|-----------|
| `ALLOW_HTTP` | `true` | `false` (or unset) |
| `NEXTAUTH_URL` | `http://localhost:9002` | `https://your-domain.com` |
| HTTPS Enforced | ❌ No | ✅ Yes |
| Secure Cookies | ❌ No | ✅ Yes |
| HSTS Header | ❌ No | ✅ Yes |
| HTTP Images in CSP | ✅ Yes | ❌ No |

## What ALLOW_HTTP Controls

### 1. Security Headers (Moved to `src/middleware.ts`)

**Note**: Security headers were moved from `next.config.ts` to `src/middleware.ts` to enable runtime evaluation instead of build-time evaluation. This allows `ALLOW_HTTP` to be changed without rebuilding.

**Content Security Policy (CSP)**:
- `ALLOW_HTTP=true`: Allows HTTP images, no `upgrade-insecure-requests`
- `ALLOW_HTTP=false`: HTTPS images only, includes `upgrade-insecure-requests`

**HTTP Strict Transport Security (HSTS)**:
- `ALLOW_HTTP=true`: HSTS header NOT added (allows HTTP)
- `ALLOW_HTTP=false`: HSTS header added (enforces HTTPS for 1 year)

**API CSP**:
- `ALLOW_HTTP=true`: Allows both HTTP and HTTPS API connections
- `ALLOW_HTTP=false`: HTTPS API connections only

### 2. NextAuth Cookie Configuration (`src/lib/auth.ts`)

**Cookie Security Flag**:
- `ALLOW_HTTP=true`: `secure: false` (cookies work over HTTP)
- `ALLOW_HTTP=false`: `secure: true` (cookies require HTTPS)

**Cookie Names**:
- `ALLOW_HTTP=true`: `next-auth.session-token` (no prefix)
- `ALLOW_HTTP=false`: `__Secure-next-auth.session-token` (production prefix)

**useSecureCookies Setting**:
- `ALLOW_HTTP=true`: `false` (allows HTTP)
- `ALLOW_HTTP=false`: `true` (enforces HTTPS)

### 3. Middleware Token Validation (`src/middleware.ts`)

**Token Validation**:
- `ALLOW_HTTP=true`: `secureCookie: false` (looks for non-secure cookies)
- `ALLOW_HTTP=false`: `secureCookie: true` (looks for secure cookies)

**HTTP to HTTPS Redirect**:
- `ALLOW_HTTP=true`: No redirect (allows HTTP)
- `ALLOW_HTTP=false`: Redirects HTTP to HTTPS (unless from reverse proxy)

## Configuration

### Environment Variable

```bash
# .env file
ALLOW_HTTP=true   # Allow HTTP (development mode)
ALLOW_HTTP=false  # Enforce HTTPS (production mode)
# or leave unset  # Defaults to false (secure mode)
```

### Development Setup

**Local HTTP Development**:
```bash
ALLOW_HTTP=true
NEXTAUTH_URL="http://localhost:9002"
INTERNAL_APP_URL="http://localhost:9002"
NODE_ENV=development
APP_DEBUG_LEVEL=DEBUG
```

**Reverse Proxy with HTTPS Termination**:
```bash
ALLOW_HTTP=true
NEXTAUTH_URL="https://your-instrada-ogm.com"
INTERNAL_APP_URL="http://192.168.1.151:9002"
NODE_ENV=development
APP_DEBUG_LEVEL=DEBUG
```

### Production Setup

```bash
ALLOW_HTTP=false  # or leave unset
NEXTAUTH_URL="https://your-domain.com"
INTERNAL_APP_URL="https://your-domain.com"
NODE_ENV=production
APP_DEBUG_LEVEL=ERROR
```

### Docker Setup

**docker-compose.yml**:
```yaml
environment:
  - ALLOW_HTTP=${ALLOW_HTTP}
  - NEXTAUTH_URL=${NEXTAUTH_URL}
  - INTERNAL_APP_URL=${INTERNAL_APP_URL}
```

**.env file**:
```bash
ALLOW_HTTP=true
NEXTAUTH_URL="http://192.168.1.151:3000"
```

## How It Works

### Build-Time vs Runtime Evaluation

**Key Point**: `ALLOW_HTTP` is evaluated at **RUNTIME**, not build time.

This means:
- ✅ No rebuild needed when changing `ALLOW_HTTP`
- ✅ Changes take effect immediately after server restart
- ✅ Same build works for development and production

**Why This Matters**: Previously, security headers were evaluated at build time in `next.config.ts`, which meant changing `ALLOW_HTTP` required a rebuild. Now they're evaluated at runtime in `src/middleware.ts`, allowing dynamic configuration.

### Security Headers Flow (Runtime)

```
1. Request arrives at middleware
2. src/middleware.ts runs for every request
3. Reads ALLOW_HTTP from process.env (RUNTIME)
4. Conditionally applies security headers
5. Response sent to browser with appropriate headers
```

### Cookie Configuration Flow (Initialization)

```
1. NextAuth initializes at server startup
2. Reads ALLOW_HTTP from process.env
3. Sets cookie security based on ALLOW_HTTP
4. Cookies created with appropriate flags
5. Browser sends/receives cookies accordingly
```

### Token Validation Flow (Per Request)

```
1. Request arrives at middleware
2. getToken() called with secureCookie parameter
3. secureCookie set based on ALLOW_HTTP
4. Token validated with correct cookie settings
5. User authenticated or redirected to login
```

## Common Issues & Solutions

### Issue: Settings page redirects to login

**Cause**: Token validation failing due to `secureCookie` mismatch

**Solution**:
1. Verify `ALLOW_HTTP` matches your setup
2. Clear browser cookies
3. Restart dev server
4. Check middleware logs

### Issue: Can't access via HTTP

**Cause**: HSTS cache or `ALLOW_HTTP=false`

**Solution**:
1. Verify `ALLOW_HTTP=true` in `.env`
2. Clear browser HSTS cache:
   - Chrome: `chrome://net-internals/#hsts` → Delete domain
   - Firefox: Clear all site data
   - Safari: Develop → Clear Caches
3. Try incognito window

### Issue: Authentication fails

**Cause**: Cookie security mismatch or `NEXTAUTH_URL` protocol mismatch

**Solution**:
1. Verify `ALLOW_HTTP=true` for HTTP access
2. Verify `NEXTAUTH_URL` uses `http://` for HTTP
3. Verify both are set consistently
4. Restart server after changes
5. Clear browser cookies

### Issue: ALLOW_HTTP changes not taking effect

**Cause**: Server not restarted or `.env` not loaded

**Solution**:
1. Stop dev server (Ctrl+C)
2. Verify `.env` file exists in project root
3. Verify `ALLOW_HTTP=true` is on its own line
4. Restart: `npm run dev`
5. Check server logs

### Issue: Mixed Content warnings

**Cause**: Resources loading via different protocols

**Solution**:
1. Ensure `ALLOW_HTTP=true` is set
2. Ensure all URLs in `.env` use same protocol
3. Check CSP headers in Network tab

## Testing Checklist

### For HTTP Development

- [ ] `ALLOW_HTTP=true` in `.env`
- [ ] `NEXTAUTH_URL` uses `http://`
- [ ] Server restarted after changes
- [ ] Browser cache cleared
- [ ] Can access via HTTP
- [ ] Login works
- [ ] Cookies have `Secure: false`
- [ ] No HSTS header in response

### For HTTPS Production

- [ ] `ALLOW_HTTP=false` (or unset)
- [ ] `NEXTAUTH_URL` uses `https://`
- [ ] Valid SSL certificate installed
- [ ] Can access via HTTPS
- [ ] Login works
- [ ] Cookies have `Secure: true`
- [ ] HSTS header present in response

## Browser DevTools Verification

### Check Cookies

1. Open DevTools (F12)
2. Go to Application → Cookies
3. Look for `next-auth.session-token`
4. Verify `Secure` flag matches your setup:
   - HTTP: `Secure` should be unchecked
   - HTTPS: `Secure` should be checked

### Check Response Headers

1. Open DevTools (F12)
2. Go to Network tab
3. Reload page
4. Click on main document request
5. Check Response Headers:
   - HTTP: No HSTS header
   - HTTPS: `Strict-Transport-Security` header present

### Check CSP

1. Open DevTools (F12)
2. Go to Network tab
3. Click on main document request
4. Check Response Headers for `Content-Security-Policy`
5. Verify `upgrade-insecure-requests` presence:
   - HTTP: Should NOT be present
   - HTTPS: Should be present

## Security Implications

### Development Mode (`ALLOW_HTTP=true`)

**Security Settings**:
- ⚠️ No HTTPS enforcement
- ⚠️ Cookies not encrypted in transit
- ⚠️ No HSTS protection
- ✅ HttpOnly cookies (XSS protection)
- ✅ SameSite cookies (CSRF protection)

**Risk Level**: Low (acceptable for local development on trusted networks)

### Production Mode (`ALLOW_HTTP=false`)

**Security Settings**:
- ✅ HTTPS enforced via CSP
- ✅ Secure cookies required
- ✅ HSTS enabled (1 year)
- ✅ HttpOnly cookies
- ✅ SameSite cookies
- ✅ All traffic encrypted

**Risk Level**: Minimal (production-ready security)

## Files Modified

1. **`src/middleware.ts`**:
   - Runtime security headers evaluation based on `ALLOW_HTTP`
   - HTTP to HTTPS redirect logic
   - Token validation with `secureCookie` parameter

2. **`src/lib/auth.ts`**:
   - Conditional cookie configuration based on `ALLOW_HTTP`
   - Cookie naming conventions (`__Secure-`, `__Host-` prefixes)
   - `useSecureCookies` setting

3. **`docker-compose.yml`**:
   - Passes `ALLOW_HTTP` environment variable to containers
   - Both SQLite and PostgreSQL services configured

4. **`.env.example`**:
   - Documents `ALLOW_HTTP` variable and usage

5. **`.env.development.example`**:
   - Development configuration with reverse proxy setup

6. **`.env.production.example`**:
   - Production configuration with security best practices

## Section Navigation

### Configuration Documentation
- [📋 Configuration Overview](./) - Section index and overview
- [🔐 SSO Provider Config](SSO_PROVIDER_CONFIG.md) - Configure single sign-on providers
- [🌐 Proxy Settings](CADDY-PROXY-SETTINGS.md) - Configure reverse proxy
- [🗄️ Database Configuration](../SETUP/DATABASE_CONFIGURATION_GUIDE.md) - Database setup and configuration

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 API Reference](../api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Configuration Section](./) - Section-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report configuration problems

---

**Last Updated**: 2025-11-06 | **Section**: Configuration | **Category**: Security Settings

## Summary

The `ALLOW_HTTP` environment variable provides:

✅ **Centralized Control** - Single variable controls all HTTP/HTTPS settings
✅ **Consistency** - Security headers and cookies stay in sync
✅ **Simplicity** - Easy to understand and configure
✅ **Safety** - Defaults to secure mode if not set
✅ **Flexibility** - Easy to switch between development and production
✅ **No Rebuild** - Changes take effect immediately
✅ **Production Ready** - Full security hardening in production

**Quick Start**:

Development:
```bash
ALLOW_HTTP=true
NEXTAUTH_URL="http://localhost:9002"
```

Production:
```bash
ALLOW_HTTP=false
NEXTAUTH_URL="https://your-domain.com"
```

