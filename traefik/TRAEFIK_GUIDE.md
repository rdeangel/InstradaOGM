# Traefik Reverse Proxy Guide for InstradaOGM

[⬆️ Back to Documentation Home](../docs/DOCUMENTATION_INDEX.md) | [📁 Back to Traefik](./README.md)

> **📖 NOTE**: The comprehensive Traefik documentation has been consolidated into:
> **[docs/CONFIGURATION/TRAEFIK-PROXY-SETTINGS.md](../docs/CONFIGURATION/TRAEFIK-PROXY-SETTINGS.md)**
>
> This file contains technical reference information. For complete setup instructions,
> troubleshooting, and best practices, please refer to the main documentation.

## Overview

Complete guide for setting up and managing Traefik as a reverse proxy for InstradaOGM with automatic SSL certificates using DNS challenge.

**Supports 150+ DNS providers** including Cloudflare, Route53, DigitalOcean, Google Cloud DNS, Azure DNS, and more!

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Configuration Files Explained](#configuration-files-explained)
5. [Setup Instructions](#setup-instructions)
6. [Cloudflare DNS Challenge](#cloudflare-dns-challenge)
7. [Switching Between Staging and Production](#switching-between-staging-and-production)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance](#maintenance)

---

## Overview

### What is Traefik?

Traefik is a modern reverse proxy and load balancer that makes deploying microservices easy. It automatically discovers services and configures routing rules.

### Why Traefik for InstradaOGM?

- ✅ **Automatic SSL Certificates** - Let's Encrypt integration with auto-renewal
- ✅ **DNS Challenge Support** - Works behind firewalls using 150+ DNS providers
- ✅ **Docker Integration** - Automatic service discovery
- ✅ **Health Checks** - Monitors application health
- ✅ **HTTP to HTTPS Redirect** - Automatic security enforcement
- ✅ **Real IP Forwarding** - Proper client IP detection for access control

### Key Features for InstradaOGM

1. **DNS Challenge** - Generates SSL certificates without exposing port 80 (supports Cloudflare, Route53, DigitalOcean, and 147+ more providers)
2. **IP Forwarding Headers** - Preserves real client IPs for OPNsense firewall rules
3. **Health Monitoring** - Checks `/api/health` endpoint
4. **Automatic Renewal** - Certificates renew automatically before expiration

---

## Architecture

```
Internet
    ↓
DNS Provider (DNS Challenge for SSL)
    ↓
Your Server (Traefik on ports 80/443)
    ↓
Docker Network (instradaogm_app_network)
    ↓
InstradaOGM Container (port 3000)
    ↓
Database (PostgreSQL or SQLite)
```

### Traffic Flow

1. **User Request** → `https://your-instrada-ogm.com`
2. **Traefik** receives request on port 443
3. **SSL Termination** - Traefik decrypts HTTPS using Let's Encrypt certificate
4. **Routing** - Traefik routes to InstradaOGM container based on domain
5. **Headers** - Traefik adds `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`
6. **Application** - InstradaOGM receives request with real client IP
7. **Response** - Traefik encrypts and sends back to user

---

## Directory Structure

```
traefik/
├── templates/                    # Template files (COMMIT TO GIT)
│   ├── traefik.yml.template     # Static configuration template
│   ├── config.yml.template      # Dynamic configuration template
│   └── .env.traefik.example     # Environment variables example
│
├── runtime/                      # Generated files (DO NOT COMMIT)
│   ├── .env.traefik             # Your actual configuration (secrets!)
│   ├── traefik.yml              # Generated static config
│   ├── config.yml               # Generated dynamic config
│   ├── acme.json                # SSL certificates (chmod 600)
│   └── logs/                    # Log files
│       ├── traefik.log          # Traefik application logs
│       └── access.log           # HTTP access logs (JSON)
│
├── generate-config.sh            # Configuration generator script
├── validate.sh                   # Configuration validator
└── TRAEFIK_GUIDE.md             # This file
```

### Why This Structure?

- **templates/** - Version controlled, safe to commit, no secrets
- **runtime/** - Git-ignored, contains secrets and generated files
- **Separation** - Clear distinction between templates and actual config
- **Security** - Secrets never accidentally committed

---

## Configuration Files Explained

### 1. traefik.yml (Static Configuration)

**Purpose**: Core Traefik settings that require restart to change.

**Key Sections**:

- **Entry Points** - Ports Traefik listens on (80, 443, 8080)
- **Providers** - Where Traefik gets routing rules (Docker, File)
- **Certificate Resolvers** - How to get SSL certificates (Let's Encrypt + Cloudflare)
- **Logging** - Where and what to log

**Example**:
```yaml
entryPoints:
  web:
    address: ":80"      # HTTP
  websecure:
    address: ":443"     # HTTPS
```

### 2. config.yml (Dynamic Configuration)

**Purpose**: Routing rules and middleware that can change without restart.

**Key Sections**:

- **Routers** - Match requests to services (by domain, path, etc.)
- **Services** - Backend applications to route to
- **Middlewares** - Request/response modifications (headers, redirects, etc.)
- **TLS** - SSL/TLS options

**Example**:
```yaml
routers:
  ogm:
    rule: "Host(`your-instrada-ogm.com`)"
    service: ogm-service
    tls:
      certResolver: letsencrypt
```

### Key Differences

| Feature | traefik.yml | config.yml |
|---------|-------------|------------|
| **Type** | Static | Dynamic |
| **Restart Required** | Yes | No (auto-reload) |
| **Contains** | Infrastructure | Routing rules |
| **Examples** | Ports, providers, ACME | Routes, services, middleware |

---

## Setup Instructions

### Prerequisites

1. **Domain Name** - Pointed to your server (e.g., `your-instrada-ogm.com`)
2. **Cloudflare Account** - Domain managed by Cloudflare
3. **Cloudflare API Token** - With DNS edit permissions
4. **Docker & Docker Compose** - Installed on your server

### Step 1: Generate Configuration

```bash
cd traefik
./generate-config.sh
```

This will:
1. Create `runtime/` directory
2. Copy `.env.traefik.example` to `runtime/.env.traefik`
3. Prompt you to edit the configuration
4. Generate `traefik.yml` and `config.yml` from templates

### Step 2: Configure Environment Variables

Edit `runtime/.env.traefik`:

```bash
# Your domain
DOMAIN=your-instrada-ogm.com

# Your email for Let's Encrypt notifications
LETSENCRYPT_EMAIL=your-email@example.com

# Cloudflare API token (see next section)
CLOUDFLARE_DNS_API_TOKEN=your_token_here

# Use staging for testing, production for real certs
ACME_SERVER=staging

# Docker network (should match docker-compose)
DOCKER_NETWORK=instradaogm_app_network

# Container name
CONTAINER_NAME=instrada-ogm

# Trusted IP range for forwarded headers
TRUSTED_IP_RANGE=192.168.0.0/16

# Log level
LOG_LEVEL=INFO
```

### Step 3: Update Docker Compose

Update `docker-compose-traefik.yml` to use runtime directory:

```yaml
traefik:
  volumes:
    - ./traefik/runtime/traefik.yml:/traefik/traefik.yml:ro
    - ./traefik/runtime/config.yml:/traefik/config.yml:ro
    - ./traefik/runtime/acme.json:/traefik/acme.json
    - ./traefik/runtime/logs:/traefik/logs
  environment:
    - CLOUDFLARE_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
```

### Step 4: Start Services

```bash
# For PostgreSQL
docker compose -f docker-compose-traefik.yml --profile postgres up -d

# For SQLite
docker compose -f docker-compose-traefik.yml --profile sqlite up -d
```

### Step 6: Verify

```bash
# Check container status
docker compose -f docker-compose-traefik.yml ps

# Check Traefik logs
docker compose -f docker-compose-traefik.yml logs -f traefik

# Check certificate generation
tail -f traefik/runtime/logs/traefik.log | grep -i "certificate\|acme"
```

---

## Cloudflare DNS Challenge

### Why DNS Challenge?

Traditional HTTP challenge requires port 80 to be publicly accessible. DNS challenge works by:
1. Let's Encrypt asks you to create a TXT record
2. Traefik uses Cloudflare API to create the record
3. Let's Encrypt verifies the record
4. Certificate is issued

**Benefits**:
- ✅ Works behind firewalls
- ✅ No need to expose port 80
- ✅ Can generate wildcard certificates
- ✅ More secure

### Getting Cloudflare API Token

1. **Login to Cloudflare** → https://dash.cloudflare.com
2. **Go to Profile** → My Profile → API Tokens
3. **Create Token** → Use "Edit zone DNS" template
4. **Permissions**:
   - Zone → DNS → Edit
   - Zone Resources → Include → Specific zone → `yourdomain.com`
5. **Copy Token** - You'll only see it once!

### Token Permissions Required

```
Zone:DNS:Edit for zone yourdomain.com
```

### Testing DNS Challenge

Watch the logs during certificate generation:

```bash
docker compose -f docker-compose-traefik.yml logs -f traefik | grep -i "dns\|cloudflare\|acme"
```

You should see:
```
Testing certificate renew...
Cloudflare DNS challenge
Certificate obtained for domain your-instrada-ogm.com
```

---

## Switching Between Staging and Production

### Why Use Staging First?

Let's Encrypt has **rate limits**:
- 50 certificates per domain per week
- 5 failed validations per hour

**Always test with staging first!**

### Using Staging (Testing)

Edit `runtime/.env.traefik`:
```bash
ACME_SERVER=staging
```

Regenerate config:
```bash
./generate-config.sh
```

Restart Traefik:
```bash
docker compose -f docker-compose-traefik.yml restart traefik
```

### Switching to Production

1. **Verify staging works** - Check logs for successful certificate
2. **Edit configuration**:
   ```bash
   ACME_SERVER=production
   ```
3. **Regenerate config**:
   ```bash
   ./generate-config.sh
   ```
4. **Delete staging certificate**:
   ```bash
   rm traefik/runtime/acme.json
   touch traefik/runtime/acme.json
   chmod 600 traefik/runtime/acme.json
   ```
5. **Restart Traefik**:
   ```bash
   docker compose -f docker-compose-traefik.yml restart traefik
   ```
6. **Monitor logs**:
   ```bash
   docker compose -f docker-compose-traefik.yml logs -f traefik
   ```

### Verifying Certificate

```bash
# Check certificate issuer
openssl s_client -connect your-instrada-ogm.com:443 -servername your-instrada-ogm.com < /dev/null 2>/dev/null | openssl x509 -noout -issuer

# Staging shows: (STAGING) Tenuous Tomato
# Production shows: R3 or R10 (Let's Encrypt)
```

---



## Troubleshooting

### Common Issues

#### 1. Certificate Not Generating

**Symptoms**:
```
ERR Unable to obtain ACME certificate
```

**Solutions**:

1. **Check Cloudflare API Token**:
   ```bash
   # Verify token is set
   docker compose -f docker-compose-traefik.yml exec traefik env | grep CLOUDFLARE
   ```

2. **Check DNS propagation**:
   ```bash
   # Verify domain points to your server
   dig your-instrada-ogm.com
   nslookup your-instrada-ogm.com
   ```

3. **Check Cloudflare API token permissions**:
   - Must have `Zone:DNS:Edit` for the specific zone
   - Token must not be expired

4. **Enable debug logging**:
   ```bash
   # In runtime/.env.traefik
   LOG_LEVEL=DEBUG
   ```
   Regenerate config and restart

#### 2. Network Warnings

**Symptoms**:
```
Could not find network named "instradaogm_app_network"
```

**Solution**:
```bash
# Remove old network
docker network rm instradaogm_app_network

# Restart services
docker compose -f docker-compose-traefik.yml down
docker compose -f docker-compose-traefik.yml --profile postgres up -d
```

#### 3. Configuration Errors

**Symptoms**:
```
field not found, node: <field_name>
```

**Solution**:
1. Check YAML syntax in templates
2. Regenerate configuration:
   ```bash
   ./generate-config.sh
   ```
3. Validate configuration:
   ```bash
   ./validate.sh
   ```

#### 4. Real IP Not Detected

**Symptoms**:
- Application shows Traefik's IP instead of client IP
- Access rules not working correctly

**Solution**:

1. **Check trusted IPs** in `runtime/.env.traefik`:
   ```bash
   TRUSTED_IP_RANGE=192.168.0.0/16
   ```

2. **Verify headers** in application logs:
   ```bash
   docker compose -f docker-compose-traefik.yml logs instrada-ogm | grep "X-Real-IP"
   ```

3. **Check Traefik config**:
   ```yaml
   # In traefik.yml
   entryPoints:
     websecure:
       forwardedHeaders:
         trustedIPs:
           - "192.168.0.0/16"
   ```

---

## Maintenance

### Regular Tasks

#### Certificate Renewal

Traefik automatically renews certificates 30 days before expiration. No action needed!

**Verify auto-renewal**:
```bash
# Check logs for renewal attempts
grep -i "renew" traefik/runtime/logs/traefik.log
```

#### Backup acme.json

**Important**: Backup your certificates!

```bash
# Backup script
#!/bin/bash
BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)
cp traefik/runtime/acme.json "$BACKUP_DIR/acme_$DATE.json"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/acme_*.json | tail -n +11 | xargs rm -f
```

### Security Best Practices

1. **Never commit secrets**:
   - `runtime/.env.traefik` should be in `.gitignore`
   - `runtime/acme.json` should be in `.gitignore`

2. **Restrict acme.json permissions**:
   ```bash
   chmod 600 traefik/runtime/acme.json
   ```

3. **Use strong API tokens**:
   - Limit Cloudflare token to specific zone
   - Rotate tokens periodically

---

## Quick Reference

### File Locations

| File | Purpose | Commit? |
|------|---------|---------|
| `templates/*.template` | Configuration templates | ✅ Yes |
| `templates/.env.traefik.example` | Example environment vars | ✅ Yes |
| `runtime/.env.traefik` | Actual configuration | ❌ No (secrets!) |
| `runtime/traefik.yml` | Generated static config | ❌ No (generated) |
| `runtime/config.yml` | Generated dynamic config | ❌ No (generated) |
| `runtime/acme.json` | SSL certificates | ❌ No (secrets!) |
| `runtime/logs/` | Log files | ❌ No |

### Common Commands

```bash
# Generate configuration
./generate-config.sh

# Start services (PostgreSQL)
docker compose -f docker-compose-traefik.yml --profile postgres up -d

# Restart Traefik
docker compose -f docker-compose-traefik.yml restart traefik

# View logs
docker compose -f docker-compose-traefik.yml logs -f traefik

# View dashboard
open http://localhost:8080/dashboard/
```

## Section Navigation

### Traefik Documentation
- [📋 Traefik Overview](./README.md) - Main Traefik documentation
- [🔧 DNS Providers Quick Reference](./DNS_PROVIDERS_QUICK_REFERENCE.md) - DNS provider configuration
- [🔧 Proxy Settings](../docs/CONFIGURATION/TRAEFIK-PROXY-SETTINGS.md) - Detailed proxy configuration

---

## Related Documentation

- [📚 Documentation Home](../docs/DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../docs/SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 Configuration](../docs/CONFIGURATION/) - System configuration

---

## Getting Help

- [📋 Documentation Index](../docs/DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Traefik Section](./) - Traefik-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report Traefik issues

---

**Last Updated**: 2025-11-07 | **Section**: Traefik | **Category**: Configuration
