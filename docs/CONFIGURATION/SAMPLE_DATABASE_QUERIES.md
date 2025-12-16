# Database Query Reference: PostgreSQL vs SQLite

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Configuration](./)

## Overview

This document provides equivalent queries for debugging and inspecting database schemas in both PostgreSQL and SQLite environments.

## Setup Commands

### PostgreSQL
```bash
# Connect to the PostgreSQL container for interactive shell access
docker exec -it instrada-ogm-postgres /bin/bash

# Extract database connection parameters from DATABASE_URL environment variable
# These commands parse the DATABASE_URL format: postgresql://user:password@host:port/database
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')  # Extract hostname
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')  # Extract port number
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')     # Extract database name
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')  # Extract username
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')  # Extract password
```

### SQLite
```bash
# Connect to the SQLite container for interactive shell access
docker exec -it instrada-ogm-sqlite /bin/bash

# Set database file path - SQLite uses a file-based database instead of client-server architecture
DB_PATH=./data/db/dev.db
```

## Migration Table Check

### PostgreSQL
```bash
# Check if Prisma migrations table exists in the database
echo "=== Migration Table Check ==="
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '_prisma_migrations';"

# Display the structure of the migrations table (columns, data types, constraints)
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d \"_prisma_migrations\";"
```

### Access Postgres direct from the db container
```bash
# Alternative way to connect directly to PostgreSQL container without parsing DATABASE_URL
# This is useful when you're already inside the database container
docker exec instrada-ogm-postgres-db psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'OpnsenseGroupDisplay' ORDER BY ordinal_position;"
```

```bash
# Clean up migration history - remove all migrations except the baseline
# This is useful when you want to reset migration state and start fresh
docker exec instrada-ogm-postgres-db psql -U "$DB_USER" -d "$DB_NAME" -c "DELETE FROM _prisma_migrations WHERE migration_name != '20250712_baseline';"
```
DELETE 4

```bash
# View all recorded migrations with their execution timestamps
# This helps understand the migration history and identify any stuck migrations

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT migration_name, started_at, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at;"

docker exec instrada-ogm-postgres-db psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT migration_name, started_at, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at;"
```
  migration_name   |          started_at           |          finished_at          | applied_steps_count 
-------------------+-------------------------------+-------------------------------+---------------------
 20250712_baseline | 2025-07-12 13:44:48.092666+00 | 2025-07-12 13:44:48.092666+00 |                   0
(1 rows)

```bash
# Remove incomplete migrations (those that started but never finished)
# This is important for cleaning up migration state when migrations fail
docker exec instrada-ogm-postgres-db psql -U "$DB_USER" -d "$DB_NAME" -c "DELETE FROM _prisma_migrations WHERE migration_name = '20250712_baseline' AND finished_at IS NULL;"
```
DELETE 1


### SQLite
```bash
# Check if Prisma migrations table exists in SQLite database
echo "=== Migration Table Check ==="
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_prisma_migrations';"

# Display the schema of the migrations table (SQLite equivalent of \d command)
sqlite3 "$DB_PATH" ".schema _prisma_migrations"
```

## Recorded Migrations

### PostgreSQL
```bash
# List all recorded migrations with their execution status
# This helps track which migrations have been applied and when
echo "=== Recorded Migrations ==="
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT migration_name, started_at, finished_at FROM _prisma_migrations ORDER BY started_at;"
```

### SQLite
```bash
# List all recorded migrations with their execution status (SQLite equivalent)
echo "=== Recorded Migrations ==="
sqlite3 "$DB_PATH" "SELECT migration_name, started_at, finished_at FROM _prisma_migrations ORDER BY started_at;"
```

## Table Existence Checks

### PostgreSQL
```bash
# Check if a specific table exists in the database
# Useful for verifying that migrations created the expected tables
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'ApiKey';"

# List all user-created tables in the database (excludes PostgreSQL system tables)
# This gives you an overview of your application's database schema
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE 'pg_%' ORDER BY table_name;"
```

### SQLite
```bash
# Check if a specific table exists in SQLite database
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ApiKey';"

# List all user-created tables in SQLite database (excludes SQLite system tables)
sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
```

## Table Schema Inspection

### PostgreSQL
```bash
# Display comprehensive table information including columns, indexes, and foreign keys
# The \d command is a PostgreSQL-specific command for detailed table description
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d \"User\";"

# Get detailed column information using standard SQL information_schema
# This is more portable and follows SQL standards
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'User' ORDER BY ordinal_position;"

# Get just the column names in order - useful for quick reference
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'User' ORDER BY ordinal_position;"

# Get comprehensive column details including data types, lengths, and constraints
# This provides the most detailed view of table structure
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'User' 
ORDER BY ordinal_position;"
```

### SQLite
```bash
# Display table schema including CREATE TABLE statement, indexes, and triggers
# SQLite's .schema command shows the DDL that would recreate the table
sqlite3 "$DB_PATH" ".schema User"

# Get column information using SQLite's PRAGMA command
# PRAGMA table_info is SQLite's equivalent to information_schema.columns
sqlite3 "$DB_PATH" "PRAGMA table_info(User);"

# Get just the column names in order - equivalent to PostgreSQL query above
sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('User') ORDER BY cid;"

# Get detailed column information formatted to match PostgreSQL output
# This query transforms SQLite's PRAGMA output to match PostgreSQL's information_schema format
sqlite3 "$DB_PATH" "SELECT 
    name as column_name,
    type as data_type,
    CASE WHEN \"notnull\" = 0 THEN 'YES' ELSE 'NO' END as is_nullable,
    dflt_value as column_default
FROM pragma_table_info('User') 
ORDER BY cid;"
```

## Specific Table Column Checks

### PostgreSQL
```bash
# Verify that a specific table has the expected columns after migration
# This is useful for debugging migration issues or verifying schema changes
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ApiKey' ORDER BY ordinal_position;"
```

### SQLite
```bash
# Verify that a specific table has the expected columns after migration (SQLite equivalent)
sqlite3 "$DB_PATH" "SELECT name as column_name, type as data_type FROM pragma_table_info('ApiKey') ORDER BY cid;"
```

## Post-Migration Verification

### PostgreSQL
```bash
# Comprehensive verification after running migrations
# Check if new tables were created correctly
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ApiKey' ORDER BY ordinal_position;"

# Check if new columns were added to existing tables
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d \"Account\";"

# Verify that columns were removed from tables as expected
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d \"User\";"
```

### SQLite
```bash
# Comprehensive verification after running migrations (SQLite equivalent)
# Check if new tables were created correctly
sqlite3 "$DB_PATH" "SELECT name as column_name, type as data_type FROM pragma_table_info('ApiKey') ORDER BY cid;"

# Check if new columns were added to existing tables
sqlite3 "$DB_PATH" ".schema Account"

# Verify that columns were removed from tables as expected
sqlite3 "$DB_PATH" ".schema User"
```

## Additional Useful Queries

### PostgreSQL
```bash
# Discover all foreign key relationships in the database
# This helps understand table dependencies and referential integrity
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE constraint_type = 'FOREIGN KEY';"

# List all indexes in the database with their definitions
# This helps understand query performance and database optimization
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public';"
```

### SQLite
```bash
# Check foreign key constraints for a specific table
# SQLite's PRAGMA foreign_key_list shows relationships for one table at a time
sqlite3 "$DB_PATH" "PRAGMA foreign_key_list(User);"

# Check indexes for a specific table
# Shows all indexes associated with the specified table
sqlite3 "$DB_PATH" "PRAGMA index_list(User);"

# Discover all foreign key relationships across the entire database
# This query combines information from all tables to show the complete foreign key picture
sqlite3 "$DB_PATH" "SELECT 
    m.tbl_name as table_name,
    p."from" as column_name,
    p.table as foreign_table_name,
    p."to" as foreign_column_name
FROM sqlite_master m
JOIN pragma_foreign_key_list(m.name) p
WHERE m.type = 'table';"
```

## Key Differences Summary

| Feature | PostgreSQL | SQLite |
|---------|------------|--------|
| System tables | `information_schema.tables` | `sqlite_master` |
| Schema display | `\d table_name` | `.schema table_name` |
| Column info | `information_schema.columns` | `PRAGMA table_info(table_name)` |
| Connection | Host/port/user/pass | File path |
| Schemas | Multiple schemas supported | Single schema |
| Data types | Rich type system | Basic types |

## Notes

- **Column Ordering**: SQLite uses `cid` (column ID) instead of `ordinal_position` for column ordering
- **PRAGMA Commands**: SQLite's `PRAGMA` commands are specific to SQLite and don't have PostgreSQL equivalents
- **Information Schema**: PostgreSQL's `information_schema` is a standard SQL feature, while SQLite uses its own system tables
- **SQL Compatibility**: Both databases support similar SQL syntax for basic queries, but system-level queries differ significantly
## Section Navigation

### Configuration Documentation
- [📋 Configuration Overview](./) - Section index and overview
- [🔐 SSO Provider Config](SSO_PROVIDER_CONFIG.md) - Configure single sign-on providers
- [🌐 Proxy Settings](CADDY-PROXY-SETTINGS.md) - Configure reverse proxy
- [🗄️ Database Configuration](../SETUP/DATABASE_CONFIGURATION_GUIDE.md) - Database setup and configuration

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

- **Use Cases**: PostgreSQL is better for complex applications with multiple users, while SQLite is ideal for simpler applications or development environments

**Last Updated**: 2025-11-06 | **Section**: Configuration | **Category**: Database Management
