<div align="center">
  <img src="https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/public/images/InstradaOGM-logo.svg" alt="InstradaOGM Logo" width="150" height="150">
  <h1>InstradaOGM - Docker Deployment Guide (SQLite)</h1>
  <p><strong>Quick Start Guide for deploying InstradaOGM with SQLite database using Docker</strong></p>
</div>

[⬆️ Back to Deployment Guides](./README.md) | [📚 Documentation Home](../DOCUMENTATION_INDEX.md) | [🐘 View PostgreSQL Guide](./DOCKER_DEPLOYMENT_POSTGRES.md)

---

## 📦 Docker Images

InstradaOGM images are available from both **Docker Hub** and **GitHub Container Registry (GHCR)**. Both registries contain identical multi-architecture images supporting `linux/amd64` and `linux/arm64`.

### Docker Hub
- **SQLite Image:** `rdeangel/instrada-ogm-sqlite`
- **Tags:** `latest`, `X.X.X` (specific versions, e.g., `1.0.1`)
- **Repository (sqlite):** [Docker Hub - InstradaOGM SQLite](https://hub.docker.com/r/rdeangel/instrada-ogm-sqlite)

### GitHub Container Registry (GHCR)
- **SQLite Image:** `ghcr.io/rdeangel/instrada-ogm-sqlite`
- **Tags:** `latest`, `X.X.X` (specific versions, e.g., `1.0.1`)
- **Repository (sqlite):** [GHCR - InstradaOGM SQLite](https://github.com/rdeangel/InstradaOGM/pkgs/container/instrada-ogm-sqlite)

### Pulling Images

**From Docker Hub (default):**
```bash
docker pull rdeangel/instrada-ogm-sqlite:latest
```

**From GitHub Container Registry:**
```bash
docker pull ghcr.io/rdeangel/instrada-ogm-sqlite:latest
```

**Specific version:**
```bash
# Docker Hub
docker pull rdeangel/instrada-ogm-sqlite:1.0.1

# GHCR
docker pull ghcr.io/rdeangel/instrada-ogm-sqlite:1.0.1
```

> **Note:** All images are multi-architecture and will automatically pull the correct version for your platform (amd64 or arm64). 
---

## 🎯 Deployment Options

Choose the deployment method that fits your environment:

### Option 1: HTTP Only (Development/Testing)
Simple setup without SSL certificates - ideal for local networks or testing.

### Option 2: HTTPS with Traefik (Production)
Production-ready setup with automatic SSL certificates via Let's Encrypt.

---

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- OPNsense firewall with API access (v23.1+, preferred v25.1+)
- Domain name (for HTTPS deployment)

---

## 🚀 Option 1: HTTP Deployment

### Step 1: Create Project Directory
```bash
mkdir instrada-ogm && cd instrada-ogm
```

### Step 2: Download Docker Compose File
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/docker-compose.yml
```

### Step 3: Create Environment Configuration
Create a `.env` file with the following configuration:

```bash
# =============================================================================
# InstradaOGM - SQLite HTTP Deployment Configuration
# =============================================================================

# --- Application Version ---
NEXT_PUBLIC_APP_VERSION=latest

# --- OPNsense Configuration (REQUIRED) ---
OPNSENSE_URL=https://your-opnsense-firewall.local
OPNSENSE_API_KEY=your_api_key_here
OPNSENSE_API_SECRET=your_api_secret_here

# For self-signed certificates (development only)
SKIP_SSL_VERIFICATION=true

# --- HTTP Configuration ---
ALLOW_HTTP=true
NEXTAUTH_URL=http://localhost:3000
PORT=3000

# --- Database Configuration (SQLite) ---
SQLITE_DB_NAME=instrada-ogm.db
DATABASE_URL=file:/app/data/db/instrada-ogm.db

# --- Security Configuration (REQUIRED) ---
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=CHANGE_THIS_TO_A_SECURE_RANDOM_STRING

# Generate with: openssl rand -hex 32
BACKUP_ENCRYPTION_SECRET_KEY=CHANGE_THIS_TO_A_64_CHARACTER_HEX_STRING

# --- Authentication ---
AUTH_ALLOW_LOCAL_LOGIN=true
AUTH_ALLOW_LOCAL_2FA=true
AUTH_PASSWORD_MIN_LENGTH=8

# --- Logging ---
APP_DEBUG_LEVEL=ERROR
NODE_ENV=production
```

### Step 4: Create Data Directory
```bash
mkdir -p data/db data/backups
```

**Option A: Using the automated setup script (recommended)**
```bash
# Download the permission setup script
curl -o setup-data-permissions.sh https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/setup-data-permissions.sh
chmod +x setup-data-permissions.sh

# Run the script to set correct permissions
sudo ./setup-data-permissions.sh ./data
```

**Option B: Manual permission setup**
```bash
# Set correct ownership for the application user (UID 65532)
sudo chown -R 65532:65532 data/
```

### Step 5: Start the Application
```bash
docker compose --profile sqlite up -d
```

### Step 6: Access the Application
Open your browser and navigate to:
- **Application:** `http://192.168.1.100:3000` (replace with your server's IP address)

### Step 7: Initial Setup

**Default Login Credentials:**
- **Username:** `admin`
- **Password:** `admin`

⚠️ **Important:** You will be required to change the admin password on first login for security.

1. Open your browser and navigate to `http://192.168.1.100:3000` (replace with your server's IP)
2. Log in with the default credentials above
3. You will be prompted to change the password immediately

---

## 🔒 Option 2: HTTPS Deployment with Traefik

### Step 1: Create Project Directory
```bash
mkdir instrada-ogm && cd instrada-ogm
```

### Step 2: Download Configuration Files
```bash
# Download Traefik compose file
curl -o docker-compose-traefik.yml https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/docker-compose-traefik.yml

# Download Traefik configuration scripts
mkdir -p traefik
cd traefik
curl -o generate-config.sh https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/traefik/generate-config.sh
curl -o validate.sh https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/traefik/validate.sh
chmod +x generate-config.sh validate.sh
cd ..
```

### Step 3: Create Main Environment Configuration
Create a `.env` file in the root directory:

```bash
# =============================================================================
# InstradaOGM - SQLite HTTPS Deployment Configuration
# =============================================================================

# --- Domain Configuration (REQUIRED for Traefik) ---
DOMAIN=your-instrada-ogm.com

# --- Application Version ---
NEXT_PUBLIC_APP_VERSION=latest

# --- OPNsense Configuration (REQUIRED) ---
OPNSENSE_URL=https://your-opnsense-firewall.local
OPNSENSE_API_KEY=your_api_key_here
OPNSENSE_API_SECRET=your_api_secret_here

# For self-signed certificates
SKIP_SSL_VERIFICATION=true

# --- HTTPS Configuration ---
ALLOW_HTTP=false
NEXTAUTH_URL=https://your-instrada-ogm.com
PORT=3000

# --- Database Configuration (SQLite) ---
SQLITE_DB_NAME=instrada-ogm.db
DATABASE_URL=file:/app/data/db/instrada-ogm.db

# --- Security Configuration (REQUIRED) ---
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=CHANGE_THIS_TO_A_SECURE_RANDOM_STRING

# Generate with: openssl rand -hex 32
BACKUP_ENCRYPTION_SECRET_KEY=CHANGE_THIS_TO_A_64_CHARACTER_HEX_STRING

# --- Authentication ---
AUTH_ALLOW_LOCAL_LOGIN=true
AUTH_ALLOW_LOCAL_2FA=true
AUTH_PASSWORD_MIN_LENGTH=8

# --- Logging ---
APP_DEBUG_LEVEL=ERROR
NODE_ENV=production
```

### Step 4: Configure Traefik
```bash
cd traefik
./generate-config.sh
```

Edit `traefik/runtime/.env.traefik`:
```bash
# Must match DOMAIN in main .env file
DOMAIN=your-instrada-ogm.com

# DNS Provider (cloudflare, route53, digitalocean, etc.)
DNS_PROVIDER=cloudflare

# DNS Provider Credentials (example for Cloudflare)
CLOUDFLARE_DNS_API_TOKEN=your_cloudflare_api_token_here

# Let's Encrypt Configuration
LETSENCRYPT_EMAIL=your-email@example.com

# Use staging for testing, production for live certificates
ACME_SERVER=staging
```

Run the configuration generator again to apply settings:
```bash
./generate-config.sh
./validate.sh
cd ..
```

### Step 5: Create Data Directory
```bash
mkdir -p data/db data/backups
```

**Option A: Using the automated setup script (recommended)**
```bash
# Download the permission setup script
curl -o setup-data-permissions.sh https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/setup-data-permissions.sh
chmod +x setup-data-permissions.sh

# Run the script to set correct permissions
sudo ./setup-data-permissions.sh ./data
```

**Option B: Manual permission setup**
```bash
# Set correct ownership for the application user (UID 65532)
sudo chown -R 65532:65532 data/
```

### Step 6: Start the Application
```bash
docker compose -f docker-compose-traefik.yml --profile sqlite up -d
```

### Step 7: Wait for Database Initialization
```bash
# Watch the logs until database is ready
docker compose -f docker-compose-traefik.yml --profile sqlite logs -f db
```

### Step 7: Access the Application
- **Application:** `https://your-instrada-ogm.com`
### Step 8: Initial Setup

**Default Login Credentials:**
- **Username:** `admin`
- **Password:** `admin`

⚠️ **Important:** You will be required to change the admin password on first login for security.

1. Open your browser and navigate to `https://your-instrada-ogm.com`
2. Log in with the default credentials above
3. You will be prompted to change the password immediately

### Step 8: Switch to Production SSL Certificates
Once you verify everything works with staging certificates:

1. Edit `traefik/runtime/.env.traefik` and change:
   ```bash
   ACME_SERVER=production
   ```

2. Regenerate configuration and restart:
   ```bash
   cd traefik && ./generate-config.sh && cd ..
   docker compose -f docker-compose-traefik.yml --profile sqlite down
   rm traefik/runtime/acme.json
   docker compose -f docker-compose-traefik.yml --profile sqlite up -d
   ```

---

## 🔧 Common Commands

### View Logs
```bash
# HTTP deployment
docker compose --profile sqlite logs -f

# HTTPS deployment
docker compose -f docker-compose-traefik.yml --profile sqlite logs -f
```

### Stop Services
```bash
# HTTP deployment
docker compose --profile sqlite down

# HTTPS deployment
docker compose -f docker-compose-traefik.yml --profile sqlite down
```

### Update to Latest Version
```bash
# HTTP deployment
docker compose --profile sqlite pull
docker compose --profile sqlite up -d

# HTTPS deployment
docker compose -f docker-compose-traefik.yml --profile sqlite pull
docker compose -f docker-compose-traefik.yml --profile sqlite up -d
```

### Backup Database
```bash
# Copy SQLite database file
cp data/db/instrada-ogm.db data/backups/instrada-ogm-$(date +%Y%m%d).db
```

---

## 📁 Directory Structure

```
instrada-ogm/
├── docker-compose.yml              # HTTP deployment
├── docker-compose-traefik.yml      # HTTPS deployment
├── .env                            # Main configuration
├── data/
│   ├── db/
│   │   └── instrada-ogm.db        # SQLite database
│   └── backups/                    # Application backups
└── traefik/                        # Traefik configuration (HTTPS only)
    ├── generate-config.sh
    ├── validate.sh
    └── runtime/
        ├── .env.traefik
        ├── traefik.yml
        ├── config.yml
        └── acme.json               # SSL certificates
```

---

## ⚙️ Configuration Reference

### Required Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `OPNSENSE_URL` | OPNsense firewall URL | `https://firewall.local` |
| `OPNSENSE_API_KEY` | OPNsense API key | Generated in OPNsense UI |
| `OPNSENSE_API_SECRET` | OPNsense API secret | Generated in OPNsense UI |
| `NEXTAUTH_SECRET` | JWT signing secret | `openssl rand -base64 32` |
| `BACKUP_ENCRYPTION_SECRET_KEY` | Backup encryption key | `openssl rand -hex 32` |

### Optional Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOW_HTTP` | `false` | Allow HTTP connections |
| `SQLITE_DB_NAME` | `instrada-ogm.db` | SQLite database filename |
| `APP_DEBUG_LEVEL` | `SILENT` | Logging level (SILENT/ERROR/WARN/INFO/DEBUG) |
| `SKIP_SSL_VERIFICATION` | `false` | Skip OPNsense SSL verification (dev only) |

---

## 🆘 Troubleshooting

### Container won't start
```bash
# Check logs
docker compose --profile sqlite logs instrada-ogm

# Verify .env file is present
ls -la .env

# Check environment variables are loaded
docker compose --profile sqlite config
```

### Cannot access application
```bash
# Verify container is running
docker compose --profile sqlite ps

# Check port binding
netstat -tuln | grep 3000

# Test local connection (or use your server IP)
curl http://localhost:3000
```

### Database permission issues
```bash
# Option A: Use the automated setup script (recommended)
curl -o setup-data-permissions.sh https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/setup-data-permissions.sh
chmod +x setup-data-permissions.sh
sudo ./setup-data-permissions.sh ./data

# Option B: Manual fix
sudo chown -R 65532:65532 data/
```

### Traefik SSL certificate issues
```bash
# Check Traefik logs
docker compose -f docker-compose-traefik.yml --profile sqlite logs traefik

# Verify DNS is resolving
nslookup your-instrada-ogm.com

# Check acme.json permissions
ls -la traefik/runtime/acme.json
# Should be: -rw------- (600)
```

---

## 📚 Additional Resources

### Deployment Guides
- [📄 Deployment Index](./README.md) - Overview and decision guide
- [🐘 PostgreSQL Deployment Guide](./DOCKER_DEPLOYMENT_POSTGRES.md) - Production-grade deployment option

### Documentation
- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Complete documentation index
- [🚀 Installation Guide](../SETUP/INSTALLATION_GUIDE.md) - Full installation and setup guide
- [⚙️ Environment Setup](../SETUP/ENVIRONMENT_SETUP_GUIDE.md) - Environment variable reference
- [🗄️ Database Configuration](../SETUP/DATABASE_CONFIGURATION_GUIDE.md) - Database setup and migrations
- [🔍 API Documentation](../api/api_docs/API_Index.md) - Complete API reference
- [💾 Backup Management](../FEATURES/BACKUP_MANAGEMENT.md) - Backup and restore guide

### External Links
- **Full Documentation:** [GitHub Repository](https://github.com/rdeangel/InstradaOGM)
- **Issue Tracker:** [GitHub Issues](https://github.com/rdeangel/InstradaOGM/issues)
- **Docker Hub:** [instrada-ogm-sqlite](https://hub.docker.com/r/rdeangel/instrada-ogm-sqlite)

---

**Category**: Deployment | **Database**: SQLite | **Status**: Production Ready

## 📝 Notes

- **Default Login:** Username `admin`, Password `admin` (must be changed on first login)
- **SQLite** is ideal for small to medium deployments (< 10 users)
- Database is stored in `data/db/instrada-ogm.db`
- For high-traffic production environments, consider PostgreSQL deployment
- Regular backups are recommended - use the built-in backup feature
