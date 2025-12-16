# NGINX PROXY SETTINGS FOR InstradaOGM

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Configuration](./)

## Overview

InstradaOGM is designed to support **direct access** (HTTP) or access via a **reverse proxy** (HTTPS). A reverse proxy (Nginx, Caddy, Traefik) is **required** for HTTPS support as the application does not provide native TLS.

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

**Example**: The `/api/opnsense/ip-group-membership` endpoint (when enabled) only allows users to manage their own device's group membership based on their detected client IP. While InstradaOGM supports native IP detection for direct connections, if a reverse proxy is used, **proper IP forwarding is CRITICAL** - without it, all users appear to have the same IP and security controls fail.

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

**For direct client connections (most common):**
```nginx
# SECURE: Use real connecting IP, ignore client-provided headers
proxy_set_header Host $host;                    # Preserves original domain name requested by client
proxy_set_header X-Real-IP $remote_addr;        # Passes actual client IP address (prevents IP spoofing)
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # Tracks proxy chain for request routing
proxy_set_header X-Forwarded-Proto $scheme;    # Indicates original protocol (http/https) used by client
proxy_set_header X-Forwarded-Host $host;       # Enables correct URL generation in application
```

### Header Explanations:

| Header | What It Does | Why It's Critical for InstradaOGM |
|--------|--------------|-----------------------------------|
| **`Host $host`** | Forwards the original hostname from client request | Ensures InstradaOGM responds to the correct domain name when hosting multiple sites |
| **`X-Real-IP $remote_addr`** | Passes the actual client IP address from NGINX's connection | **SECURITY**: Prevents IP spoofing attacks; enables accurate self-service access control based on real client IP |
| **`X-Forwarded-For $proxy_add_x_forwarded_for`** | Creates a chain of IPs showing all proxies the request passed through | Helps with debugging and tracking request path through multiple proxy layers |
| **`X-Forwarded-Proto $scheme`** | Indicates whether client used http or https | Allows InstradaOGM to generate correct URLs (http vs https) for links and redirects |
| **`X-Forwarded-Host $host`** | Passes the original host header for URL generation | **CRITICAL**: Enables InstradaOGM to generate correct absolute URLs for email verification, password resets, and API endpoints |

**For trusted upstream proxies only:**
```nginx
# ONLY use if receiving from trusted proxy that validates headers
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

### **⚠️ Security Warning: Header Spoofing Attack**

**Vulnerable configuration** (`$proxy_add_x_forwarded_for` with direct clients):
- Attacker sends: `X-Forwarded-For: 192.168.1.100`
- NGINX creates: `X-Forwarded-For: 192.168.1.100, attacker.real.ip`
- InstadaOGM sees: `192.168.1.100` (spoofed IP!)
- **Result**: Attacker can access self-service as any IP

**Secure configuration** (`$remote_addr`):
- Attacker sends: `X-Forwarded-For: 192.168.1.100` (ignored)
- NGINX sets: `X-Forwarded-For: attacker.real.ip`
- InstadaOGM sees: `attacker.real.ip` (real IP only)
- **Result**: Attack prevented

## No-Cache Configuration

**Critical endpoints must not be cached:**

```nginx
location /api/ip {
    proxy_pass https://your_backend_upstream;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    expires off;
    proxy_set_header X-Forwarded-For $remote_addr;  # SECURE: Use real IP
    proxy_set_header X-Real-IP $remote_addr;        # Passes actual client IP address
    proxy_set_header Host $host;                    # Preserves original domain name
    proxy_set_header X-Forwarded-Proto $scheme;    # Indicates original protocol
}

location /api/settings/global {
    proxy_pass https://your_backend_upstream;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    expires off;
    proxy_set_header X-Forwarded-For $remote_addr;  # SECURE: Use real IP
    proxy_set_header X-Real-IP $remote_addr;        # Passes actual client IP address
    proxy_set_header Host $host;                    # Preserves original domain name
    proxy_set_header X-Forwarded-Proto $scheme;    # Indicates original protocol
}
```

## Complete Example

```nginx
server {
    listen 443 ssl http2;
    server_name your_domain.com;

    # SSL Configuration
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Upload Size Limit
    # Allow 1GB uploads for database backup files
    client_max_body_size 1G;

    location / {
        proxy_pass https://your_backend_upstream;
        proxy_set_header X-Forwarded-For $remote_addr;  # SECURE: Use real IP
        proxy_set_header X-Real-IP $remote_addr;        # Passes actual client IP address
        proxy_set_header Host $host;                    # Preserves original domain name
        proxy_set_header X-Forwarded-Proto $scheme;    # Indicates original protocol
        proxy_set_header X-Forwarded-Host $host;       # Enables correct URL generation
    }

    location /api/ip {
        proxy_pass https://your_backend_upstream;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires off;
        proxy_set_header X-Forwarded-For $remote_addr;  # SECURE: Use real IP
        proxy_set_header X-Real-IP $remote_addr;        # Passes actual client IP address
        proxy_set_header Host $host;                    # Preserves original domain name
        proxy_set_header X-Forwarded-Proto $scheme;    # Indicates original protocol
        proxy_set_header X-Forwarded-Host $host;       # Enables correct URL generation
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name your_domain.com;
    return 301 https://$server_name$request_uri;
}
```

## Upload Size Configuration

**⚠️ Required for Backup Uploads**

InstradaOGM is configured to accept request bodies up to **1GB** to support large database backup uploads. Your reverse proxy must be configured to match this limit:

### NGINX Configuration

```nginx
server {
    # ... other configuration ...
    
    # Allow uploads up to 1GB for database backups
    client_max_body_size 1G;
    
    # ... location blocks ...
}
```

### Why This Is Needed

- **Streaming Uploads**: InstradaOGM uses streaming (busboy) to handle large files without loading them into memory
- **Proxy Limit**: NGINX default is only 1MB, which will reject large backup uploads
- **Failure Mode**: Without this setting, backup uploads fail with "413 Request Entity Too Large"

### Recommended Values

| Use Case | Recommended Size |
|----------|-----------------|
| **Production** | `1G` (supports large database backups) |
| **Small Deployments** | `100M` (sufficient for most backups) |
| **Development** | `1G` (avoid upload issues during testing) |

> **Note**: The limit only applies when files are actually uploaded - it does not reserve memory or impact performance when handling small requests.

## Testing

1. **Test configuration**: `nginx -t`
2. **Reload**: `systemctl reload nginx`
3. **Verify IP detection**: Visit login page, check detected IP matches your real IP
4. **Test HTTPS**: `curl -I https://your-domain.com`

## Section Navigation

### Configuration Documentation
- [📋 Configuration Overview](./) - Section index and overview
- [🔐 SSO Provider Config](SSO_PROVIDER_CONFIG.md) - Configure single sign-on providers
- [🌐 Caddy Proxy Settings](CADDY-PROXY-SETTINGS.md) - Configure Caddy as reverse proxy
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
- **Wrong IP detected**: Check headers use `$remote_addr` not `$proxy_add_x_forwarded_for`
- **Self-service not working**: Verify detected IP matches client's real IP
- **All users show same IP**: Proxy is after NAT (problematic setup)
- **Header spoofing attack**: Client can fake IP if using `$proxy_add_x_forwarded_for`
- **Certificate errors**: Verify SSL certificate is valid
- **Login page shows wrong IP**: Check `/api/ip` endpoint is not cached

**Test IP Detection:**
```bash
curl https://your-domain.com/api/ip
```
Should return your real IP, not proxy/NAT IP.

---

**Last Updated**: 2025-11-06 | **Section**: Configuration | **Category**: Proxy Setup