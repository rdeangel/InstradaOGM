# CADDY PROXY SETTINGS FOR InstradaOGM

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Configuration](./)

## Overview

InstradaOGM **requires** a reverse proxy (Nginx, Caddy, Traefik) as it does not provide native HTTPS support.

## 🚨 CRITICAL SECURITY WARNING

**Exposing InstadaOGM to the internet is almost as dangerous as exposing your OPNsense admin interface directly.** InstadaOGM provides:
- Complete network topology information
- Direct firewall management access
- Device details (MAC addresses, hostnames)
- **HTTPS API access to your OPNsense firewall**

**Recommended**: Use VPN-only access or internal networks only.

## 🔒 Additional Security Layer: Global Self-Service Disable

For environments that don't require end-user self-service functionality, InstadaOGM provides a **Global Self-Service Disable** feature:

- **Complete Removal**: Disables all self-service functionality at the application level
- **API Protection**: Automatically disables unauthenticated APIs (like `/api/opnsense/ip-group-membership`)
- **Automatic Redirects**: Authenticated users are redirected to device management instead of self-service
- **Reduced Attack Surface**: Minimizes exposed functionality for admin-only deployments

**Configuration**: Available in Global Settings (SUPER_ADMIN only) - requires page refresh after changes.

### 🔐 **Important: Unauthenticated API Security**

**Unauthenticated APIs that make changes are strictly regulated by:**
- **IP-based access control**: Requests must originate from allowed networks
- **Rate limiting**: Prevents abuse and brute force attacks
- **Request validation**: Strict validation of all input parameters
- **Audit logging**: All changes are logged for security review
- **Self-service IP binding**: Users can only modify resources associated with their detected IP address

**Example**: The `/api/opnsense/ip-group-membership` endpoint (when enabled) only allows users to manage their own device's group membership based on their detected client IP. This is why **proper IP forwarding through the reverse proxy is CRITICAL** - without it, all users appear to have the same IP and security controls fail.

## 🔒 HTTPS Requirements

- **Internet-facing**: HTTPS is **MANDATORY** (valid certificates required)
- **Internal networks**: HTTPS strongly recommended
- **Multiple proxies**: Ensure proper header forwarding through the chain

## ⚠️ CRITICAL: IP Forwarding Headers

**These headers are MANDATORY** - InstadaOGM uses client IP for:
- Self-service access control (users can only manage their own IP)
- Allowed networks validation
- Login page functionality

### **Proxy Placement vs NAT**

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

## Required Headers Configuration

### 🚨 **SECURITY CRITICAL: Prevent Header Spoofing**

Caddy automatically adds `X-Forwarded-For` and `X-Forwarded-Proto` headers. Use `header_up` to set additional headers with the real client IP.

**Secure Configuration (Caddyfile):**
```caddyfile
your_domain.com {
    reverse_proxy your_backend_upstream {
        # Set headers with real client IP
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

### Header Explanations:

| Header | What It Does | Why It's Critical for InstradaOGM |
|--------|--------------|-----------------------------------|
| **`Host`** | Forwards the original hostname from client request | Ensures InstradaOGM responds to the correct domain name when hosting multiple sites |
| **`X-Real-IP`** | Passes the actual client IP address | **SECURITY**: Prevents IP spoofing attacks; enables accurate self-service access control based on real client IP |
| **`X-Forwarded-For`** | Creates a chain of IPs showing all proxies the request passed through | Helps with debugging and tracking request path through multiple proxy layers |
| **`X-Forwarded-Proto`** | Indicates whether client used http or https | Allows InstradaOGM to generate correct URLs (http vs https) for links and redirects |
| **`X-Forwarded-Host`** | Passes the original host header for URL generation | **CRITICAL**: Enables InstradaOGM to generate correct absolute URLs for email verification, password resets, and API endpoints |

## No-Cache Configuration

**Critical endpoints must not be cached:**

```caddyfile
your_domain.com {
    # API IP endpoint - no cache
    @api_ip path /api/ip
    handle @api_ip {
        reverse_proxy your_backend_upstream {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Forwarded-Host {host}
        }
        header Cache-Control "no-cache, no-store, must-revalidate"
        header Expires "0"
    }

    # API settings endpoint - no cache
    @api_settings path /api/settings/global
    handle @api_settings {
        reverse_proxy your_backend_upstream {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Forwarded-Host {host}
        }
        header Cache-Control "no-cache, no-store, must-revalidate"
        header Expires "0"
    }

    # All other requests
    reverse_proxy your_backend_upstream {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}

# HTTP to HTTPS redirect
http://your_domain.com {
    redir https://{host}{uri} permanent
}
```

## Complete Example (Docker Compose)

```yaml
version: '3.8'

services:
  caddy:
    image: caddy:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - ACME_AGREE=true

  ogm:
    image: your-ogm-image:latest
    expose:
      - "3000"
    environment:
      - NODE_ENV=production

volumes:
  caddy_data:
  caddy_config:
```

**Caddyfile for Docker Compose:**
```caddyfile
your_domain.com {
    # Upload Size Limit
    request_body {
        max_size 1GB
    }
    
    reverse_proxy ogm:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}

http://your_domain.com {
    redir https://{host}{uri} permanent
}
```

## Upload Size Configuration

**⚠️ Required for Backup Uploads**

InstradaOGM is configured to accept request bodies up to **1GB** to support large database backup uploads. Caddy must be configured to match this limit:

### Caddy Configuration

```caddyfile
your_domain.com {
    # Allow uploads up to 1GB for database backups
    request_body {
        max_size 1GB
    }
    
    reverse_proxy your_backend_upstream {
        # ... headers ...
    }
}
```

### Why This Is Needed

- **Streaming Uploads**: InstradaOGM uses streaming (busboy) to handle large files without loading them into memory
- **Proxy Limit**: Caddy default is 10MB, which will reject large backup uploads
- **Failure Mode**: Without this setting, backup uploads fail with "request body too large"

### Recommended Values

| Use Case | Recommended Size |
|----------|-----------------|
| **Production** | `1GB` (supports large database backups) |
| **Small Deployments** | `100MB` (sufficient for most backups) |
| **Development** | `1GB` (avoid upload issues during testing) |

> **Note**: The limit only applies when files are actually uploaded - it does not reserve memory or impact performance when handling small requests.

See [Backup Management](../FEATURES/BACKUP_MANAGEMENT.md#upload-size-limits) for troubleshooting upload failures.

## Testing

1. **Verify configuration**: `caddy validate --config Caddyfile`
2. **Check logs**: `caddy run` (or `docker logs caddy` for Docker)
3. **Verify IP detection**: Visit login page, check detected IP matches your real IP
4. **Test HTTPS**: `curl -I https://your-domain.com`

## Section Navigation

### Configuration Documentation
- [📋 Configuration Overview](./) - Section index and overview
- [🔐 SSO Provider Config](SSO_PROVIDER_CONFIG.md) - Configure single sign-on providers
- [🌐 Nginx Proxy Settings](NGINX-PROXY-SETTINGS.md) - Configure Nginx as reverse proxy
- [🌐 Traefik Proxy Settings](TRAEFIK-PROXY-SETTINGS.md) - Configure Traefik as reverse proxy
- [🔓 Allow HTTP Guide](ALLOW_HTTP_COMPREHENSIVE_GUIDE.md) - HTTP access configuration

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

## Troubleshooting

**Common Issues:**
- **Wrong IP detected**: Verify `header_up X-Real-IP {remote_host}` is set correctly
- **Self-service not working**: Verify detected IP matches client's real IP
- **All users show same IP**: Proxy is after NAT (problematic setup)
- **Header spoofing attack**: Ensure headers use `{remote_host}` not client-provided values
- **Certificate errors**: Verify domain DNS is configured correctly (Caddy uses ACME by default)
- **Login page shows wrong IP**: Check `/api/ip` endpoint is not cached

**Test IP Detection:**
```bash
curl https://your-domain.com/api/ip
```
Should return your real IP, not proxy/NAT IP.

---

**Last Updated**: 2025-11-06 | **Section**: Configuration | **Category**: Proxy Setup

