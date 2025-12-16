# ============================================
# Optimized Multi-Stage Dockerfile for Next.js
# Target: Reduce image size from ~1.1GB to ~300-400MB
# ============================================

# 1. Base image with minimal system dependencies
FROM node:23-alpine AS base

WORKDIR /app

# Install only essential runtime libraries
# openssl: Required by Prisma
# libc6-compat: Compatibility layer for Node.js native modules
RUN apk add --no-cache openssl libc6-compat

# 2. Dependencies stage - install production dependencies
FROM base AS deps

ARG PRISMA_SCHEMA_FILE=schema.postgres.prisma

COPY package.json package-lock.json* ./
COPY prisma/${PRISMA_SCHEMA_FILE} ./prisma/schema.prisma

# Install production dependencies only
RUN npm ci --omit=dev && \
    rm -rf /root/.npm

# 3. Builder stage - build the application
FROM base AS builder

ARG DATABASE_URL
ARG APP_VERSION
ARG PRISMA_SCHEMA_FILE=schema.postgres.prisma
ARG PRISMA_MIGRATIONS_DIR=migrations-postgres

ENV DATABASE_URL=$DATABASE_URL
ENV APP_VERSION=$APP_VERSION

# Install dev dependencies for build
COPY package.json package-lock.json* ./

# Copy Prisma files based on build args
# Copy ONLY the correct schema (renamed to schema.prisma)
COPY prisma/${PRISMA_SCHEMA_FILE} ./prisma/schema.prisma
# Copy ONLY the correct migrations directory (renamed to migrations/)
COPY prisma/${PRISMA_MIGRATIONS_DIR} ./prisma/migrations
# Copy seed file (needed for database initialization)
COPY prisma/seed.ts ./prisma/seed.ts

RUN npm ci && rm -rf /root/.npm

# Copy source code
# Note: This will copy all prisma files (schema.*.prisma, migrations-*/, etc.) to the builder stage,
# but only the correct schema.prisma, migrations/, and seed.ts will be copied to the final runtime image
COPY . .

# Build Next.js (standalone mode configured in next.config.ts)
RUN npm run build

# 4. Database tools stage - isolated layer for DB utilities
FROM alpine:3.21 AS db-tools

# Install database clients based on architecture
RUN apk add --no-cache \
    postgresql-client \
    sqlite \
    bash

# 5. Runtime stage - minimal production image
FROM base AS runner

# User configuration with safer UID/GID to avoid host collisions
# Default UID 65532 is in the high-range (60000-65535) that:
# - Avoids collision with typical host users (1000-59999)
# - Matches Google distroless "nonroot" user standard
# - Provides consistent behavior across different host systems
# Can be overridden at build time for custom requirements
ARG NODE_UID=65532
ARG NODE_GID=65532

ARG APP_DEBUG_LEVEL
ARG NEXT_PUBLIC_APP_VERSION
ENV APP_DEBUG_LEVEL=$APP_DEBUG_LEVEL
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

# Install database clients from db-tools stage
# Also install bash for the entrypoint script
RUN apk add --no-cache bash

# Copy PostgreSQL client utilities (psql, pg_dump, pg_restore, etc.)
COPY --from=db-tools /usr/bin/psql /usr/bin/psql
COPY --from=db-tools /usr/bin/pg_dump /usr/bin/pg_dump
COPY --from=db-tools /usr/bin/pg_dumpall /usr/bin/pg_dumpall
COPY --from=db-tools /usr/bin/pg_restore /usr/bin/pg_restore
COPY --from=db-tools /usr/bin/pg_basebackup /usr/bin/pg_basebackup
COPY --from=db-tools /usr/bin/pg_isready /usr/bin/pg_isready
COPY --from=db-tools /usr/bin/dropdb /usr/bin/dropdb
COPY --from=db-tools /usr/bin/createdb /usr/bin/createdb

# Copy PostgreSQL shared libraries and compression dependencies
COPY --from=db-tools /usr/lib/libpq.so* /usr/lib/
COPY --from=db-tools /usr/lib/libzstd.so* /usr/lib/
COPY --from=db-tools /usr/lib/liblz4.so* /usr/lib/

# Copy SQLite utilities
COPY --from=db-tools /usr/bin/sqlite3 /usr/bin/sqlite3

# Create non-root user with high-range UID/GID to avoid host collisions
# Using build args allows customization while defaulting to safe values
RUN addgroup -g ${NODE_GID} -S nodejs && \
    adduser -S nextjs -u ${NODE_UID} -G nodejs && \
    chown nextjs:nodejs /app

# Switch to nextjs user BEFORE installing dependencies
USER nextjs

# Install minimal runtime dependencies as nextjs user
# Files are created with correct ownership from the start - no chown duplication!
RUN npm install --omit=dev \
    prisma@6.18.0 \
    tsx@4.16.2 \
    bcryptjs@2.4.3 \
    dotenv@16.5.0 && \
    rm -rf /home/nextjs/.npm

# Switch back to root for remaining COPY operations
USER root

# Copy Next.js standalone output with ownership set during copy
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma schema and migrations (needed for runtime migrations)
# Copy ONLY the files we need, not the entire prisma directory
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma/seed.ts ./prisma/seed.ts

# Copy ONLY the generated Prisma client (.prisma folder) and @prisma/client
# @prisma/client is needed for 'prisma generate' to work at runtime
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy backup scripts
# Copy backup scripts and setup script
COPY --from=builder --chown=nextjs:nodejs /app/scripts/decrypt-backup-standalone.js ./scripts/decrypt-backup-standalone.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts/encrypt-backup-standalone.js ./scripts/encrypt-backup-standalone.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts/setup-dirs.js ./scripts/setup-dirs.js
# Copy MAC vendor database
COPY --from=builder --chown=nextjs:nodejs /app/data/mac-db ./data/mac-db

# Copy entrypoint script
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Setup directories with proper ownership
RUN mkdir -p /app/data/backups /app/data/temp /app/data/.service-state /app/data/db /app/data/mac-db && \
    chmod +x /app/scripts/*.js && \
    chown -R nextjs:nodejs /app/data /app/scripts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]