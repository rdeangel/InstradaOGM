# Environment Setup Guide

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Setup](./)

## Quick Start

### Development (Local HTTP)
```bash
cp .env.development.example .env.development.local
nano .env.development.local  # Edit with your settings
npm run dev
# Access: http://localhost:9002
```

### Development (Reverse Proxy with HTTPS)
```bash
ALLOW_HTTP=true
NEXTAUTH_URL="https://your-instrada-ogm.com"
INTERNAL_APP_URL="http://192.168.1.151:9002"
NODE_ENV=development
APP_DEBUG_LEVEL=DEBUG
```

### Production
```bash
cp .env.production.example .env.production.local
nano .env.production.local  # Edit with your settings
npm run build && npm run start
```

## Environment Files Structure

```
.env                          # Base configuration (committed)
.env.example                  # All variables documented (committed)
.env.development.example      # Development template (committed)
.env.production.example       # Production template (committed)
.env.local                    # Local overrides (gitignored)
.env.development.local        # Development secrets (gitignored)
.env.production.local         # Production secrets (gitignored)
```

**Commit to Git**: `.env`, `.env.example`, `.env.*.example`
**Never Commit**: `.env.local`, `.env.*.local`

## Configuration Hierarchy

Next.js loads environment variables in this order (later files override earlier ones):

1. `.env` (base configuration)
2. `.env.development` or `.env.production` (based on NODE_ENV)
3. `.env.local` (local overrides)
4. `.env.development.local` or `.env.production.local` (local secrets)

## Environment Files by npm Script

Different npm scripts load different environment files. Understanding this is crucial for proper configuration:

| npm Script | Environment Files Loaded | When to Use |
|------------|-------------------------|-------------|
| `npm run dev` | `.env.development` → `.env.development.local` → `.env` | Local development |
| `npm run start` | `.env.production` → `.env.production.local` → `.env` | Production (non-Docker) |
| `npm run build` | None (build-time only) | Building for deployment |
| Docker | `.env` only (if copied to image) | Containerized deployments |

### Important Notes

**`npm run dev`:**
- Explicitly loads `.env.development` before running
- Runs `setup-dirs` to create data directories
- Runs database migrations and seeding
- Best for: Local development with custom configurations

**`npm run start`:**
- Explicitly loads `.env.production` before running
- Runs `setup-dirs` to create data directories
- Does NOT run migrations (assumes database is ready)
- Best for: Production deployments outside Docker

**`npm run build`:**
- Does NOT load environment files
- Does NOT run `setup-dirs`
- Only generates Prisma client and builds Next.js
- Best for: CI/CD pipelines, Docker builds

**Docker:**
- Environment variables set in `docker-compose.yml` or Dockerfile
- Directories created by Dockerfile at build time
- Does NOT use `.env.development` or `.env.production`
- Best for: Production containerized deployments

### Variable Priority Rules

When the same variable exists in multiple files:

**Development (`npm run dev`):**
```
.env.development.local  (highest priority - your local secrets)
    ↓
.env.development        (development defaults)
    ↓
.env.local             (local overrides for all environments)
    ↓
.env                   (lowest priority - base config)
```

**Production (`npm run start`):**
```
.env.production.local  (highest priority - your production secrets)
    ↓
.env.production        (production defaults)
    ↓
.env.local            (local overrides for all environments)
    ↓
.env                  (lowest priority - base config)
```

**Best Practice:** 
- Put **shared defaults** in `.env`
- Put **environment-specific defaults** in `.env.development` or `.env.production`
- Put **local secrets/overrides** in `.env.*.local` files (never commit these!)


## Key Environment Variables

| Variable | Dev | Prod | Purpose |
|----------|-----|------|------------|
| `DATA_FOLDER_PATH` | `/home/user/data` | (optional) | Custom data folder location (absolute or relative path) |
| `ALLOW_HTTP` | `true` | `false` | HTTP/HTTPS enforcement |
| `NEXTAUTH_URL` | `http://localhost:9002` | `https://domain.com` | Application URL (with protocol) |
| `DOMAIN` | (not needed) | `domain.com` | Reverse proxy routing (no protocol) |
| `INTERNAL_APP_URL` | (optional) | (optional) | Internal server-to-server URL |
| `NODE_ENV` | `development` | `production` | Application mode |
| `APP_DEBUG_LEVEL` | `DEBUG` | `ERROR` | Logging verbosity |
| `NEXTAUTH_SECRET` | Test secret | Generated | JWT signing key |
| `DATABASE_URL` | SQLite | PostgreSQL | Database connection |
| `SSO_MAX_AGE` | (optional) | (optional) | Session max age in seconds |
| `AUTO_UPDATE_CHECK` | `true` | `true` | Enable automatic update checks |
| `PORT` | `3000` | `3000` | Application port |
| `OPNSENSE_URL` | Required | Required | OPNsense firewall URL |
| `OPNSENSE_API_KEY` | Required | Required | OPNsense API key |
| `OPNSENSE_API_SECRET` | Required | Required | OPNsense API secret |

## Data Folder Configuration (DATA_FOLDER_PATH)

The `DATA_FOLDER_PATH` environment variable allows you to customize where the application stores its data files (backups, temp files, service state, database, etc.).

### Default Behavior

If `DATA_FOLDER_PATH` is **not set**, the application uses `./data` (relative to the application root):
```
InstradaOGM/
├── data/              ← Default location
│   ├── backups/
│   ├── temp/
│   ├── db/
│   ├── mac-db/
│   └── .service-state/
```

### Custom Path Configuration

**Absolute Path:**
```bash
DATA_FOLDER_PATH=/var/lib/instrada-ogm/data
```

**Relative Path:**
```bash
DATA_FOLDER_PATH=../data           # One level up from project root
DATA_FOLDER_PATH=./custom-data     # Custom folder in project root
```

### Use Cases

#### Development with Separate Data Folder

Keep development data separate from the project (useful when project data folder is used for Docker builds):

**`.env.development`:**
```bash
DATA_FOLDER_PATH=/home/user/instrada-dev-data
```

Now `npm run dev` will use `/home/user/instrada-dev-data/` instead of `./data/`.

#### System-Wide Installation (Linux)

Follow Linux filesystem conventions:

**`.env.production`:**
```bash
DATA_FOLDER_PATH=/var/lib/instrada-ogm/data
```

#### Multiple Environments on Same Machine

Run multiple instances with isolated data:

**Instance 1 (`.env.development`):**
```bash
DATA_FOLDER_PATH=./data-dev
PORT=9002
```

**Instance 2 (`.env.production.local`):**
```bash
DATA_FOLDER_PATH=./data-prod
PORT=9003
```

### Docker Deployments

**Docker does NOT need `DATA_FOLDER_PATH`** - the Dockerfile creates directories at build time and uses volume mounts:

```yaml
# docker-compose.yml
volumes:
  - ./data:/app/data  # Maps host ./data to container /app/data
```

Leave `DATA_FOLDER_PATH` unset in Docker - it will use the default `/app/data` which is mapped to your volume.

### Directory Structure

The following subdirectories are automatically created:

- `backups/` - Database backup files (`.aes` encrypted)
- `temp/` - Temporary files for uploads/restores
- `db/` - SQLite database files (if using SQLite)
- `mac-db/` - MAC vendor database cache
- `.service-state/` - Service coordination files (multi-worker state)

### Important Notes

> [!IMPORTANT]
> - The path is resolved when `npm run dev` or `npm run start` executes
> - Changes require restarting the application
> - Ensure the user running the app has read/write permissions to the folder
> - For Docker, use volume mounts instead of `DATA_FOLDER_PATH`

> [!WARNING]
> - Changing `DATA_FOLDER_PATH` after initial setup will NOT migrate existing data
> - You must manually move data files if changing the path
> - Backups and database files will be in the new location

### Troubleshooting

**Permission Denied Errors:**
```bash
# Fix ownership (Linux/Mac)
sudo chown -R $USER:$USER /path/to/data/folder

# Or use a path you already own
DATA_FOLDER_PATH=$HOME/instrada-data
```

**Path Not Found:**
- Ensure parent directories exist
- Use absolute paths to avoid confusion
- Check for typos in the path

**Data Not Persisting:**
- Verify `DATA_FOLDER_PATH` is set in the correct `.env` file
- Check that `npm run dev` or `npm run start` is loading the file
- Ensure the path has write permissions


## Database Configuration

### SQLite (Default)
```bash
DATABASE_URL=file:/app/data/db/dev.db
```
✅ Perfect for development and small deployments
✅ Zero configuration needed
❌ Limited for high-traffic production

### PostgreSQL (Recommended for Production)
```bash
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public
```
✅ Enterprise-grade reliability
✅ Unlimited concurrent connections
✅ Better performance with large datasets
❌ Requires separate server

👉 See `DATABASE_CONFIGURATION_GUIDE.md` for complete details

## ALLOW_HTTP Configuration

**What it controls**:
- Security headers (CSP, HSTS)
- Cookie security flags
- HTTP to HTTPS redirects
- Token validation

**Development**: `ALLOW_HTTP=true` (allows HTTP)
**Production**: `ALLOW_HTTP=false` (enforces HTTPS)

👉 See `ALLOW_HTTP_COMPREHENSIVE_GUIDE.md` for complete details

## URL Configuration

### NEXTAUTH_URL (Required)
- **Purpose**: Used BY THE APPLICATION for authentication
- Public-facing URL users access (includes protocol: `https://`)
- Used for authentication redirects and callbacks
- Default for internal API calls if `INTERNAL_APP_URL` not set
- **Example**: `NEXTAUTH_URL="https://your-instrada-ogm.com"`

### DOMAIN (Required for Traefik/Reverse Proxies)
- **Purpose**: Used BY REVERSE PROXIES for routing rules
- Domain name WITHOUT protocol (no `https://`)
- Used in docker-compose Traefik labels for routing
- Used by Traefik for SSL certificate generation
- **Must match** the domain portion of `NEXTAUTH_URL`
- **Example**: `DOMAIN=your-instrada-ogm.com`

**Why both exist**:
- `NEXTAUTH_URL`: Application needs full URL with protocol for redirects
- `DOMAIN`: Traefik/reverse proxies need domain without protocol for routing rules

**Critical**: These must match:
```bash
NEXTAUTH_URL="https://your-instrada-ogm.com"  # Application URL
DOMAIN=your-instrada-ogm.com                   # Traefik routing
```

### INTERNAL_APP_URL (Optional)
- URL for internal server-to-server API calls
- Only needed if different from `NEXTAUTH_URL`
- Common in Docker/Kubernetes deployments where internal calls use container names
- **Example**: `INTERNAL_APP_URL="http://app:3000"`

**Smart Fallback Logic**:
```
1. If INTERNAL_APP_URL is set → Use INTERNAL_APP_URL
2. If not set → Fall back to NEXTAUTH_URL
3. If both unset → Default to http://localhost:3000
```

## Traefik Configuration (For Reverse Proxy Deployments)

When using Traefik as a reverse proxy, additional configuration is required in `traefik/runtime/.env.traefik`:

**Required Variables**:
- `DOMAIN` - Must match the domain portion of `NEXTAUTH_URL` (without protocol)
- `DNS_PROVIDER` - DNS provider for SSL certificate generation (e.g., cloudflare, route53, digitalocean)
- `LETSENCRYPT_EMAIL` - Email for Let's Encrypt certificate notifications
- `ACME_SERVER` - ACME server URL (staging or production)

**DNS Provider Credentials** (varies by provider):
- Cloudflare: `CLOUDFLARE_DNS_API_TOKEN`
- Route53: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- DigitalOcean: `DO_AUTH_TOKEN`

**Configuration Steps**:
1. Edit `traefik/runtime/.env.traefik` with your DNS provider settings
2. Run `cd traefik && ./generate-config.sh` to generate Traefik configuration
3. Ensure `DOMAIN` in `.env` matches `DOMAIN` in `traefik/runtime/.env.traefik`

👉 See Traefik deployment documentation for complete details

## Session Configuration (SSO_MAX_AGE)

Controls how long JWT session tokens remain valid (in seconds).

**Default**: 30 days (2,592,000 seconds) if not set

**Common Values**:
- 1 hour: `SSO_MAX_AGE=3600`
- 1 day: `SSO_MAX_AGE=86400`
- 7 days: `SSO_MAX_AGE=604800`
- 30 days: `SSO_MAX_AGE=2592000`

## Build-Time vs Runtime Evaluation

**Build-Time** (❌ Baked into build):
- Evaluated during `npm run build`
- Changes require rebuild
- Example: `next.config.ts` top-level code

**Runtime** (✅ Dynamic):
- Evaluated on every request
- Changes take effect after restart
- Example: `src/middleware.ts`, `src/lib/auth.ts`

**Key Point**: `ALLOW_HTTP` is evaluated at **RUNTIME**, so no rebuild needed when changing it.

## Token Validation Details

### The Fix
Added `secureCookie` parameter to `getToken()` in middleware:

```typescript
const token = await getToken({
  req,
  secret,
  secureCookie: process.env.ALLOW_HTTP === 'true' ? false : actualProtocol === 'https',
});
```

### Why It Matters
- Ensures token validation matches cookie security settings
- Works correctly with reverse proxies
- Fixes Settings page redirect issues
- Enables proper logout functionality

## Docker Setup

**docker-compose.yml** passes `ALLOW_HTTP` to containers:
```yaml
environment:
  - ALLOW_HTTP=${ALLOW_HTTP}
  - NEXTAUTH_URL=${NEXTAUTH_URL}
  - INTERNAL_APP_URL=${INTERNAL_APP_URL}
```

**Example .env**:
```bash
ALLOW_HTTP=true
NEXTAUTH_URL="http://192.168.1.151:3000"
```

## Reverse Proxy Setup

**How it works**:
1. Browser accesses: `https://your-instrada-ogm.com` (HTTPS)
2. Reverse proxy forwards to: `http://192.168.1.151:9002` (HTTP)
3. Proxy sets `X-Forwarded-Proto: https` header
4. App receives header and validates tokens correctly

**Configuration**:
```bash
ALLOW_HTTP=true
NEXTAUTH_URL="https://your-instrada-ogm.com"
INTERNAL_APP_URL="http://192.168.1.151:9002"
```

## Troubleshooting

### Settings page redirects to login
- Verify `ALLOW_HTTP` matches your setup
- Clear browser cookies
- Restart dev server
- Check middleware logs

### Can't access via HTTP
- Verify `ALLOW_HTTP=true`
- Clear HSTS cache (Chrome: `chrome://net-internals/#hsts`)
- Try incognito window

### Authentication fails
- Verify `ALLOW_HTTP` and `NEXTAUTH_URL` protocol match
- Verify `NEXTAUTH_SECRET` is set
- Restart server after changes
- Clear browser cookies

### Mixed content warnings
- Ensure all URLs use same protocol
- Check CSP headers in Network tab
- Verify `ALLOW_HTTP` setting

## Security Checklist

### Development
- [ ] Use `ALLOW_HTTP=true` only for local development
- [ ] Use test secrets for `NEXTAUTH_SECRET`
- [ ] Never commit `.env.development.local`
- [ ] Use `APP_DEBUG_LEVEL=DEBUG` for debugging

### Production
- [ ] Set `ALLOW_HTTP=false`
- [ ] Use valid SSL certificates
- [ ] Generate strong `NEXTAUTH_SECRET`: `openssl rand -base64 32`
- [ ] Set `APP_DEBUG_LEVEL=ERROR`
- [ ] Use PostgreSQL instead of SQLite
- [ ] Never commit `.env.production.local`
- [ ] Rotate secrets regularly

## Complete Environment Variables Reference

### Application Metadata
- `NEXT_PUBLIC_APP_VERSION` - App version (auto-set from package.json)
- `AUTO_UPDATE_CHECK` - Enable automatic update checks (default: true)
  - Set to `false` to disable automatic update checks on startup and periodic 6-hour checks
  - Manual update checks via Settings > Updates tab still work when disabled
  - See [Update Detection Documentation](../api/api_docs/31_update_endpoints.md) for details
- `MOCK_UPDATE_AVAILABLE` - Mock mode for testing update notifications (development/testing only)
  - Set to `true` to simulate an available update for testing
  - ⚠️ WARNING: Only use in development - remove or set to `false` in production
- `PORT` - Application port (default: 3000)
- `NODE_ENV` - Environment mode (development|production)
- `APP_DEBUG_LEVEL` - Logging level (SILENT|ERROR|WARN|INFO|DEBUG)

### OPNsense Configuration (Required)
- `OPNSENSE_URL` - OPNsense firewall URL
- `OPNSENSE_API_KEY` - OPNsense API key
- `OPNSENSE_API_SECRET` - OPNsense API secret
- `SKIP_SSL_VERIFICATION` - Bypass SSL verification (dev only)
  - Set to `true` to bypass SSL certificate validation for OPNsense API calls
  - Useful for development with self-signed certificates or IP-based connections
  - ⚠️ WARNING: Only use in development/testing - NOT recommended for production

### Database Configuration
- `DATABASE_URL` - Database connection string (SQLite or PostgreSQL)
- `SQLITE_DB_NAME` - SQLite database filename (default: instrada-ogm.db)
  - Used in DATABASE_URL: `file:/app/data/db/${SQLITE_DB_NAME}`
  - Examples: `instrada-ogm.db`, `instrada-ogm-dev.db`
- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_HOST` - PostgreSQL host
- `POSTGRES_PORT` - PostgreSQL port (default: 5432)
- `POSTGRES_DB` - PostgreSQL database name

### HTTP/HTTPS Configuration
- `ALLOW_HTTP` - Allow HTTP connections (default: false)
- `NEXTAUTH_URL` - Application URL with protocol (required)
- `DOMAIN` - Domain for reverse proxy routing, no protocol (required for Traefik)
- `INTERNAL_APP_URL` - Internal server URL (optional)

### Authentication & Security
- `NEXTAUTH_SECRET` - JWT signing secret (required)
- `AUTH_ALLOW_LOCAL_LOGIN` - Enable local login (default: true)
- `AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL` - Require email verification for local login (default: false)
  - Requires AUTH_SMTP_* configuration for email sending
  - Only applies to local email/password authentication, not OIDC/SSO
- `AUTH_ALLOW_LOCAL_2FA` - Enable 2FA (default: true)
- `AUTH_PASSWORD_MIN_LENGTH` - Min password length (default: 8)
- `AUTH_ALLOW_OIDC_LOGIN` - Enable OIDC/SSO (default: false)
- `SSO_MAX_AGE` - Session max age in seconds (default: 2592000)

### Backup & Security
- `BACKUP_ENCRYPTION_SECRET_KEY` - Backup encryption key (64-char hex)

### Email Configuration
- `AUTH_SMTP_HOST` - SMTP server hostname
- `AUTH_SMTP_PORT` - SMTP server port
- `AUTH_SMTP_USER` - SMTP username
- `AUTH_SMTP_PASS` - SMTP password
- `AUTH_SMTP_FROM_EMAIL` - From email address

### OIDC Providers (Authentik, Keycloak, Microsoft)
- `AUTH_OIDC_PROVIDER_*_ENABLED` - Enable provider
- `AUTH_OIDC_PROVIDER_*_CLIENT_ID` - Provider client ID
- `AUTH_OIDC_PROVIDER_*_CLIENT_SECRET` - Provider client secret
- `AUTH_OIDC_PROVIDER_*_ISSUER` - Provider issuer URL
- `AUTH_OIDC_PROVIDER_*_DISPLAY_NAME` - Display name in UI
- `AUTH_OIDC_PROVIDER_*_SCOPES` - OAuth scopes

👉 See `.env.example` for complete documentation of all variables

## Related Documentation

- **`DATABASE_CONFIGURATION_GUIDE.md`** - SQLite vs PostgreSQL comparison
- **`ALLOW_HTTP_COMPREHENSIVE_GUIDE.md`** - Detailed ALLOW_HTTP configuration
- **`.env.example`** - All available variables with descriptions
- **`.env.development.example`** - Development configuration template
- **`.env.production.example`** - Production configuration template

## Section Navigation

### Setup Documentation
- [📋 Setup Overview](./) - Section index and overview
- [🔧 Environment Setup](./) - Current document
- [🗄️ Database Configuration](./DATABASE_CONFIGURATION_GUIDE.md) - Database setup and configuration
- [🐳 Docker Versioning](./DOCKER_VERSIONING.md) - Docker image versioning
- [🚀 Installation Guide](./INSTALLATION_GUIDE.md) - Complete installation instructions

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🔧 Configuration](../CONFIGURATION/) - System configuration
- [🔧 API Reference](../api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Setup Section](./) - Section-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report setup problems

---

## Summary

✅ **Environment configuration is:**
- Runtime-evaluated (no rebuild needed)
- Secure (secrets never committed)
- Flexible (works for dev, prod, Docker)
- Well-documented (clear examples)
- Database-agnostic (SQLite or PostgreSQL)

**Start here**:
1. Copy `.env.development.example` or `.env.production.example`
2. Customize for your setup
3. Reference `.env.example` for all available variables
4. See `DATABASE_CONFIGURATION_GUIDE.md` for database selection

