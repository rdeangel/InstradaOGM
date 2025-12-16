# Traefik Reverse Proxy Guide for InstradaOGM

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Configuration](./)

## Overview

Complete guide for setting up and managing Traefik as a reverse proxy for InstradaOGM with automatic SSL certificates using Cloudflare DNS challenge.

---

## 📋 Table of Contents

1. [Security Warnings](#security-warnings)
2. [Overview](#overview)
3. [Quick Start](#quick-start)
4. [Architecture](#architecture)
5. [Configuration System](#configuration-system)
6. [Setup Instructions](#setup-instructions)
7. [DNS Challenge Configuration](#dns-challenge-configuration)
8. [IP Forwarding & Security](#ip-forwarding--security)
9. [Testing and Troubleshooting](#testing-and-troubleshooting)
10. [Maintenance & Operations](#maintenance--operations)
11. [Additional Resources](#additional-resources)

---

## Security Warnings

InstradaOGM **requires** a reverse proxy (Nginx, Caddy, Traefik) as it does not provide native HTTPS support.

### 🚨 CRITICAL SECURITY WARNING

**Exposing InstradaOGM to the internet is almost as dangerous as exposing your OPNsense admin interface directly.** InstradaOGM provides:
- Complete network topology information
- Direct firewall management access
- Device details (MAC addresses, hostnames)
- **HTTPS API access to your OPNsense firewall**

**Recommended**: Use VPN-only access or internal networks only.

### 🔒 Additional Security Layer: Global Self-Service Disable

For environments that don't require end-user self-service functionality, InstradaOGM provides a **Global Self-Service Disable** feature:

- **Complete Removal**: Disables all self-service functionality at the application level
- **API Protection**: Automatically disables unauthenticated APIs (like `/api/opnsense/ip-group-membership`)
- **Automatic Redirects**: Authenticated users are redirected to device management instead of self-service
- **Reduced Attack Surface**: Minimizes exposed functionality for admin-only deployments

**Configuration**: Available in Global Settings (SUPER_ADMIN only) - requires page refresh after changes.

### 🔐 Important: Unauthenticated API Security

**Unauthenticated APIs that make changes are strictly regulated by:**
- **IP-based access control**: Requests must originate from allowed networks
- **Rate limiting**: Prevents abuse and brute force attacks
- **Request validation**: Strict validation of all input parameters
- **Audit logging**: All changes are logged for security review
- **Self-service IP binding**: Users can only modify resources associated with their detected IP address

**Example**: The `/api/opnsense/ip-group-membership` endpoint (when enabled) only allows users to manage their own device's group membership based on their detected client IP. This is why **proper IP forwarding through the reverse proxy is CRITICAL** - without it, all users appear to have the same IP and security controls fail.

---

## Overview

### What is Traefik?

Traefik is a modern reverse proxy and load balancer that makes deploying microservices easy. It automatically discovers services and configures routing rules.

### Why Traefik for InstradaOGM?

- ✅ **Automatic SSL Certificates** - Let's Encrypt integration with auto-renewal
- ✅ **DNS Challenge Support** - Works behind firewalls using Cloudflare DNS
- ✅ **Docker Integration** - Automatic service discovery
- ✅ **Health Checks** - Monitors application health
- ✅ **HTTP to HTTPS Redirect** - Automatic security enforcement
- ✅ **Real IP Forwarding** - Proper client IP detection for access control

### HTTPS Requirements

- **Internet-facing**: HTTPS is **MANDATORY** (valid certificates required)
- **Internal networks**: HTTPS strongly recommended
- **Multiple proxies**: Ensure proper header forwarding through the chain

---

## Quick Start

### Prerequisites

1. **Domain name** pointing to your server
2. **DNS provider account** (Cloudflare, Route53, DigitalOcean, etc.)
3. **DNS provider API credentials** with DNS edit permissions
4. **Docker and Docker Compose** installed

### 5-Minute Setup

```bash
# 1. Navigate to traefik directory
cd traefik

# 2. Run the configuration generator
./generate-config.sh

# 3. Edit runtime/.env.traefik with your settings:
#    - DOMAIN: your-instrada-ogm.com
#    - LETSENCRYPT_EMAIL: your-email@example.com
#    - DNS_PROVIDER: cloudflare (or route53, digitalocean, etc.)
#    - DNS provider credentials (see provider-specific section below)
#    - ACME_SERVER: staging (for testing) or production

# 4. Regenerate config files
./generate-config.sh

# 5. Validate configuration
./validate.sh

# 6. Start services
cd .. && docker compose -f docker-compose-traefik.yml --profile sqlite up -d
```

**That's it!** Traefik will automatically:
- Generate SSL certificates via DNS challenge
- Renew certificates before expiration
- Forward client IPs to InstradaOGM
- Redirect HTTP to HTTPS

---

## Architecture

### Traffic Flow

1. **User Request** → `https://your-instrada-ogm.com`
2. **Traefik** receives request on port 443
3. **SSL Termination** - Traefik decrypts HTTPS using Let's Encrypt certificate
4. **Header Injection** - Adds `X-Real-IP`, `X-Forwarded-For`, etc.
5. **Routing** - Forwards to InstradaOGM container on port 3000
6. **Response** - InstradaOGM processes request with real client IP
7. **Encryption** - Traefik encrypts response and sends to user

### Certificate Generation Flow (DNS Challenge)

1. **Traefik** requests certificate from Let's Encrypt
2. **Let's Encrypt** provides DNS challenge (TXT record)
3. **Traefik** uses DNS provider API to create TXT record
4. **Let's Encrypt** verifies TXT record via DNS query
5. **Certificate issued** and stored in `acme.json`
6. **TXT record removed** automatically

**Advantages of DNS Challenge:**
- ✅ Works behind firewalls (no port 80 exposure needed)
- ✅ Works with internal servers
- ✅ Supports wildcard certificates
- ✅ No port forwarding required

---

## Configuration System

### Directory Structure

```
traefik/
├── templates/              # Template files (committed to git)
│   ├── traefik.yml.template
│   ├── config.yml.template
│   └── .env.traefik.example
├── runtime/                # Generated files (git-ignored)
│   ├── .env.traefik       # Your configuration (EDIT THIS)
│   ├── traefik.yml        # Generated static config
│   ├── config.yml         # Generated dynamic config
│   ├── acme.json          # SSL certificates
│   └── logs/              # Log files
├── generate-config.sh      # Configuration generator
└── validate.sh             # Configuration validator
```

### Configuration Workflow

```bash
# 1. Edit your configuration
nano traefik/runtime/.env.traefik

# 2. Generate config files from templates
cd traefik && ./generate-config.sh

# 3. Validate configuration
./validate.sh

# 4. Restart Traefik (if already running)
cd .. && docker compose -f docker-compose-traefik.yml restart traefik
```

### Template System

**How it works:**

```bash
# In runtime/.env.traefik
DOMAIN=your-instrada-ogm.com
DNS_PROVIDER=cloudflare

# In templates/config.yml.template
rule: "Host(`{{DOMAIN}}`)"

# In templates/traefik.yml.template
dnsChallenge:
  provider: {{DNS_PROVIDER}}

# After running generate-config.sh
# In runtime/config.yml
rule: "Host(`your-instrada-ogm.com`)"

# In runtime/traefik.yml
dnsChallenge:
  provider: cloudflare
```

**Key Points:**
- ✅ Templates are committed to git
- ✅ Runtime files are git-ignored
- ✅ Single source of truth: `runtime/.env.traefik`
- ✅ No hardcoded values in templates

### Understanding DOMAIN vs NEXTAUTH_URL

**CRITICAL CONCEPT**: You need to configure the domain in THREE places, and they must all match!

| Variable | Location | Used By | Format | Example |
|----------|----------|---------|--------|---------|
| `NEXTAUTH_URL` | `.env` | Application | With protocol | `https://your-domain.com` |
| `DOMAIN` | `.env` | Docker-compose Traefik labels | Without protocol | `your-domain.com` |
| `DOMAIN` | `traefik/runtime/.env.traefik` | Traefik SSL certificates | Without protocol | `your-domain.com` |

### Why Three Variables?

1. **`NEXTAUTH_URL` (in main `.env`)**
   - **Purpose**: Application authentication and redirects
   - **Used by**: NextAuth.js for OAuth callbacks, session management
   - **Format**: Full URL with protocol (`https://your-domain.com`)
   - **Why needed**: Application needs to know the full URL for redirects

2. **`DOMAIN` (in main `.env`)**
   - **Purpose**: Traefik routing rules in docker-compose
   - **Used by**: Docker-compose to inject into Traefik labels
   - **Format**: Domain only, no protocol (`your-domain.com`)
   - **Why needed**: Traefik routing rules use `Host()` matcher which expects domain only

3. **`DOMAIN` (in `traefik/runtime/.env.traefik`)**
   - **Purpose**: SSL certificate generation
   - **Used by**: Traefik ACME client for Let's Encrypt
   - **Format**: Domain only, no protocol (`your-domain.com`)
   - **Why needed**: Let's Encrypt needs domain for DNS challenge

### Correct Configuration Example

```bash
# In .env (project root)
NEXTAUTH_URL="https://your-instrada-ogm.com"
DOMAIN=your-instrada-ogm.com

# In traefik/runtime/.env.traefik
DOMAIN=your-instrada-ogm.com
DNS_PROVIDER=cloudflare
LETSENCRYPT_EMAIL=admin@yourdomain.com
```

### What Happens If They Don't Match?

| Mismatch | Result |
|----------|--------|
| `NEXTAUTH_URL` ≠ `DOMAIN` (in .env) | Authentication redirects to wrong URL, users can't log in |
| `DOMAIN` (in .env) ≠ `DOMAIN` (in traefik/.env.traefik) | SSL certificate for wrong domain, browser shows security warning |
| Missing `DOMAIN` in .env | Falls back to `your-instrada-ogm.com`, certificate generation fails |

---

## Setup Instructions

### Step 1: Set Domain Variables in Main `.env` File

**CRITICAL**: You need to set BOTH `DOMAIN` and `NEXTAUTH_URL` in the main `.env` file, and they must match!

**Why both variables?**
- **`NEXTAUTH_URL`**: Used BY THE APPLICATION for authentication (includes protocol: `https://`)
- **`DOMAIN`**: Used BY TRAEFIK for routing rules (no protocol, just domain name)

**They serve different purposes but must match:**

```bash
# Edit .env in project root
nano .env

# Add or update BOTH variables:
NEXTAUTH_URL="https://your-instrada-ogm.com"  # Application needs full URL
DOMAIN=your-instrada-ogm.com                   # Traefik needs domain only
```

**What happens if they don't match:**
- Traefik will try to get SSL certificates for the wrong domain
- You'll see errors like: `acme: error presenting token: cloudflare: failed to find zone`
- The application will be accessible at one domain but certificates will be for another

### Step 2: Generate Initial Traefik Configuration

```bash
cd traefik
./generate-config.sh
```

This creates `runtime/.env.traefik` from the example template.

### Step 3: Configure DNS Provider

Edit `runtime/.env.traefik` and configure your DNS provider:

**CRITICAL**: The `DOMAIN` value here must match BOTH:
1. The `DOMAIN` in your main `.env` file
2. The domain portion of `NEXTAUTH_URL` (without `https://`)

**Example of correct configuration:**
```bash
# In main .env file:
NEXTAUTH_URL="https://your-instrada-ogm.com"
DOMAIN=your-instrada-ogm.com

# In traefik/runtime/.env.traefik:
DOMAIN=your-instrada-ogm.com
```

All three must use the same domain name!

#### Option A: Cloudflare (Recommended)

```bash
# Domain Configuration
DOMAIN=your-instrada-ogm.com

# Let's Encrypt Configuration
LETSENCRYPT_EMAIL=your-email@example.com

# DNS Provider
DNS_PROVIDER=cloudflare

# Cloudflare Credentials
CLOUDFLARE_DNS_API_TOKEN=your_cloudflare_api_token_here

# ACME Server (use staging for testing)
ACME_SERVER=staging
```

**Get Cloudflare API Token:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit zone DNS" template
4. Select your domain under "Zone Resources"
5. Copy the token

#### Option B: AWS Route53

```bash
# Domain Configuration
DOMAIN=your-instrada-ogm.com

# Let's Encrypt Configuration
LETSENCRYPT_EMAIL=your-email@example.com

# DNS Provider
DNS_PROVIDER=route53

# AWS Credentials
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
# AWS_HOSTED_ZONE_ID=your_zone_id  # Optional

# ACME Server
ACME_SERVER=staging
```

#### Option C: DigitalOcean

```bash
# Domain Configuration
DOMAIN=your-instrada-ogm.com

# Let's Encrypt Configuration
LETSENCRYPT_EMAIL=your-email@example.com

# DNS Provider
DNS_PROVIDER=digitalocean

# DigitalOcean Credentials
DO_AUTH_TOKEN=your_digitalocean_token

# ACME Server
ACME_SERVER=staging
```

#### Option D: Other Providers

**Traefik supports 150+ DNS providers!**

See the complete list and provider-specific configuration:
- **Provider List**: https://go-acme.github.io/lego/dns/
- **Provider Documentation**: https://go-acme.github.io/lego/dns/[provider-name]/

**Popular providers:**
- **Gandi**: `DNS_PROVIDER=gandiv5` + `GANDIV5_API_KEY`
- **OVH**: `DNS_PROVIDER=ovh` + `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY`
- **Namecheap**: `DNS_PROVIDER=namecheap` + `NAMECHEAP_API_USER`, `NAMECHEAP_API_KEY`
- **Google Cloud DNS**: `DNS_PROVIDER=gcloud` + `GCE_PROJECT`, `GCE_SERVICE_ACCOUNT_FILE`
- **Azure DNS**: `DNS_PROVIDER=azuredns` + Azure credentials
- **Hetzner**: `DNS_PROVIDER=hetzner` + `HETZNER_API_KEY`
- **Vultr**: `DNS_PROVIDER=vultr` + `VULTR_API_KEY`

### Step 4: Generate Configuration Files

```bash
./generate-config.sh
```

This will:
- ✅ Validate your configuration
- ✅ Check DNS provider credentials
- ✅ Generate `runtime/traefik.yml` from template
- ✅ Generate `runtime/config.yml` from template
- ✅ Create `runtime/acme.json` with correct permissions

### Step 5: Validate Configuration

```bash
./validate.sh
```

This checks:
- ✅ All required files exist
- ✅ Environment variables are set
- ✅ DNS provider credentials are configured
- ✅ acme.json has correct permissions (600)
- ✅ Docker is running
- ✅ Ports 80, 443, 8080 are available

### Step 6: Start Traefik

```bash
cd ..
docker compose -f docker-compose-traefik.yml --profile sqlite up -d
```

Or with PostgreSQL:

```bash
docker compose -f docker-compose-traefik.yml --profile postgres up -d
```

### Step 7: Monitor Certificate Generation

```bash
# Watch Traefik logs
docker compose -f docker-compose-traefik.yml logs -f traefik

# Check for certificate generation
# You should see:
# - "Obtaining certificate for domain your-instrada-ogm.com"
# - DNS challenge creation
# - Certificate successfully obtained
```

### Step 8: Switch to Production (After Testing)

Once you've verified everything works with staging:

```bash
# 1. Update configuration
nano traefik/runtime/.env.traefik
# Change: ACME_SERVER=production

# 2. Regenerate config
cd traefik && ./generate-config.sh && cd ..

# 3. Stop Traefik
docker compose -f docker-compose-traefik.yml stop traefik

# 4. Delete staging certificate
rm traefik/runtime/acme.json
touch traefik/runtime/acme.json
chmod 600 traefik/runtime/acme.json

# 5. Restart Traefik
docker compose -f docker-compose-traefik.yml start traefik
```

---

## DNS Challenge Configuration

### Why DNS Challenge?

**Advantages over HTTP challenge:**
- ✅ Works behind firewalls (no need to expose port 80)
- ✅ Works with internal servers
- ✅ No port forwarding required
- ✅ Wildcard certificates supported
- ✅ More secure (no public HTTP endpoint needed)

**How it works:**
1. Let's Encrypt asks you to prove domain ownership
2. Traefik uses your DNS provider's API to create a TXT record
3. Let's Encrypt verifies the TXT record via DNS query
4. Certificate is issued
5. Traefik automatically removes the TXT record

### Supported DNS Providers

**Traefik supports 150+ DNS providers via Lego!**

**Popular providers:**
- Cloudflare
- AWS Route53
- DigitalOcean
- Google Cloud DNS
- Azure DNS
- OVH
- Gandi
- Namecheap
- Hetzner
- Vultr
- And 140+ more!

**Full list**: https://go-acme.github.io/lego/dns/

### Configuration

**Already configured in our templates!** The DNS challenge is set up in `traefik.yml.template`:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: {{LETSENCRYPT_EMAIL}}
      storage: /traefik/acme.json
      caServer: {{ACME_CA_SERVER}}
      dnsChallenge:
        provider: {{DNS_PROVIDER}}  # Configured via DNS_PROVIDER variable
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
        propagation:
          delayBeforeChecks: 30
        disablePropagationCheck: true
```

**Environment variables required:**
- `DNS_PROVIDER` - Your DNS provider name (e.g., `cloudflare`, `route53`, `digitalocean`)
- Provider-specific credentials - Set in `runtime/.env.traefik`

### Provider-Specific Setup

#### Cloudflare

**Required variables:**
```bash
DNS_PROVIDER=cloudflare
CLOUDFLARE_DNS_API_TOKEN=your_token_here
```

**Get API Token:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit zone DNS" template
4. Select your domain under "Zone Resources"
5. Copy the token

**Alternative (legacy):**
```bash
CLOUDFLARE_EMAIL=your-email@example.com
CLOUDFLARE_API_KEY=your_global_api_key
```

#### AWS Route53

**Required variables:**
```bash
DNS_PROVIDER=route53
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

**Optional:**
```bash
AWS_HOSTED_ZONE_ID=your_zone_id  # Speeds up DNS queries
```

**IAM Policy Required:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:GetChange",
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets"
      ],
      "Resource": [
        "arn:aws:route53:::hostedzone/*",
        "arn:aws:route53:::change/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "route53:ListHostedZonesByName",
      "Resource": "*"
    }
  ]
}
```

#### DigitalOcean

**Required variables:**
```bash
DNS_PROVIDER=digitalocean
DO_AUTH_TOKEN=your_digitalocean_token
```

**Get API Token:**
1. Go to https://cloud.digitalocean.com/account/api/tokens
2. Click "Generate New Token"
3. Give it a name and select "Write" scope
4. Copy the token

#### Google Cloud DNS

**Required variables:**
```bash
DNS_PROVIDER=gcloud
GCE_PROJECT=your_project_id
GCE_SERVICE_ACCOUNT_FILE=/path/to/service-account.json
```

**Setup:**
1. Create a service account in Google Cloud Console
2. Grant "DNS Administrator" role
3. Create and download JSON key
4. Mount is key file in docker-compose or copy to runtime/

#### OVH

**Required variables:**
```bash
DNS_PROVIDER=ovh
OVH_ENDPOINT=ovh-eu  # or ovh-ca, ovh-us, etc.
OVH_APPLICATION_KEY=your_app_key
OVH_APPLICATION_SECRET=your_app_secret
OVH_CONSUMER_KEY=your_consumer_key
```

**Get credentials:**
1. Go to https://eu.api.ovh.com/createApp/
2. Create application
3. Generate consumer key with DNS rights

#### Other Providers

For any other provider, see the provider-specific documentation:
- **Provider list**: https://go-acme.github.io/lego/dns/
- **Provider docs**: https://go-acme.github.io/lego/dns/[provider-name]/

Each provider page includes:
- Required environment variables
- Optional configuration
- Setup instructions
- Example usage

### Staging vs Production

**Always test with staging first!**

**Staging** (for testing):
```bash
# In runtime/.env.traefik
ACME_SERVER=staging
```
- Rate limits: 30,000 certificates per week
- Certificates are NOT trusted by browsers
- Use for testing configuration

**Production** (for real certificates):
```bash
# In runtime/.env.traefik
ACME_SERVER=production
```
- Rate limits: 50 certificates per week per domain
- Certificates are trusted by browsers
- Use only after testing with staging

---

## IP Forwarding & Security

### ⚠️ CRITICAL: Why IP Forwarding Matters

**These headers are MANDATORY** - InstradaOGM uses client IP for:
- Self-service access control (users can only manage their own IP)
- Allowed networks validation
- Login page functionality
- Security audit logging

### Proxy Placement vs NAT

**✅ Proxy BEFORE NAT (Works)**
```
Internet → Client → Reverse Proxy → NAT → InstradaOGM
```
InstradaOGM sees real client IP via headers.

**❌ Proxy AFTER NAT (Broken)**
```
Internet → Client → NAT → Reverse Proxy → InstradaOGM
```
InstradaOGM sees NAT IP even with proxy headers - self-service fails.

### How Traefik Handles IP Forwarding

**Traefik automatically forwards client IPs** when properly configured. Our template includes:

```yaml
# In traefik.yml (generated from template)
entryPoints:
  websecure:
    address: ":443"
    forwardedHeaders:
      trustedIPs:
        - "192.168.0.0/16"  # Your trusted network range
```

**Headers automatically added by Traefik:**
- `X-Real-IP` - Client's actual IP address
- `X-Forwarded-For` - Proxy chain
- `X-Forwarded-Proto` - Original protocol (http/https)
- `X-Forwarded-Host` - Original hostname

**Additional header set by our config:**
- `X-Forwarded-Proto: "https"` - Ensures app knows it's behind HTTPS

### 🚨 SECURITY: Prevent Header Spoofing

**Trusted IPs configuration is CRITICAL** to prevent attackers from spoofing headers.

**Configure in `runtime/.env.traefik`:**
```bash
# Only trust headers from your internal network
TRUSTED_IP_RANGE=192.168.0.0/16
```

This prevents external users from sending fake `X-Real-IP` headers to bypass access controls.

### Header Reference

| Header | What It Does | Why It's Critical |
|--------|--------------|-------------------|
| **`Host`** | Original hostname | Multi-site hosting, correct domain responses |
| **`X-Real-IP`** | Actual client IP | **SECURITY**: Access control, prevents IP spoofing |
| **`X-Forwarded-For`** | Proxy chain | Debugging, request path tracking |
| **`X-Forwarded-Proto`** | Original protocol | Correct URL generation (http vs https) |
| **`X-Forwarded-Host`** | Original host | Email links, password resets, API endpoints |

---

## Upload Size Configuration

**ℹ️ Good News: Traefik Handles Large Uploads by Default**

Unlike NGINX or Caddy, **Traefik does not impose a default request body size limit**. This means:

✅ **No additional configuration needed** for backup uploads


### When Manual Configuration Might Be Needed

**Only configure buffering if you experience issues with very large uploads:**

```yaml
# In traefik/runtime/config.yml (if needed)
http:
  middlewares:
    large-uploads:
      buffering:
        maxRequestBodyBytes: 1073741824  # 1GB in bytes
        memRequestBodyBytes: 10485760     # 10MB in memory
```

Then apply to your router:
```yaml
http:
  routers:
    instrada-ogm:
      middlewares:
        - large-uploads
```

**However, this is typically not necessary** - Traefik's default streaming behavior is sufficient for most use cases.

### Troubleshooting Upload Failures

If backup uploads fail, check:

1. **Traefik logs**: `docker compose -f docker-compose-traefik.yml logs traefik`
2. **Browser console**: Look for timeout or network errors

See [Backup Management](../FEATURES/BACKUP_MANAGEMENT.md#upload-size-limits) for more troubleshooting steps.

---

## Testing and Troubleshooting

### Verification Steps

**1. Check Traefik is running:**
```bash
docker compose -f docker-compose-traefik.yml ps
```

**2. Check logs:**
```bash
docker compose -f docker-compose-traefik.yml logs traefik
```

**3. Verify certificate generation:**
```bash
# Check acme.json has certificates
cat traefik/runtime/acme.json | jq '.letsencrypt.Certificates[0].domain'

# Should show your domain
```

**4. Test IP detection:**
```bash
curl https://your-domain.com/api/ip
```
Should return your real IP, not proxy/NAT IP.

**5. Test HTTPS:**
```bash
curl -I https://your-domain.com
```
Should return `HTTP/2 200` with valid SSL certificate.

### Common Issues

#### Certificate Not Generating - "zone could not be found"

**Symptoms:**
- Error: `acme: error presenting token: cloudflare: failed to find zone com.: zone could not be found`
- Traefik trying to get certificate for `your-instrada-ogm.com` instead of your actual domain

**Root Cause:**
The `DOMAIN` variable is not set in the main `.env` file, so docker-compose is using the fallback value `your-instrada-ogm.com` in Traefik routing labels.

**Solution:**
```bash
# 1. Add BOTH DOMAIN and NEXTAUTH_URL to main .env file
# They must match (domain portion only)!
echo "NEXTAUTH_URL=\"https://your-actual-domain.com\"" >> .env
echo "DOMAIN=your-actual-domain.com" >> .env

# 2. Verify all three match
grep NEXTAUTH_URL .env                    # Should show: https://your-actual-domain.com
grep DOMAIN .env                          # Should show: your-actual-domain.com
grep DOMAIN traefik/runtime/.env.traefik  # Should show: your-actual-domain.com

# 3. Restart services
docker compose -f docker-compose-traefik.yml down
docker compose -f docker-compose-traefik.yml --profile postgres up -d
```

**Why this happens:**
- **Traefik container** loads `traefik/runtime/.env.traefik` (has DOMAIN for SSL certificates)
- **InstradaOGM containers** load main `.env` file (needs DOMAIN for routing labels)
- **Docker-compose labels** use `${DOMAIN:-your-instrada-ogm.com}` which falls back to placeholder
- **Application** uses `NEXTAUTH_URL` for authentication redirects
- If DOMAIN is missing, Traefik tries to get certificate for placeholder domain
- If NEXTAUTH_URL doesn't match DOMAIN, authentication redirects go to wrong URL

**Understanding the variables:**
- `NEXTAUTH_URL`: Used BY THE APPLICATION (needs protocol: `https://your-domain.com`)
- `DOMAIN` (in .env): Used BY DOCKER-COMPOSE for Traefik routing labels (no protocol: `your-domain.com`)
- `DOMAIN` (in traefik/.env.traefik): Used BY TRAEFIK for SSL certificates (no protocol: `your-domain.com`)

#### Certificate Not Generating - DNS Provider Issues

**Symptoms:**
- `acme.json` is empty or has no certificates
- Logs show DNS challenge errors

**Solutions:**
```bash
# 1. Verify DNS provider credentials are correct
docker compose -f docker-compose-traefik.yml exec traefik env | grep -i cloudflare
# Or: grep -i route53, digitalocean, etc.

# 2. Check DNS provider token permissions
# Cloudflare: Must have Zone:DNS:Edit and Zone:Zone:Read
# Route53: Must have route53:ChangeResourceRecordSets permission
# DigitalOcean: Token must have write scope

# 3. Verify domain is managed by your DNS provider
# Domain must be in the DNS provider you configured

# 4. Check rate limits
# If you hit Let's Encrypt rate limits, wait or use staging
```

#### Wrong IP Detected

**Symptoms:**
- Login page shows wrong IP
- Self-service doesn't work
- All users show same IP

**Solutions:**
```bash
# 1. Verify trusted IPs configuration
cat traefik/runtime/traefik.yml | grep -A 5 "trustedIPs"

# 2. Check if proxy is after NAT (problematic)
# Proxy must be BEFORE NAT to see real IPs

# 3. Test IP detection endpoint
curl https://your-domain.com/api/ip

# 4. Check Traefik logs for header warnings
docker compose -f docker-compose-traefik.yml logs traefik | grep -i "forward"
```

#### SSL Certificate Errors

**Symptoms:**
- Browser shows "Not Secure"
- Certificate is for wrong domain
- Certificate is expired

**Solutions:**
```bash
# 1. Check if using staging certificate
cat traefik/runtime/acme.json | jq '.letsencrypt.Account.Registration.uri'
# Should show "acme-v02.api.letsencrypt.org" for production

# 2. Verify domain in certificate
openssl s_client -connect your-domain.com:443 -servername your-domain.com < /dev/null 2>/dev/null | openssl x509 -noout -text | grep DNS

# 3. Force certificate renewal
rm traefik/runtime/acme.json
touch traefik/runtime/acme.json
chmod 600 traefik/runtime/acme.json
docker compose -f docker-compose-traefik.yml restart traefik
```

#### Port Already in Use

**Symptoms:**
- Traefik won't start
- Error: "port is already allocated"

**Solutions:**
```bash
# 1. Check what's using the port
sudo lsof -i :80
sudo lsof -i :443

# 2. Stop conflicting service
sudo systemctl stop nginx  # or apache2, etc.

# 3. Or change Traefik ports in docker-compose-traefik.yml
```

### Validation Script

**Use the built-in validator:**
```bash
./traefik/validate.sh
```

This checks:
- ✅ All required files exist
- ✅ Configuration is valid
- ✅ Environment variables are set
- ✅ Docker is running
- ✅ Ports are available
- ✅ acme.json has correct permissions

---

## Maintenance & Operations

### Regular Tasks

```bash
# Check certificate expiration
cat traefik/runtime/acme.json | jq '.letsencrypt.Certificates[0].certificate' | base64 -d | openssl x509 -noout -dates

# View access logs
docker compose -f docker-compose-traefik.yml exec traefik cat /traefik/logs/access.log | tail -20

# View application logs
docker compose -f docker-compose-traefik.yml exec traefik cat /traefik/logs/traefik.log | tail -20

# Restart Traefik (if needed)
docker compose -f docker-compose-traefik.yml restart traefik
```

### Configuration Changes

```bash
# 1. Edit configuration
nano traefik/runtime/.env.traefik

# 2. Regenerate config files
cd traefik && ./generate-config.sh

# 3. Validate
./validate.sh

# 4. Restart Traefik (for static config changes)
cd .. && docker compose -f docker-compose-traefik.yml restart traefik

# Note: Dynamic config (config.yml) auto-reloads without restart
```

---

## Additional Resources

### Traefik Documentation
- **Official Docs**: https://doc.traefik.io/traefik/
- **ACME Configuration**: https://doc.traefik.io/traefik/https/acme/
- **Docker Provider**: https://doc.traefik.io/traefik/providers/docker/

### DNS Providers
- **Lego DNS Providers List**: https://go-acme.github.io/lego/dns/
- **Provider-Specific Docs**: https://go-acme.github.io/lego/dns/[provider-name]/

### Let's Encrypt
- **Rate Limits**: https://letsencrypt.org/docs/rate-limits/
- **Challenge Types**: https://letsencrypt.org/docs/challenge-types/
- **Staging Environment**: https://letsencrypt.org/docs/staging-environment/

### DNS Provider Dashboards
- **Cloudflare**: https://dash.cloudflare.com/
- **AWS Route53**: https://console.aws.amazon.com/route53/
- **DigitalOcean**: https://cloud.digitalocean.com/networking/domains
- **Google Cloud DNS**: https://console.cloud.google.com/net-services/dns
- **Azure DNS**: https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.Network%2FdnsZones

### InstradaOGM
- **Project Directory**: Project root directory
- **Traefik Configuration**: `traefik/runtime/.env.traefik`
- **Docker Compose**: `docker-compose-traefik.yml`

---

**Last Updated**: 2025-11-05
**Traefik Version**: 3.5.4
**Configuration System**: Template-based with runtime/.env.traefik
