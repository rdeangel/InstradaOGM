# InstradaOGM Installation Guide

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Setup](./)

## Overview

This guide will help you get InstradaOGM up and running quickly using Docker. The Docker setup is the recommended approach as it handles all dependencies automatically and provides a consistent environment.

**Time to complete**: ~10 minutes

---

## Table of Contents

1. [Quick Start with Docker](#quick-start-with-docker) ⭐ **Recommended**
2. [Alternative: Local Development](#alternative-local-development)
3. [Advanced Configuration](#advanced-configuration)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start with Docker

The fastest way to get InstradaOGM running. All you need is Docker and Git.

### Prerequisites

- **Git** - For cloning the repository
- **Node.js 23+** - Required for npm scripts (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **Docker** - Container runtime (Docker Desktop for macOS/Windows, Docker Engine for Linux)

#### Install Docker

<details>
<summary><b>Linux (Ubuntu/Debian)</b></summary>

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (no sudo needed)
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```
</details>

<details>
<summary><b>macOS</b></summary>

```bash
# Using Homebrew
brew install --cask docker

# Or download Docker Desktop from:
# https://www.docker.com/products/docker-desktop/

# Start Docker Desktop and verify
docker --version
docker compose version
```
</details>

<details>
<summary><b>Windows (WSL2)</b></summary>

1. Install WSL2: `wsl --install` (run as Administrator)
2. Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
3. Enable WSL2 integration in Docker Desktop settings
4. Open Ubuntu/WSL2 terminal and verify:
```bash
docker --version
docker compose version
```
</details>

#### Install Node.js

<details>
<summary><b>Linux / macOS / WSL2</b></summary>

```bash
# Install nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell configuration
source ~/.bashrc  # or source ~/.zshrc for zsh

# Install Node.js 23
nvm install 23
nvm use 23
nvm alias default 23

# Verify installation
node --version  # Should show v23.x.x
npm --version
```
</details>

<details>
<summary><b>Windows (using nvm-windows)</b></summary>

1. Download and install [nvm-windows](https://github.com/coreybutler/nvm-windows/releases)
2. Open a new Command Prompt or PowerShell as Administrator
3. Run:
```bash
nvm install 23
nvm use 23

# Verify
node --version
npm --version
```
</details>

---

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/rdeangel/InstradaOGM.git
cd InstradaOGM
```

---

### Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env
```

**Edit `.env` and configure these required settings:**

```env
# OPNsense Configuration (Required)
OPNSENSE_URL=https://your-opnsense-firewall.domain.com
OPNSENSE_API_KEY=your_api_key_here
OPNSENSE_API_SECRET=your_api_secret_here

# Security (Required - generate with commands below)
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
BACKUP_ENCRYPTION_SECRET_KEY=generate_with_openssl_rand_hex_32

# Application URL (Required - update with your server IP/domain)
NEXTAUTH_URL=http://your-server-ip:3000
```

**Generate secure secrets:**

```bash
# Generate NextAuth secret
openssl rand -base64 32

# Generate backup encryption key
openssl rand -hex 32

# Copy these values into your .env file
```

> **💡 Tip**: To get your OPNsense API credentials:
> 1. Log into OPNsense
> 2. Go to **System > Access > Users**
> 3. Edit your user and go to **API Keys** tab
> 4. Click **+** to generate a new key/secret pair

---

### Step 3: Install Dependencies

```bash
# Upgrade npm to the latest version
npm install -g npm@latest

# Install project dependencies
npm install
```

This step is **required** before building Docker images as it ensures:
- ✅ You have the latest npm version with bug fixes and performance improvements
- ✅ All necessary packages are available for the build process

---

### Step 4: Prepare Database Directory (SQLite Only)

If you're using **SQLite**, create the database directory with correct permissions **before** starting Docker:

<details>
<summary><b>Option 1: Automated Setup Script (Recommended)</b></summary>

Use the provided script to automatically create directories and set correct permissions:

```bash
# Download the permission setup script
curl -o setup-data-permissions.sh https://raw.githubusercontent.com/rdeangel/InstradaOGM/main/setup-data-permissions.sh
chmod +x setup-data-permissions.sh

# Run the script to set correct permissions
sudo ./setup-data-permissions.sh ./data
```

The script will:
- Create the data directory and subdirectories (db, backups, temp)
- Set ownership to UID:GID 65532:65532 (container's `nextjs` user)
- Set appropriate permissions (755 for directories, 644 for files)
- Verify the configuration

**Use this if:** You want a quick, automated setup with verification.

</details>

<details>
<summary><b>Option 2: Container-Only Access (Manual)</b></summary>

Set ownership to UID 65532 (the container's `nextjs` user):

```bash
# Create directory
mkdir -p data/db

# Set ownership to container user (UID 65532)
sudo chown 65532:65532 data/db

# Set permissions (owner can read/write/execute)
chmod 755 data/db
```

**Use this if:** You only need the container to access the database.

</details>

<details>
<summary><b>Option 3: Shared Access (You + Container)</b></summary>

Allow both your user and the container to access the database:

```bash
# Create directory
mkdir -p data/db

# Set ownership (your user owns, container group can access)
sudo chown $(id -u):65532 data/db

# Set permissions (owner and group can read/write/execute)
chmod 775 data/db
```

**Use this if:** You want to access the database files directly (e.g., for backups, inspection with `sqlite3`).

</details>

> **Note**: If you skip this step, Docker will create the directory as `root`, and the container won't be able to write to the database.

---

### Step 5: Run with Docker

**Choose your database:**

#### Option A: SQLite (Recommended for Testing)
```bash
# Start the application
npm run docker:up:sqlite

# View logs (optional)
npm run docker:logs:sqlite
```

#### Option B: PostgreSQL (Recommended for Production)
```bash
# Start the application  
npm run docker:up:postgres

# View logs (optional)
npm run docker:logs:postgres
```

The application will:
- ✅ Build the Docker image
- ✅ Install all dependencies
- ✅ Set up the database
- ✅ Start the application

**Access the application**: Open your browser to the URL you set in `NEXTAUTH_URL` (e.g., `http://localhost:3000`)

---

### Step 6: Stop the Application

```bash
# For SQLite
npm run docker:down:sqlite

# For PostgreSQL
npm run docker:down:postgres
```

---

## Alternative: Local Development

If you need to develop locally without Docker (e.g., for debugging, IDE integration), follow these steps.

### Prerequisites

- **Node.js 23+** (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **Git**
- **Database Tools** (for backups/restores):
  - `sqlite3` (for SQLite)
  - `postgresql-client-16` (for PostgreSQL, must match server version)

<details>
<summary><b>Install Node.js with nvm (Recommended)</b></summary>

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell
source ~/.bashrc  # or source ~/.zshrc for zsh

# Install Node.js 23
nvm install 23
nvm use 23
nvm alias default 23

# Verify
node --version  # Should show v23.x.x
```
</details>

<details>
<summary><b>Install Database Tools</b></summary>

**Linux (Ubuntu/Debian):**
```bash
# SQLite
sudo apt update
sudo apt install -y sqlite3

# PostgreSQL client (version 16 - must match server)
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/postgresql.list
sudo apt update
sudo apt install -y postgresql-client-16

# Verify
sqlite3 --version
pg_dump --version  # Should show 16.x
```

**macOS:**
```bash
brew install sqlite postgresql@16

# Verify
sqlite3 --version
pg_dump --version  # Should show 16.x
```
</details>

---

### Local Development Setup
 
 ```bash
 # Clone repository
 git clone https://github.com/rdeangel/InstradaOGM.git
 cd InstradaOGM
 
 # Install dependencies
 npm install
 
 # Create environment file
 cp .env.example .env
 # Edit .env with your configuration (see Docker setup above)
 
 # Set database URL for local SQLite
 # In .env: DATABASE_URL=file:./data/db/dev.db
 
 # 1. Prepare Configuration
 # Switch to your intended database type (sqlite or postgres)
 npm run db:switch:sqlite
 # OR for PostgreSQL: npm run db:switch:postgres

 # 2. Initialize Database
 # This script checks your env, verifies schema, and runs migrations
 npm run db:init
 
 # 3. Generate Client & Seed
 npm run prisma:generate
 npm run prisma:seed
 
 # 4. Start Server
 npm run dev
 ```
 
 **Access**: Open `http://localhost:3000`

---

## Advanced Configuration

### Using PostgreSQL Database

PostgreSQL is recommended for production deployments.

**In your `.env` file, configure:**

```env
# PostgreSQL Configuration
POSTGRES_USER=instrada-ogm-user
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_HOST=instrada-ogm-postgres-db  # For Docker
# POSTGRES_HOST=localhost                # For local PostgreSQL
POSTGRES_PORT=5432
POSTGRES_DB=instrada-ogm

# Database URL
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public
```

**For Docker:** Use `npm run docker:up:postgres`

**For local PostgreSQL server:**
1. Install PostgreSQL 16 on your system
2. Create the database and user
3. Update `POSTGRES_HOST=localhost` in `.env`
4. Run migrations: `npx prisma db push`

---

### Authentication Settings

Configure authentication behavior in `.env`:

```env
# Enable local login (username/password)
AUTH_ALLOW_LOCAL_LOGIN=true

# Enable Two-Factor Authentication
AUTH_ALLOW_LOCAL_2FA=true

# Password requirements
AUTH_PASSWORD_MIN_LENGTH=8
```

---

### Application Port Configuration

```env
# Change the application port (default: 3000)
PORT=3001

# Update NEXTAUTH_URL to match
NEXTAUTH_URL=http://your-server-ip:3001
```

**For Docker:** Update the port mapping in `docker-compose.yml` to match.

---

### Container-Specific URL Configuration

For advanced Docker/Kubernetes deployments where internal API calls need a different URL than the public URL:

```env
# Public-facing URL (always required)
NEXTAUTH_URL=https://your-domain.com

# Internal container URL (optional - only if different from NEXTAUTH_URL)
INTERNAL_APP_URL=http://app:3000
# or for Kubernetes:
# INTERNAL_APP_URL=http://instrada-ogm-service:3000
```

> **Note**: Most users only need `NEXTAUTH_URL`. The `INTERNAL_APP_URL` is only needed for complex container orchestration scenarios.

---

## Verification

### Check Application Status

```bash
# Test if the application is running
curl http://localhost:3000

# Or open in browser
open http://localhost:3000
```

**Expected**: You should see the InstradaOGM login page.

---

### Verify Docker Containers

```bash
# List running containers
docker ps

# Check logs
docker logs instrada-ogm-app-1

# Monitor resource usage
docker stats
```

---

### Test Database Connection

**SQLite:**
```bash
# Show tables
sqlite3 data/db/dev.db ".tables"

# Check migrations
sqlite3 data/db/dev.db "SELECT * FROM _prisma_migrations;"
```

**PostgreSQL:**
```bash
# Load environment variables
source .env

# Test connection
PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -p 5432 -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT version();"

# Show tables
PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -p 5432 -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "\dt"
```

---

### Test API Endpoints

```bash
# Health check
curl http://localhost:3000/api/health

# Test OPNsense connection (requires authentication)
curl -X GET "http://localhost:3000/api/opnsense/aliases" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Troubleshooting

### Port Already in Use

**Error**: `Port 3000 is already in use`

```bash
# Find what's using the port
sudo lsof -i :3000

# Kill the process
sudo kill -9 <PID>

# Or change the port in .env
PORT=3001
NEXTAUTH_URL=http://localhost:3001
```

---

### Docker Permission Issues

**Error**: `permission denied while trying to connect to the Docker daemon socket`

```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Apply group membership (or log out and back in)
newgrp docker

# Verify
docker ps
```

---

### Database Connection Failed

**SQLite:**
```bash
# Check file permissions
ls -la data/db/

# Create directory if missing
mkdir -p data/db

# Fix permissions
chmod 755 data/db
```

**PostgreSQL:**
```bash
# Check if PostgreSQL container is running
docker ps | grep postgres

# Check PostgreSQL logs
docker logs instrada-ogm-postgres-db-1

# Verify connection
source .env
PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -p 5432 -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT 1;"
```

---

### PostgreSQL Version Mismatch

**Error**: `pg_dump: error: aborting because of server version mismatch`

This occurs when backup/restore tools don't match the PostgreSQL server version (16.x).

**Solution for Linux:**
```bash
# Remove old PostgreSQL client
sudo apt remove -y postgresql-client postgresql-client-*

# Add PostgreSQL official repository
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/postgresql.list

# Install PostgreSQL 16 client
sudo apt update
sudo apt install -y postgresql-client-16

# Verify
pg_dump --version  # Should show 16.x
```

**Solution for macOS:**
```bash
brew uninstall postgresql
brew install postgresql@16
brew link postgresql@16 --force

# Verify
pg_dump --version  # Should show 16.x
```

---

### Docker Build Issues

```bash
# Clear Docker cache
docker system prune -a

# Rebuild without cache
docker compose -f docker-compose-sqlite.yml build --no-cache
# or
docker compose -f docker-compose-postgres.yml build --no-cache
```

---

### Application Won't Start

```bash
# Check Docker logs
docker logs instrada-ogm-app-1

# Common issues to look for:
# - Missing environment variables
# - Database connection errors
# - Port conflicts

# Enable debug logging
# Add to .env:
APP_DEBUG_LEVEL=DEBUG

# Restart containers
npm run docker:down:sqlite && npm run docker:up:sqlite
```

---

### Missing Dependencies (Local Development)

```bash
# Clear npm cache
npm cache clean --force

# Remove and reinstall
rm -rf node_modules package-lock.json
npm install

# Regenerate Prisma client
npm run prisma:generate
```

---

### Getting Help

1. **Check Logs**: Use `docker logs <container_name>` or console output
2. **Documentation**: Review the comprehensive docs in `/docs`
3. **GitHub Issues**: Search for similar problems or create a new issue
4. **Debug Mode**: Set `APP_DEBUG_LEVEL=DEBUG` in `.env` for detailed logging

---

## Next Steps

After successful installation:

1. **Create Admin Account**: Register your first user (will be admin by default)
2. **Configure OPNsense**: Verify API connectivity in Settings
3. **Set Up Network Groups**: Create network groups in OPNsense
4. **Test Device Management**: Try device search and group assignments
5. **Explore Features**: Review the [API Documentation](../api/api_docs/API_Index.md)

---

## Additional Resources

- [Environment Configuration Guide](./ENVIRONMENT_SETUP_GUIDE.md) - Detailed environment variable reference
- [Database Configuration Guide](./DATABASE_CONFIGURATION_GUIDE.md) - Database setup and migrations
- [Docker Versioning Guide](./DOCKER_VERSIONING.md) - Docker image versioning strategy
- [API Documentation](../api/api_docs/API_Index.md) - Complete API reference

---

## Section Navigation

### Setup Documentation
- [📋 Setup Overview](./) - Section index and overview
- [🔧 Environment Setup](./ENVIRONMENT_SETUP_GUIDE.md) - Environment configuration
- [🗄️ Database Configuration](./DATABASE_CONFIGURATION_GUIDE.md) - Database setup
- [🐳 Docker Versioning](./DOCKER_VERSIONING.md) - Docker image versioning

### Related Documentation
- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🔧 Configuration](../CONFIGURATION/) - System configuration
- [📖 API Reference](../api/api_docs/API_Index.md) - API documentation

---

**Congratulations!** You now have InstradaOGM up and running. 🎉

For questions or issues, please refer to the [Troubleshooting](#troubleshooting) section or [create an issue on GitHub](https://github.com/rdeangel/InstradaOGM/issues).