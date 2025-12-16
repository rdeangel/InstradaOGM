# Docker Versioning with package.json
[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Setup](./)

## Overview

This document explains how to pass the version from `package.json` to Docker Compose so that image tags include the version instead of "latest".

## Current Setup

The Docker Compose configuration is already set up to use the `NEXT_PUBLIC_APP_VERSION` environment variable:

```yaml
image: instrada-ogm-postgres:${NEXT_PUBLIC_APP_VERSION:-latest}
```

This means:
- If `NEXT_PUBLIC_APP_VERSION` is set, it will use that version
- If not set, it will fall back to "latest"

## Available Solutions

### 1. NPM Scripts (Recommended)

The `package.json` includes scripts that automatically extract the version:

#### **Build Commands**
```bash
# Build with automatic version extraction
npm run docker:build:postgres        # PostgreSQL version
npm run docker:build:sqlite          # SQLite version

# Build without cache
npm run docker:build-no-cache:postgres
npm run docker:build-no-cache:sqlite
```

#### **Start/Stop Commands**
```bash
# Start services with version
npm run docker:up:postgres           # Start PostgreSQL version
npm run docker:up:sqlite             # Start SQLite version

# Stop services
npm run docker:down:postgres         # Stop PostgreSQL version
npm run docker:down:sqlite           # Stop SQLite version

# View logs
npm run docker:logs:postgres         # View PostgreSQL logs
npm run docker:logs:sqlite           # View SQLite logs
```

#### **Utility Commands**
```bash
# Check current version
npm run docker:version               # Display current version from package.json

# Build both versions with versioning
npm run docker:build-with-version    # Build both PostgreSQL and SQLite with version
```

#### **Multi-Platform Build Commands**
```bash
# Setup buildx (one-time setup)
npm run docker:buildx:setup          # Create and use buildx builder

# Build multi-platform images with version
npm run docker:buildx:postgres       # PostgreSQL version for all platforms
npm run docker:buildx:sqlite         # SQLite version for all platforms
npm run docker:buildx:all            # Both versions for all platforms

# Build and push to registry
npm run docker:buildx:push:postgres  # Build and push PostgreSQL
npm run docker:buildx:push:sqlite    # Build and push SQLite
npm run docker:buildx:push:all       # Build and push both

# Build multi-platform "latest" images
npm run docker:buildx:latest:postgres # PostgreSQL latest for all platforms
npm run docker:buildx:latest:sqlite  # SQLite latest for all platforms
npm run docker:buildx:latest:all     # Both latest for all platforms

# Build and push "latest" to registry
npm run docker:buildx:push:latest:postgres # Build and push PostgreSQL latest
npm run docker:buildx:push:latest:sqlite   # Build and push SQLite latest
npm run docker:buildx:push:latest:all      # Build and push both latest
```

### 2. Shell Scripts

Several shell scripts are available in the `scripts/` directory:

#### `scripts/docker-build.sh`
```bash
# Build PostgreSQL version
./scripts/docker-build.sh
```

#### `scripts/update-env.sh`
```bash
# Update .env file with current version
./scripts/update-env.sh
```

#### `scripts/docker-compose-with-version.sh`
```bash
# Run any docker compose command with version
./scripts/docker-compose-with-version.sh --profile postgres build
./scripts/docker-compose-with-version.sh --profile postgres up -d
```

### 3. Manual Environment Variable

You can manually set the environment variable:

```bash
# Extract version and set as environment variable
export NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version")

# Run docker compose
docker compose --profile postgres build
```

### 4. Inline Command

You can also run docker compose with the version inline:

```bash
NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version") docker compose --profile postgres build
```

## Example Output

With version `0.0.9.55` from `package.json`, your images will be tagged as:
- `instrada-ogm-postgres:0.0.9.55`
- `instrada-ogm-sqlite:0.0.9.55`

Instead of:
- `instrada-ogm-postgres:latest`
- `instrada-ogm-sqlite:latest`

## Best Practices

1. **Use NPM scripts**: The updated npm scripts are the easiest way to ensure versioning
2. **CI/CD Integration**: Use the shell scripts in your CI/CD pipeline
3. **Version Management**: Update the version in `package.json` before building Docker images
4. **Consistency**: Always use the same versioning approach across your team

## Troubleshooting

If you see "latest" tags, check that:
1. The `NEXT_PUBLIC_APP_VERSION` environment variable is set
2. The version in `package.json` is valid
3. You're using one of the versioned build commands

## Section Navigation

### Setup Documentation
- [📋 Setup Overview](./) - Section index and overview
- [🔧 Environment Setup](./ENVIRONMENT_SETUP_GUIDE.md) - Environment configuration
- [🗄️ Database Configuration](./DATABASE_CONFIGURATION_GUIDE.md) - Database setup and configuration
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

You can verify the current version with:
```bash
npm run docker:version
```