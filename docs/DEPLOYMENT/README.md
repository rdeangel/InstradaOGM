# InstradaOGM - Docker Deployment Documentation

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md)

Quick access to deployment guides for InstradaOGM using Docker.

---

## 📦 Available Deployment Options

### 🗄️ SQLite Deployment
**Best for:** Development, testing, small deployments (< 10 users)

- **Docker Image:** `rdeangel/instrada-ogm-sqlite`
- **Guide:** [Docker Deployment Guide (SQLite)](DOCKER_DEPLOYMENT_SQLITE.md)
- **Features:**
  - ✅ Zero configuration database
  - ✅ Single file storage
  - ✅ Easy backups
  - ✅ Minimal resource requirements

---

### 🐘 PostgreSQL Deployment
**Best for:** Production, high-traffic deployments, large datasets

- **Docker Image:** `rdeangel/instrada-ogm-postgres`
- **Guide:** [Docker Deployment Guide (PostgreSQL)](DOCKER_DEPLOYMENT_POSTGRES.md)
- **Features:**
  - ✅ Enterprise-grade reliability
  - ✅ Unlimited concurrent connections
  - ✅ Advanced database features
  - ✅ Better performance at scale

---

## 🎯 Quick Decision Guide

**Choose SQLite if you:**
- Are testing or developing
- Have < 10 concurrent users
- Want simple setup and maintenance
- Prefer single-file database backups
- Have limited server resources

**Choose PostgreSQL if you:**
- Are deploying to production
- Have > 10 concurrent users
- Need high availability
- Want advanced database features
- Have adequate server resources (Minimum 2GB RAM, 4GB+ recommended)

---

## 📋 Both Guides Include

- **HTTP Deployment** - Simple setup without SSL certificates
- **HTTPS Deployment** - Production-ready with Traefik and Let's Encrypt
- **Complete .env examples** - Ready to copy and customize
- **Step-by-step instructions** - From download to first login
- **Common commands** - For maintenance and troubleshooting
- **Troubleshooting section** - Solutions to common issues

---

## 🚀 Quick Start

1. Choose your database backend (SQLite or PostgreSQL)
2. Follow the appropriate deployment guide
3. Choose HTTP (development) or HTTPS (production) deployment
4. Copy the .env configuration and customize
5. Run `docker compose up -d`
6. Access your application!

---

## 📚 Additional Resources

### Documentation
- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Complete documentation index
- [🚀 Installation Guide](../SETUP/INSTALLATION_GUIDE.md) - Full installation and setup guide
- [⚙️ Environment Setup](../SETUP/ENVIRONMENT_SETUP_GUIDE.md) - Environment variable reference
- [🗄️ Database Configuration](../SETUP/DATABASE_CONFIGURATION_GUIDE.md) - Database setup details
- [🔍 API Documentation](../api/api_docs/API_Index.md) - Complete API reference

### External Links
- **Main README:** [../../README.md](../../README.md)
- **GitHub Repository:** [rdeangel/InstradaOGM](https://github.com/rdeangel/InstradaOGM)
- **Docker Hub - SQLite:** [instrada-ogm-sqlite](https://hub.docker.com/r/rdeangel/instrada-ogm-sqlite)
- **Docker Hub - PostgreSQL:** [instrada-ogm-postgres](https://hub.docker.com/r/rdeangel/instrada-ogm-postgres)

---

**Category**: Deployment | **Status**: Production Ready
