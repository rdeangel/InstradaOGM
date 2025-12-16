#!/bin/sh

echo "Starting InstradaOGM..."

# Function to wait for database connection
wait_for_db() {
  echo "Waiting for database to be ready..."
  MAX_RETRIES=30
  RETRY_COUNT=0
  
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if echo "SELECT 1;" | npx prisma db execute --stdin --schema /app/prisma/schema.prisma > /dev/null 2>&1; then
      echo "Database connection established"
      return 0
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Database not ready, waiting... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
  done
  
  echo "Failed to connect to database after $MAX_RETRIES attempts"
  return 1
}

# Function to check if database has existing data
has_existing_data() {
  if echo "$DATABASE_URL" | grep -q "postgresql://"; then
    # PostgreSQL: check for application tables using psql directly
    # Extract connection details from DATABASE_URL
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/[^:]*:\([^@]*\)@.*/\1/p')
    
    # Use psql to check for User table
    RESULT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'User';" 2>/dev/null | tr -d ' \n')
    
    # Clear sensitive variables immediately after use
    unset DB_PASS DB_USER DB_HOST DB_PORT DB_NAME
    
    if [ "$RESULT" = "1" ]; then
      echo "Found existing application tables in database"
      return 0
    else
      echo "No existing application tables found in database"
      return 1
    fi
  else
    # SQLite: check for application tables using sqlite3
    DB_FILE=$(echo "$DATABASE_URL" | sed 's/file://')
    
    if [ -f "$DB_FILE" ]; then
      RESULT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='User';" 2>/dev/null || echo "0")
      
      if [ "$RESULT" = "1" ]; then
        echo "Found existing application tables in database"
        return 0
      else
        echo "No existing application tables found in database"
        return 1
      fi
    else
      echo "No existing application tables found in database"
      return 1
    fi
  fi
}

# Function to run database setup
setup_database() {
  echo "Setting up database..."
  
  # First, try to run migrate deploy to see if there are any pending migrations
  echo "Checking for pending migrations..."
  # Run migration and filter output, but preserve exit code
  if npx prisma migrate deploy 2>&1 | grep -E "Applying migration|No pending migrations|All migrations have been successfully applied"; then
    echo "Migrations check completed"
    return 0
  else
    echo "Migration deploy failed, checking database state..."
    
    # Check if database has existing data
    if has_existing_data; then
      echo "Database contains existing data, checking schema compatibility..."
      
      # Try to mark baseline as applied first (if schema matches)
      if npx prisma migrate resolve --applied 20250712_baseline >/dev/null 2>&1; then
        echo "Baseline migration marked as applied successfully"
        
        # NEW: Always run db push after marking baseline as applied to ensure schema is in sync
        echo "Syncing database schema with current Prisma schema..."
        if npx prisma db push >/dev/null 2>&1; then
          echo "Database schema synced successfully"
          return 0
        else
          echo "Failed to sync database schema"
          return 1
        fi
      else
        echo "Schema mismatch detected, updating database schema..."
        
        # Update schema to match current state
        if npx prisma db push >/dev/null 2>&1; then
          echo "Database schema updated successfully"
          
          # Now try to mark baseline as applied
          if npx prisma migrate resolve --applied 20250712_baseline >/dev/null 2>&1; then
            echo "Baseline migration marked as applied successfully"
            return 0
          else
            echo "Failed to mark baseline migration as applied, but schema is updated"
            echo "This may be normal if migration is already recorded"
            return 0  # Don't fail if migration is already recorded
          fi
        else
          echo "Failed to update database schema"
          return 1
        fi
      fi
    else
      echo "Fresh database detected, applying baseline migration..."
      if npx prisma migrate deploy >/dev/null 2>&1; then
        echo "Baseline migration applied successfully"
        return 0
      else
        echo "Baseline migration failed"
        return 1
      fi
    fi
  fi
}

# Function to generate Prisma client
generate_client() {
  echo "Generating Prisma client..."
  if npx prisma generate; then
    echo "Prisma client generated successfully"
    return 0
  else
    echo "Failed to generate Prisma client"
    return 1
  fi
}

# Function to run database seeding
run_seeding() {
  echo "Running database seeding..."
  if npm run prisma:seed; then
    echo "Database seeding completed"
    return 0
  else
    echo "Database seeding failed (this may be normal if data already exists)"
    return 0  # Don't fail the startup if seeding fails
  fi
}

# Main execution
echo "Starting database setup..."

# Ensure data directories exist (handles empty volume mounts)
echo "Ensuring data directories..."
node /app/scripts/setup-dirs.js

# Wait for database to be ready
if ! wait_for_db; then
  echo "Database connection failed, exiting..."
  exit 1
fi

# Setup database (migrations or initialization)
if ! setup_database; then
  echo "Database setup failed, exiting..."
  exit 1
fi

# Generate Prisma client
if ! generate_client; then
  echo "Prisma client generation failed, exiting..."
  exit 1
fi

# Run seeding
run_seeding

echo "Database setup completed successfully"
echo "Starting Next.js application..."

# Execute the main application command
exec node server.js