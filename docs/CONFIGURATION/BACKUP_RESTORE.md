# Backup & Restore Guide

This guide provides comprehensive instructions for backing up and restoring the InstradaOGM system, including database, configuration files, and application data.

## Table of Contents

- [Overview](#overview)
- [Backup Types](#backup-types)
- [Automated Backups](#automated-backups)
- [Manual Backups](#manual-backups)
- [Database Backup & Restore](#database-backup--restore)
- [Configuration Backup](#configuration-backup)
- [Application Data Backup](#application-data-backup)
- [Disaster Recovery](#disaster-recovery)
- [Testing Backups](#testing-backups)
- [Backup Retention Policy](#backup-retention-policy)
- [Troubleshooting](#troubleshooting)

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Setup](./)

## Overview

The InstradaOGM system requires regular backups to ensure data integrity and quick recovery in case of system failures. This guide covers:

- Database backups (PostgreSQL)
- Configuration file backups
- Application data backups
- System state backups
- Recovery procedures

## Backup Types

### 1. Database Backups
- **Full Database Backups**: Complete database dumps
- **Incremental Backups**: Changes since last backup
- **Transaction Log Backups**: WAL files for point-in-time recovery

### 2. Configuration Backups
- Environment configuration files
- Application settings
- SSL certificates
- Database connection settings

### 3. Application Data Backups
- User data and profiles
- Audit logs
- System analytics
- File uploads and attachments

## Automated Backups

### Setting Up Automated Database Backups

Create a backup script at `/maintenance_scripts/database/backup-database.sh`:

```bash
#!/bin/bash

# Database Backup Script
# Usage: ./backup-database.sh [full|incremental]

BACKUP_TYPE=${1:-full}
BACKUP_DIR="/backups/database"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="instradaogm"
DB_USER="postgres"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

case $BACKUP_TYPE in
    "full")
        echo "Creating full database backup..."
        pg_dump -U $DB_USER -h localhost -d $DB_NAME -F c -b -v -f "$BACKUP_DIR/full_backup_$DATE.dump"
        ;;
    "incremental")
        echo "Creating incremental backup (WAL archive)..."
        pg_receivewal -U $DB_USER -h localhost -D "$BACKUP_DIR/wal_$DATE" -Z 9
        ;;
    *)
        echo "Invalid backup type. Use 'full' or 'incremental'"
        exit 1
        ;;
esac

# Compress old backups (older than 7 days)
find $BACKUP_DIR -name "*.dump" -mtime +7 -exec gzip {} \;

echo "Backup completed: $BACKUP_DIR"
```

### Cron Job Configuration

Add to crontab for automated execution:

```bash
# Full backup daily at 2 AM
0 2 * * * /maintenance_scripts/database/backup-database.sh full

# Incremental backup every 4 hours
0 */4 * * * /maintenance_scripts/database/backup-database.sh incremental
```

### Configuration Backup Automation

Create `/maintenance_scripts/config/backup-config.sh`:

```bash
#!/bin/bash

CONFIG_BACKUP_DIR="/backups/config"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $CONFIG_BACKUP_DIR

# Backup environment files
tar -czf "$CONFIG_BACKUP_DIR/env_$DATE.tar.gz" .env* .env.production*

# Backup SSL certificates
if [ -d "/etc/ssl/certs/instradaogm" ]; then
    tar -czf "$CONFIG_BACKUP_DIR/ssl_$DATE.tar.gz" /etc/ssl/certs/instradaogm
fi

# Backup application configuration
cp -r src/config "$CONFIG_BACKUP_DIR/config_$DATE"

echo "Configuration backup completed: $CONFIG_BACKUP_DIR"
```

## Manual Backups

### Database Manual Backup

```bash
# Full backup
pg_dump -U postgres -h localhost -d instradaogm -F c -b -v -f manual_backup_$(date +%Y%m%d).dump

# SQL format backup
pg_dump -U postgres -h localhost -d instradaogm -f manual_backup_$(date +%Y%m%d).sql
```

### Configuration Manual Backup

```bash
# Create backup directory
mkdir -p /backups/manual/$(date +%Y%m%d)

# Backup all configuration files
cp -r /maintenance_scripts /backups/manual/$(date +%Y%m%d)/
cp -r /src/config /backups/manual/$(date +%Y%m%d)/
cp .env* /backups/manual/$(date +%Y%m%d)/
```

## Database Backup & Restore

### InstradaOGM Backup System (Recommended)

The InstradaOGM application provides an integrated backup and restore system with encryption and automatic database handling.

#### Creating Backups via Web UI
1. Navigate to **Settings** → **Backup Management**
2. Click **Create Backup**
3. Optionally provide a custom filename
4. Backup is automatically encrypted and stored

#### Restoring Backups via Web UI
1. Navigate to **Settings** → **Backup Management**
2. Select a backup from the list
3. Click **Restore**
4. The system will:
   - Disconnect all database connections (SQLite only)
   - Terminate active database sessions (PostgreSQL)
   - Drop the existing database
   - Create a fresh database
   - Restore the backup data
   - Reconnect the application

#### Creating Backups via API
```bash
curl -X POST "https://your-server.com/api/settings/backup" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "action=backup" \
  -F "filename=my_backup"
```

#### Restoring Backups via API
```bash
# Restore from uploaded file
curl -X POST "https://your-server.com/api/settings/backup" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -F "action=restore" \
  -F "file=@backup.aes"

# Restore from server backup
curl -X POST "https://your-server.com/api/settings/backup" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -F "action=restore" \
  -F "filename=my_backup.postgresql.aes"
```

**Note**: Restore operations require web session authentication (not API keys) for security.

### Manual Database Backup & Restore

#### Full Backup
```bash
# Custom format (recommended)
pg_dump -U postgres -h localhost -d instradaogm -F c -b -v -f backup_full.dump

# Plain SQL format
pg_dump -U postgres -h localhost -d instradaogm -f backup_full.sql
```

#### Compressed Backup
```bash
pg_dump -U postgres -h localhost -d instradaogm | gzip > backup_full.sql.gz
```

### Manual Database Restore

#### From Custom Format Backup
```bash
# Terminate active connections
psql -U postgres -h localhost -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'instradaogm' AND pid <> pg_backend_pid();"

# Drop existing database (if needed)
dropdb -U postgres -h localhost instradaogm

# Create new database
createdb -U postgres -h localhost instradaogm

# Restore from backup
pg_restore -U postgres -h localhost -d instradaogm -v backup_full.dump
```

#### From SQL Backup
```bash
# Terminate active connections
psql -U postgres -h localhost -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'instradaogm' AND pid <> pg_backend_pid();"

# Drop and recreate database
dropdb -U postgres -h localhost instradaogm
createdb -U postgres -h localhost instradaogm

# For uncompressed SQL
psql -U postgres -h localhost -d instradaogm -f backup_full.sql

# For compressed SQL
gunzip -c backup_full.sql.gz | psql -U postgres -h localhost -d instradaogm
```

### Point-in-Time Recovery

1. **Enable WAL Archiving** in `postgresql.conf`:
```ini
wal_level = replica
archive_mode = on
archive_command = 'cp %p /backups/wal/%f'
```

2. **Recovery Process**:
```bash
# Create recovery.conf
echo "restore_command = 'cp /backups/wal/%f %p'" > recovery.conf
echo "recovery_target_time = '2023-12-01 10:00:00'" >> recovery.conf

# Start PostgreSQL with recovery
pg_ctl start -D /var/lib/postgresql/data
```

## Configuration Backup

### Environment Configuration

```bash
# Backup all environment files
tar -czf env_backup.tar.gz .env .env.production .env.staging

# Backup Docker configuration
tar -czf docker_backup.tar.gz docker-compose.yml Dockerfile
```

### Application Configuration

```bash
# Backup source configuration
tar -czf app_config_backup.tar.gz src/config/ prisma/

# Backup maintenance scripts
tar -czf scripts_backup.tar.gz maintenance_scripts/
```

### SSL Certificates

```bash
# Backup SSL certificates
tar -czf ssl_backup.tar.gz /etc/ssl/certs/instradaogm/ /etc/ssl/private/instradaogm/
```

## Application Data Backup

### User Data and Analytics

```bash
# Backup user-generated data
tar -czf user_data_backup.tar.gz data/uploads/ data/exports/

# Backup analytics data
pg_dump -U postgres -h localhost -d instradaogm -t analytics -t user_activity -f analytics_backup.sql
```

### Log Files

```bash
# Backup application logs
tar -czf logs_backup.tar.gz logs/ /var/log/instradaogm/

# Backup audit logs
pg_dump -U postgres -h localhost -d instradaogm -t audit_logs -f audit_logs_backup.sql
```

## Disaster Recovery

### Complete System Recovery

1. **Prepare New Server**
```bash
# Install required packages
apt-get update
apt-get install postgresql-14 nginx docker.io

# Create application user
useradd -m -s /bin/bash instradaogm
```

2. **Restore Database**
```bash
# Create database
createdb -U postgres instradaogm

# Restore from backup
pg_restore -U postgres -d instradaogm /backups/latest/full_backup.dump
```

3. **Restore Configuration**
```bash
# Extract configuration backup
tar -xzf /backups/latest/config_backup.tar.gz -C /

# Set proper permissions
chown -R instradaogm:instradaogm /opt/instradaogm
```

4. **Restart Services**
```bash
# Start PostgreSQL
systemctl start postgresql

# Start application
docker-compose up -d

# Start web server
systemctl start nginx
```

### Partial Recovery Scenarios

#### Database Corruption Only
```bash
# Stop application
docker-compose down

# Restore database
dropdb instradaogm
createdb instradaogm
pg_restore -U postgres -d instradaogm backup.dump

# Restart application
docker-compose up -d
```

#### Configuration Loss Only
```bash
# Restore configuration files
tar -xzf config_backup.tar.gz

# Restart services with new configuration
docker-compose restart
```

## Testing Backups

### Automated Backup Testing

Create `/maintenance_scripts/testing/test-backup.sh`:

```bash
#!/bin/bash

TEST_DB="instradaogm_test_$(date +%s)"
BACKUP_FILE="/backups/latest/full_backup.dump"

echo "Testing backup integrity..."

# Create test database
createdb -U postgres $TEST_DB

# Restore backup to test database
pg_restore -U postgres -d $TEST_DB $BACKUP_FILE

# Run basic integrity checks
psql -U postgres -d $TEST_DB -c "SELECT COUNT(*) FROM users;"
psql -U postgres -d $TEST_DB -c "SELECT COUNT(*) FROM audit_logs;"

# Clean up test database
dropdb -U postgres $TEST_DB

echo "Backup test completed successfully"
```

### Weekly Backup Validation

```bash
# Add to crontab for weekly testing
0 3 * * 0 /maintenance_scripts/testing/test-backup.sh >> /var/log/backup_test.log 2>&1
```

## Backup Retention Policy

### Recommended Retention Schedule

| Backup Type | Retention Period | Storage Location |
|-------------|------------------|------------------|
| Daily Full Backups | 30 days | Local Storage |
| Weekly Full Backups | 12 weeks | Cloud Storage |
| Monthly Full Backups | 12 months | Cloud Storage |
| Incremental Backups | 7 days | Local Storage |
| Configuration Backups | 90 days | Local & Cloud |
| Log Backups | 30 days | Local Storage |

### Automated Cleanup Script

```bash
#!/bin/bash

# Cleanup old backups
find /backups/database -name "*.dump" -mtime +30 -delete
find /backups/config -name "*.tar.gz" -mtime +90 -delete
find /backups/logs -name "*.tar.gz" -mtime +30 -delete

# Archive monthly backups to cloud
aws s3 sync /backups/monthly s3://instradaogm-backups/monthly/
```

## Troubleshooting

### Common Backup Issues

#### Backup Fails with Permission Denied
```bash
# Check database permissions
sudo -u postgres psql -c "\l"

# Fix permissions if needed
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE instradaogm TO postgres;"
```

#### Backup File Corrupted
```bash
# Verify backup integrity
pg_restore -l backup.dump > /dev/null

# If corrupted, create new backup immediately
pg_dump -U postgres -h localhost -d instradaogm -F c -f emergency_backup.dump
```

#### Restore Fails with Version Mismatch
```bash
# Check PostgreSQL versions
pg_dump --version
pg_restore --version

# Use appropriate pg_dump/pg_restore versions
# or upgrade database to match backup version
```

### Recovery Issues

#### Database Won't Start After Restore
```bash
# Check PostgreSQL logs
tail -f /var/log/postgresql/postgresql-14-main.log

# Check configuration files
cat /etc/postgresql/14/main/postgresql.conf
```

#### Application Connection Issues
```bash
# Test database connection
psql -U postgres -h localhost -d instradaogm -c "SELECT version();"

# Check network connectivity
netstat -tlnp | grep 5432
```

### Emergency Procedures

#### Immediate System Failure
1. **Assess Damage**: Identify what's corrupted/lost
2. **Isolate System**: Prevent further damage
3. **Restore from Latest Backup**: Use most recent good backup
4. **Verify Data**: Check critical data integrity
5. **Document Incident**: Record what happened and recovery steps

#### Backup Unavailable
1. **Check All Backup Locations**: Local, cloud, off-site
2. **Contact IT Team**: Verify backup systems status
3. **Consider Partial Recovery**: Restore what's available
4. **Implement New Backup Strategy**: Prevent future occurrences

---

For additional support or questions about backup and restore procedures, please contact the system administration team or refer to the [Troubleshooting Index](../TROUBLESHOOTING/TROUBLESHOOTING_INDEX.md).