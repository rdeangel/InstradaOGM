#!/bin/bash
set -e

# Check if an argument is provided
if [ -z "$1" ]; then
  echo "Error: database type argument required."
  echo "Usage: ./scripts/switch-db.sh [sqlite|postgres]"
  exit 1
fi

DB_TYPE=$1

# Validate the argument
if [ "$DB_TYPE" != "sqlite" ] && [ "$DB_TYPE" != "postgres" ]; then
  echo "Error: Invalid database type '$DB_TYPE'."
  echo "Supported types: sqlite, postgres"
  exit 1
fi

echo "Switching Prisma configuration to $DB_TYPE..."

# 1. Switch Schema File
SOURCE_SCHEMA="prisma/schema.$DB_TYPE.prisma"
TARGET_SCHEMA="prisma/schema.prisma"

if [ -f "$SOURCE_SCHEMA" ]; then
    cp "$SOURCE_SCHEMA" "$TARGET_SCHEMA"
    echo "✔ Replaced schema.prisma with $DB_TYPE version"
else
    echo "❌ Error: Source schema file '$SOURCE_SCHEMA' not found!"
    exit 1
fi

# 2. Switch Migrations Directory
SOURCE_MIGRATIONS="prisma/migrations-$DB_TYPE"
TARGET_MIGRATIONS="prisma/migrations"

# Remove existing migrations folder if it exists
if [ -d "$TARGET_MIGRATIONS" ]; then
    rm -rf "$TARGET_MIGRATIONS"
fi

# Copy new migrations folder
if [ -d "$SOURCE_MIGRATIONS" ]; then
    cp -r "$SOURCE_MIGRATIONS" "$TARGET_MIGRATIONS"
    echo "✔ Replaced migrations directory with $DB_TYPE version"
else
    echo "⚠ Warning: Source migrations directory '$SOURCE_MIGRATIONS' not found. Created empty migrations directory."
    mkdir -p "$TARGET_MIGRATIONS"
fi

echo "Successfully switched environment to $DB_TYPE."
