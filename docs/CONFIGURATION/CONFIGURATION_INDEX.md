# Configuration Documentation

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md)

## Overview

This section contains comprehensive guides for configuring InstradaOGM after installation. From proxy settings and SSO integration to database queries and security configurations, you'll find detailed instructions for customizing your deployment.

---

## Getting Started

If you've just completed the installation, we recommend following this reading order:

1. [🔐 SSO Provider Config](SSO_PROVIDER_CONFIG.md) - Configure single sign-on authentication
2. [🌐 Proxy Settings](CADDY-PROXY-SETTINGS.md) - Set up reverse proxy (recommended for most users)
3. [🗄️ Database Queries](SAMPLE_DATABASE_QUERIES.md) - Understand database operations

---

## Configuration Documentation

### Authentication & Security
- [🔐 SSO Provider Config](SSO_PROVIDER_CONFIG.md) - Configure single sign-on providers (Authentik, OAuth, etc.)
- [🔓 Allow HTTP Comprehensive Guide](ALLOW_HTTP_COMPREHENSIVE_GUIDE.md) - Configure HTTP access and security considerations

### Proxy Configuration
- [🌐 Caddy Proxy Settings](CADDY-PROXY-SETTINGS.md) - Configure Caddy as a reverse proxy
- [🌐 Nginx Proxy Settings](NGINX-PROXY-SETTINGS.md) - Configure Nginx as a reverse proxy
- [🌐 Traefik Proxy Settings](TRAEFIK-PROXY-SETTINGS.md) - Configure Traefik as a reverse proxy

### Database & Data Management
- [🗄️ Database Schema Reference](DATABASE_SCHEMA_REFERENCE.md) - Comprehensive database schema documentation
- [🗄️ Prisma Migration Guide](PRISMA_MIGRATION_GUIDE.md) - Database schema migrations and updates
- [🔍 Sample Database Queries](SAMPLE_DATABASE_QUERIES.md) - Common database operations and examples
- [📡 DHCP Reservations](DHCP_RESERVATIONS.md) - Configure DHCP reservation settings

---

## Quick Reference

| Configuration Area | Document | Description |
|-------------------|----------|-------------|
| SSO Authentication | [SSO Provider Config](SSO_PROVIDER_CONFIG.md) | Configure identity providers |
| HTTP Access | [Allow HTTP Guide](ALLOW_HTTP_COMPREHENSIVE_GUIDE.md) | HTTP access configuration |
| Caddy Proxy | [Caddy Proxy Settings](CADDY-PROXY-SETTINGS.md) | Caddy reverse proxy setup |
| Nginx Proxy | [Nginx Proxy Settings](NGINX-PROXY-SETTINGS.md) | Nginx reverse proxy setup |
| Traefik Proxy | [Traefik Proxy Settings](TRAEFIK-PROXY-SETTINGS.md) | Traefik reverse proxy setup |
| Database Schema | [Database Schema Reference](DATABASE_SCHEMA_REFERENCE.md) | Complete database schema documentation |
| Database Migrations | [Prisma Migration Guide](PRISMA_MIGRATION_GUIDE.md) | Database schema updates |
| Database Queries | [Sample Database Queries](SAMPLE_DATABASE_QUERIES.md) | Common database operations |
| DHCP Settings | [DHCP Reservations](DHCP_RESERVATIONS.md) | DHCP reservation configuration |

---

## Proxy Configuration Comparison

| Proxy | Best For | Complexity | SSL/TLS |
|-------|----------|------------|---------|
| Caddy | Simple setups, automatic SSL | Low | ✅ Automatic |
| Nginx | High performance, custom needs | Medium | ⚙️ Manual |
| Traefik | Container orchestration | High | ✅ Automatic |

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Setup Guides](../SETUP/) - Installation and initial setup
- [🔍 API Reference](../api/api_docs/) - API documentation for developers
- [🆘 Troubleshooting](../TROUBLESHOOTING/) - Common issues and solutions

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report configuration problems
- [💬 Discussions](https://github.com/rdeangel/InstradaOGM/discussions) - Community discussions and help

---

**Last Updated**: 2025-11-06 | **Section**: Configuration | **Category**: System Configuration