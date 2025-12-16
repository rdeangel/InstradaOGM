# Traefik Configuration for InstradaOGM

[⬆️ Back to Documentation Home](../docs/DOCUMENTATION_INDEX.md)

## Overview

This directory contains Traefik reverse proxy configuration using a template-based system with automatic SSL certificates via Let's Encrypt DNS challenge.

**Supports 150+ DNS providers** including Cloudflare, Route53, DigitalOcean, Google Cloud DNS, Azure DNS, and more!

## 📁 Directory Structure

```
traefik/
├── templates/              # Template files (commit to git)
│   ├── traefik.yml.template
│   ├── config.yml.template
│   └── .env.traefik.example
│
├── runtime/                # Generated files (DO NOT commit - in .gitignore)
│   ├── .env.traefik       # Your configuration (contains secrets!)
│   ├── traefik.yml        # Generated static config
│   ├── config.yml         # Generated dynamic config
│   ├── acme.json          # SSL certificates
│   └── logs/              # Log files
│
├── generate-config.sh      # Configuration generator script
├── validate.sh             # Configuration validator
├── TRAEFIK_GUIDE.md       # Complete documentation
└── README.md              # This file
```

## 🚀 Quick Start

### 1. Generate Configuration

```bash
cd traefik
./generate-config.sh
```

### 2. Edit Configuration

Edit `runtime/.env.traefik` with your values:

```bash
# Required
DOMAIN=your-instrada-ogm.com
LETSENCRYPT_EMAIL=your-email@example.com
DNS_PROVIDER=cloudflare  # or route53, digitalocean, etc.

# DNS Provider Credentials (varies by provider)
CLOUDFLARE_DNS_API_TOKEN=your_token_here  # For Cloudflare
# AWS_ACCESS_KEY_ID=...                   # For Route53
# DO_AUTH_TOKEN=...                       # For DigitalOcean

# ACME Server
ACME_SERVER=staging  # Use staging for testing, production for real certs
```

**Note**: All Traefik configuration is now in `runtime/.env.traefik`. The main `.env` file no longer contains DNS provider credentials.

**Supported DNS Providers**: https://go-acme.github.io/lego/dns/

### 3. Regenerate Config Files

```bash
./generate-config.sh
```

### 4. Validate Configuration

```bash
./validate.sh
```

### 5. Start Services

```bash
cd ..
docker compose -f docker-compose-traefik.yml --profile postgres up -d
```

## Section Navigation

### Traefik Documentation
- [📖 Complete Guide](./TRAEFIK_GUIDE.md) - Comprehensive Traefik setup guide
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

## ⚠️ Important

- **Never commit** `runtime/` directory - it contains secrets!
- **Always edit** template files, not generated files
- **Regenerate** config after changes: `./generate-config.sh`

---

**Quick Links:**
- [Complete Guide](TRAEFIK_GUIDE.md)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
