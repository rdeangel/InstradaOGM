# Database Configuration Guide

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Setup](./)

## Overview

InstradaOGM supports two database backends:
- **SQLite** (default) - File-based, zero configuration
- **PostgreSQL** (recommended for production) - Server-based, enterprise-grade

## Quick Comparison

| Feature | SQLite | PostgreSQL |
|---------|--------|-----------|
| **Setup** | Zero config | Requires server |
| **Concurrency** | Limited | Unlimited |
| **Performance** | Good for small data | Excellent for large data |
| **Scalability** | Small to medium | Enterprise-scale |
| **Backup** | Single file | Built-in tools |
| **Replication** | No | Yes |
| **Best For** | Dev, testing, small deployments | Production, high-traffic |

## SQLite Configuration

### What is SQLite?
SQLite is a file-based relational database embedded in the application. No separate server needed.

### Pros ✅
- **Zero Configuration** - Works out of the box
- **Perfect for Development** - No setup required
- **Easy Backup** - Single file to backup
- **No Authentication** - No credentials needed
- **Suitable for Small Deployments** - Works well for small to medium workloads
- **Portable** - Database file can be moved easily

### Cons ❌
- **Limited Concurrency** - Not ideal for many simultaneous writes
- **Not for High-Traffic** - Performance degrades with heavy load
- **Limited Features** - Fewer advanced database features
- **Single Point of Failure** - No built-in replication

### When to Use SQLite
✅ Local development
✅ Testing and staging
✅ Small deployments (< 10 concurrent users)
✅ Single-server setups
✅ Offline-first applications

### SQLite Setup

**Development (Local)**:
```bash
DATABASE_URL=file:/app/data/db/dev.db
```

**Production (Small Deployment)**:
```bash
DATABASE_URL=file:/app/data/db/prod.db
```

**Docker**:
```bash
DATABASE_URL=file:/app/data/db/dev.db
# Database file persists in Docker volume
```

### SQLite File Location
- **Development**: `./app/data/db/dev.db`
- **Production**: `./app/data/db/prod.db`
- **Docker**: `/app/data/db/` (mounted volume)

### Backup SQLite Database
```bash
# Simple file copy
cp /app/data/db/prod.db /backups/prod.db.backup

# With timestamp
cp /app/data/db/prod.db /backups/prod.db.$(date +%Y%m%d_%H%M%S).backup
```

## PostgreSQL Configuration

### What is PostgreSQL?
PostgreSQL is a powerful, open-source relational database server. Requires separate installation/container.

### Pros ✅
- **Enterprise-Grade** - Production-ready reliability
- **Unlimited Concurrency** - Handles many simultaneous connections
- **High Performance** - Optimized for large datasets
- **Advanced Features** - JSONB, full-text search, arrays, etc.
- **Replication** - Built-in replication and failover
- **Backup Tools** - Professional backup and recovery tools
- **Scalability** - Handles millions of records efficiently

### Cons ❌
- **Requires Server** - Separate installation/container needed
- **More Complex** - More configuration required
- **Higher Resources** - Uses more CPU/memory
- **Maintenance** - Requires database administration

### When to Use PostgreSQL
✅ Production deployments
✅ High-traffic applications (> 10 concurrent users)
✅ Large datasets (millions of records)
✅ Multi-server setups
✅ Applications requiring advanced features
✅ Enterprise environments

### PostgreSQL Setup

**Connection String Format**:
```
postgresql://user:password@host:port/database?schema=public
```

**Development (Docker)**:
```bash
POSTGRES_USER=instrada-ogm-user
POSTGRES_PASSWORD=instrada-ogm-password
POSTGRES_HOST=instrada-ogm-postgres-db
POSTGRES_PORT=5432
POSTGRES_DB=instrada-ogm

DATABASE_URL=postgresql://instrada-ogm-user:instrada-ogm-password@instrada-ogm-postgres-db:5432/instrada-ogm?schema=public
```

**Production**:
```bash
POSTGRES_USER=prod_user
POSTGRES_PASSWORD=<strong-password>
POSTGRES_HOST=postgres.example.com
POSTGRES_PORT=5432
POSTGRES_DB=instrada_ogm_prod

DATABASE_URL=postgresql://prod_user:password@postgres.example.com:5432/instrada_ogm_prod?schema=public
```

### PostgreSQL with Docker Compose
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: instrada-ogm-user
      POSTGRES_PASSWORD: instrada-ogm-password
      POSTGRES_DB: instrada-ogm
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### PostgreSQL Backup
```bash
# Backup entire database
pg_dump -U instrada-ogm-user -h localhost instrada-ogm > backup.sql

# Backup with compression
pg_dump -U instrada-ogm-user -h localhost -Fc instrada-ogm > backup.dump

# Restore from backup
psql -U instrada-ogm-user -h localhost instrada-ogm < backup.sql
```

## Environment Variables

### SQLite
```bash
DATABASE_URL=file:/app/data/db/dev.db
```

### PostgreSQL
```bash
DATABASE_URL=postgresql://user:password@host:port/database?schema=public
POSTGRES_USER=instrada-ogm-user
POSTGRES_PASSWORD=instrada-ogm-password
POSTGRES_HOST=instrada-ogm-postgres-db
POSTGRES_PORT=5432
POSTGRES_DB=instrada-ogm
```

## Backup & Restore

InstradaOGM supports automated backup and restore functionality with **AES-256-GCM encryption** for both SQLite and PostgreSQL databases.

### Backup Features

- **Automatic Encryption**: All backups are automatically encrypted using AES-256-GCM
- **Secure Storage**: Encrypted backups are stored with `.aes` extension
- **Manual Encryption/Decryption**: Scripts provided to manually encrypt and decrypt backups
- **Environment-Based Security**: Uses `BACKUP_ENCRYPTION_SECRET_KEY` environment variable

### Backup Encryption Key

Generate a secure encryption key:
```bash
openssl rand -hex 32
```

Add to your `.env` file:
```bash
BACKUP_ENCRYPTION_SECRET_KEY=your_64_character_hex_string_here
```

### Manual Backup Encryption/Decryption

**Encrypt a backup file:**
```bash
npm run encrypt-backup -- /path/to/backup.sql
# Creates: /path/to/backup.sql.aes
```

**Decrypt a backup file:**
```bash
npm run decrypt-backup -- /path/to/backup.sql.aes
# Creates: /path/to/backup.sql
```

**In Docker container:**
```bash
# Decrypt
docker exec -it <container> node /app/scripts/decrypt-backup-standalone.js /app/data/backups/backup.sql.aes

# Encrypt
docker exec -it <container> node /app/scripts/encrypt-backup-standalone.js /app/data/backups/backup.sql
```

### Backup Storage

Backups are stored in:
- **Docker**: `/app/data/backups/` (mounted volume)
- **Local**: `./data/backups/`

For detailed backup and restore documentation, see the [Backup & Restore Guide](../CONFIGURATION/BACKUP_RESTORE.md).

## Troubleshooting

### SQLite Issues
**Database locked**: Restart application
**File not found**: Check file path and permissions
**Slow queries**: Consider using PostgreSQL

### PostgreSQL Issues
**Connection refused**: Check host, port, credentials
**Authentication failed**: Verify POSTGRES_PASSWORD
**Database does not exist**: Create the database first
**Connection timeout**: Verify PostgreSQL server is running and accessible

## Recommendations

### Development
- **Local**: SQLite (zero setup)
- **Docker**: PostgreSQL (closer to production)

### Production
- **Small Deployment**: SQLite (if < 10 users)
- **Large Deployment**: PostgreSQL (recommended)
- **Enterprise**: PostgreSQL with replication

## Section Navigation

### Setup Documentation
- [📋 Setup Overview](./) - Section index and overview
- [🔧 Environment Setup](./ENVIRONMENT_SETUP_GUIDE.md) - Environment configuration
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

## Related Documentation

- **[Environment Setup Guide](./ENVIRONMENT_SETUP_GUIDE.md)** - Complete environment setup
- **[Prisma Migration Guide](../CONFIGURATION/PRISMA_MIGRATION_GUIDE.md)** - Detailed guide for creating and applying migrations
- `.env.example` - All environment variables
- `docker-compose.yml` - Docker configuration

