#!/bin/bash
set -e

# Function to load environment variables from a file
load_env() {
    if [ -f "$1" ]; then
        echo "Loading environment from $1..."
        export $(grep -v '^#' "$1" | xargs)
        return 0
    fi
    return 1
}

# 1. Load Environment Variables
# Priority: .env.production > .env.development > .env
if [ -f ".env.production" ]; then
    load_env ".env.production"
elif [ -f ".env.development" ]; then
    load_env ".env.development"
else
    load_env ".env"
fi

# 2. Extract DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL is not set in the environment files."
    exit 1
fi

echo "Detected DATABASE_URL: ${DATABASE_URL:0:20}..." # Print only start for security

# 3. Determine Database Type
DB_TYPE=""
if [[ "$DATABASE_URL" == file:* ]]; then
    DB_TYPE="sqlite"
elif [[ "$DATABASE_URL" == postgres://* ]] || [[ "$DATABASE_URL" == postgresql://* ]]; then
    DB_TYPE="postgresql"
else
    echo "❌ Error: Unknown database protocol in DATABASE_URL."
    exit 1
fi

echo "Detected Database Type: $DB_TYPE"

# 4. Verify Schema Compatibility
SCHEMA_FILE="prisma/schema.prisma"
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Error: $SCHEMA_FILE not found."
    exit 1
fi

# Check provider in schema.prisma
# We look for 'provider = "sqlite"' or 'provider = "postgresql"'
if grep -q "provider.*=.*\"sqlite\"" "$SCHEMA_FILE"; then
    SCHEMA_PROVIDER="sqlite"
elif grep -q "provider.*=.*\"postgresql\"" "$SCHEMA_FILE"; then
    SCHEMA_PROVIDER="postgresql"
else
    echo "❌ Error: Could not determine provider from $SCHEMA_FILE"
    exit 1
fi

echo "Detected Schema Provider: $SCHEMA_PROVIDER"

# Check for mismatch
if [ "$DB_TYPE" != "$SCHEMA_PROVIDER" ]; then
    echo "❌ CRITICAL MISMATCH DETECTED!"
    echo "   Environment expects: $DB_TYPE"
    echo "   Prisma Schema uses:  $SCHEMA_PROVIDER"
    echo ""
    echo "Solution: Run the switch script to fix your schema:"
    if [ "$DB_TYPE" == "sqlite" ]; then
        echo "   npm run db:switch:sqlite"
    else
        echo "   npm run db:switch:postgres"
    fi
    exit 1
fi

echo "✅ Schema matches detected database type."

# 5. Run Migrations
echo "Starting migration deployment..."

if npx prisma migrate deploy; then
    echo "✅ Database initialized successfully."
else
    echo "⚠️  Migration deploy failed. Checking if we can mark existing migrations as applied..."
    
    # Get the migrations directory based on the provider
    if [ "$SCHEMA_PROVIDER" == "sqlite" ]; then
        MIGRATIONS_DIR="prisma/migrations-sqlite"
    else
        MIGRATIONS_DIR="prisma/migrations-postgres"
    fi

    # Check if we should use the local prisma/migrations if the specific folder doesn't exist
    # (e.g. if we are in a container where only the relevant one was copied)
    if [ ! -d "$MIGRATIONS_DIR" ] && [ -d "prisma/migrations" ]; then
         MIGRATIONS_DIR="prisma/migrations"
    fi
    
    echo "Using migrations from: $MIGRATIONS_DIR"

    if [ -d "$MIGRATIONS_DIR" ]; then
        # Iterate over migration folders
        for migration in "$MIGRATIONS_DIR"/*; do
            if [ -d "$migration" ]; then
                MIGRATION_NAME=$(basename "$migration")
                echo "Attempting to mark migration as applied: $MIGRATION_NAME"
                if npx prisma migrate resolve --applied "$MIGRATION_NAME" >/dev/null 2>&1; then
                    echo "  ✔ Marked $MIGRATION_NAME as applied."
                else
                    echo "  ℹ️  Could not mark $MIGRATION_NAME (already applied or error)."
                fi
            fi
        done
        
        # Final sync to catch any drift
        echo "Syncing schema to ensure database state is correct..."
        if npx prisma db push; then
             echo "✅ Database recovered and synced successfully."
        else
             echo "❌ Error: Failed to sync database."
             exit 1
        fi
    else
        echo "❌ Error: Migrations directory not found."
        exit 1
    fi
fi
