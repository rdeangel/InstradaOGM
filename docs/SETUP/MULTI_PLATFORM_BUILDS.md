# Multi-Platform Docker Builds

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Setup](./)

## Overview

This guide explains how to build Docker images for multiple CPU architectures using Docker Buildx.

## Overview

Multi-platform builds allow you to create Docker images that can run on different CPU architectures:

### **Supported Architectures**
- **linux/amd64** - Intel/AMD 64-bit processors (most desktop/laptop computers)
- **linux/arm64** - ARM 64-bit processors (Apple Silicon Macs, ARM servers)

### **Architecture Limitations**
- **PostgreSQL builds**: Support `linux/amd64` and `linux/arm64` due to Prisma compatibility
- **SQLite builds**: Support `linux/amd64` and `linux/arm64` due to Prisma compatibility

## Prerequisites

1. **Docker Buildx**: Ensure you have Docker Buildx available
   ```bash
   docker buildx version
   ```

2. **Docker Registry**: For pushing multi-platform images, you'll need access to a Docker registry

3. **Docker Driver**: Multi-platform builds require the `docker-container` driver
   ```bash
   # Check current driver
   docker buildx inspect
   
   # If you see "driver: docker", you need to fix it
   npm run docker:buildx:fix
   ```

## Quick Start

### **Using NPM Scripts (Recommended)**

```bash
# 1. Setup buildx (one-time setup)
npm run docker:buildx:setup

# 2. Build multi-platform images with version
npm run docker:buildx:postgres    # PostgreSQL version for all platforms
npm run docker:buildx:sqlite      # SQLite version for all platforms
npm run docker:buildx:all         # Both versions for all platforms

# 3. Build and push to registry (if you have registry access)
npm run docker:buildx:push:postgres
npm run docker:buildx:push:sqlite
npm run docker:buildx:push:all

# 4. Build and push "latest" tags
npm run docker:buildx:push:latest:postgres
npm run docker:buildx:push:latest:sqlite
npm run docker:buildx:push:latest:all

## Detailed Commands

### **Setup Commands**

```bash
# Create and use a buildx builder with correct driver
npm run docker:buildx:setup

# Fix existing buildx builder (if you get driver errors)
npm run docker:buildx:fix
```

These commands:
- Create a new buildx builder instance with `docker-container` driver
- Set it as the default builder
- Enable multi-platform builds
- Fix common driver issues

### **Build Commands**

#### **PostgreSQL Version**
```bash
npm run docker:buildx:postgres
```
Builds PostgreSQL version for `linux/amd64` and `linux/arm64` platforms with current version from `package.json`.

#### **SQLite Version**
```bash
npm run docker:buildx:sqlite
```
Builds SQLite version for all supported platforms with current version from `package.json`.

#### **Both Versions**
```bash
npm run docker:buildx:all
```
Builds both PostgreSQL and SQLite versions for supported platforms.

**Note**: Both PostgreSQL and SQLite support `linux/amd64` and `linux/arm64` only.

### **Latest Build Commands**

#### **Build PostgreSQL Latest**
```bash
npm run docker:buildx:latest:postgres
```
Builds PostgreSQL version with "latest" tag for all supported platforms.

#### **Build SQLite Latest**
```bash
npm run docker:buildx:latest:sqlite
```
Builds SQLite version with "latest" tag for all supported platforms.

#### **Build Both Latest**
```bash
npm run docker:buildx:latest:all
```
Builds both PostgreSQL and SQLite versions with "latest" tags for all supported platforms.

### **Push Commands**

#### **Push PostgreSQL**
```bash
npm run docker:buildx:push:postgres
```
Builds and pushes PostgreSQL version to your configured registry.

#### **Push SQLite**
```bash
npm run docker:buildx:push:sqlite
```
Builds and pushes SQLite version to your configured registry.

#### **Push Both**
```bash
npm run docker:buildx:push:all
```
Builds and pushes both versions to your configured registry.

### **Push Latest Commands**

#### **Push PostgreSQL Latest**
```bash
npm run docker:buildx:push:latest:postgres
```
Builds and pushes PostgreSQL version with "latest" tag to your configured registry.

#### **Push SQLite Latest**
```bash
npm run docker:buildx:push:latest:sqlite
```
Builds and pushes SQLite version with "latest" tag to your configured registry.

#### **Push Both Latest**
```bash
npm run docker:buildx:push:latest:all
```
Builds and pushes both versions with "latest" tags to your configured registry.

## Manual Commands

If you prefer to run commands manually:

### **Setup Buildx**
```bash
docker buildx create --use
```

### **Build PostgreSQL for Multiple Platforms**
```bash
NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version") \
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag instrada-ogm-postgres:$(node -p "require('./package.json').version") \
  --file Dockerfile \
  --build-arg PRISMA_SCHEMA_FILE=schema.postgres.prisma \
  --build-arg PRISMA_MIGRATIONS_DIR=migrations-postgres \
  --build-arg DATABASE_URL=postgresql://user:password@localhost:5432/InstradaOGM_build?schema=public \
  --build-arg BACKUP_ENCRYPTION_SECRET_KEY=${BACKUP_ENCRYPTION_SECRET_KEY} \
  --build-arg APP_DEBUG_LEVEL=SILENT \
  .
```

### **Build SQLite for Multiple Platforms**
```bash
NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version") \
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag instrada-ogm-sqlite:$(node -p "require('./package.json').version") \
  --file Dockerfile \
  --build-arg PRISMA_SCHEMA_FILE=schema.sqlite.prisma \
  --build-arg PRISMA_MIGRATIONS_DIR=migrations-sqlite \
  --build-arg DATABASE_URL=file:/app/data/db/dev.db \
  --build-arg BACKUP_ENCRYPTION_SECRET_KEY=${BACKUP_ENCRYPTION_SECRET_KEY} \
  --build-arg APP_DEBUG_LEVEL=SILENT \
  .
```

### **Build PostgreSQL Latest for Multiple Platforms**
```bash
NEXT_PUBLIC_APP_VERSION=latest \
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag instrada-ogm-postgres:latest \
  --file Dockerfile \
  --build-arg PRISMA_SCHEMA_FILE=schema.postgres.prisma \
  --build-arg PRISMA_MIGRATIONS_DIR=migrations-postgres \
  --build-arg DATABASE_URL=postgresql://user:password@localhost:5432/InstradaOGM_build?schema=public \
  --build-arg BACKUP_ENCRYPTION_SECRET_KEY=${BACKUP_ENCRYPTION_SECRET_KEY} \
  --build-arg APP_DEBUG_LEVEL=SILENT \
  .
```

### **Build SQLite Latest for Multiple Platforms**
```bash
NEXT_PUBLIC_APP_VERSION=latest \
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag instrada-ogm-sqlite:latest \
  --file Dockerfile \
  --build-arg PRISMA_SCHEMA_FILE=schema.sqlite.prisma \
  --build-arg PRISMA_MIGRATIONS_DIR=migrations-sqlite \
  --build-arg DATABASE_URL=file:/app/data/db/dev.db \
  --build-arg BACKUP_ENCRYPTION_SECRET_KEY=${BACKUP_ENCRYPTION_SECRET_KEY} \
  --build-arg APP_DEBUG_LEVEL=SILENT \
  .
```

### **Build Single Platform and Save to File (No Registry)**

Use this when you want to build for a specific platform and save the image as a tar file for manual transfer (e.g., to a remote machine that doesn't have registry access).

> **Important:** You must include all `--build-arg` parameters. Omitting them causes the Dockerfile to fall back to its defaults — most critically `PRISMA_SCHEMA_FILE=schema.postgres.prisma`, which will embed the **wrong schema** in a SQLite image.

#### **SQLite — ARM64**
```bash
NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version") \
docker buildx build \
  --platform linux/arm64 \
  --output type=docker,dest=./instrada-ogm-sqlite-$(node -p "require('./package.json').version")-arm64.tar \
  --tag rdeangel/instrada-ogm-sqlite:$(node -p "require('./package.json').version") \
  --file Dockerfile \
  --build-arg PRISMA_SCHEMA_FILE=schema.sqlite.prisma \
  --build-arg PRISMA_MIGRATIONS_DIR=migrations-sqlite \
  --build-arg DATABASE_URL=file:/app/data/db/dev.db \
  --build-arg BACKUP_ENCRYPTION_SECRET_KEY=${BACKUP_ENCRYPTION_SECRET_KEY} \
  --build-arg APP_DEBUG_LEVEL=SILENT \
  .
```

#### **SQLite — AMD64**
```bash
NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version") \
docker buildx build \
  --platform linux/amd64 \
  --output type=docker,dest=./instrada-ogm-sqlite-$(node -p "require('./package.json').version")-amd64.tar \
  --tag rdeangel/instrada-ogm-sqlite:$(node -p "require('./package.json').version") \
  --file Dockerfile \
  --build-arg PRISMA_SCHEMA_FILE=schema.sqlite.prisma \
  --build-arg PRISMA_MIGRATIONS_DIR=migrations-sqlite \
  --build-arg DATABASE_URL=file:/app/data/db/dev.db \
  --build-arg BACKUP_ENCRYPTION_SECRET_KEY=${BACKUP_ENCRYPTION_SECRET_KEY} \
  --build-arg APP_DEBUG_LEVEL=SILENT \
  .
```

#### **PostgreSQL — ARM64**
```bash
NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version") \
docker buildx build \
  --platform linux/arm64 \
  --output type=docker,dest=./instrada-ogm-postgres-$(node -p "require('./package.json').version")-arm64.tar \
  --tag rdeangel/instrada-ogm-postgres:$(node -p "require('./package.json').version") \
  --file Dockerfile \
  --build-arg PRISMA_SCHEMA_FILE=schema.postgres.prisma \
  --build-arg PRISMA_MIGRATIONS_DIR=migrations-postgres \
  --build-arg DATABASE_URL=postgresql://user:password@localhost:5432/InstradaOGM_build?schema=public \
  --build-arg BACKUP_ENCRYPTION_SECRET_KEY=${BACKUP_ENCRYPTION_SECRET_KEY} \
  --build-arg APP_DEBUG_LEVEL=SILENT \
  .
```

**Load the saved image on the target machine:**
```bash
docker load < instrada-ogm-sqlite-1.1.0-arm64.tar
```

> **Note:** `--output type=docker` only works with single-platform builds. For multi-platform images use `--push` to a registry instead.

## Image Naming Convention

Multi-platform images follow this naming pattern:

### **Local Builds**
- `instrada-ogm-postgres:{version}` (PostgreSQL version)
- `instrada-ogm-sqlite:{version}` (SQLite version)
- `instrada-ogm-postgres:latest` (PostgreSQL latest)
- `instrada-ogm-sqlite:latest` (SQLite latest)

### **Registry Builds**
- `your-registry/instrada-ogm-postgres:{version}`
- `your-registry/instrada-ogm-sqlite:{version}`
- `your-registry/instrada-ogm-postgres:latest`
- `your-registry/instrada-ogm-sqlite:latest`

### **Example**
With version `0.0.9.55`:
- `instrada-ogm-postgres:0.0.9.55`
- `instrada-ogm-sqlite:0.0.9.55`
- `instrada-ogm-postgres:latest`
- `instrada-ogm-sqlite:latest`

## Supported Architectures

| Architecture | Description | Common Use Cases |
|--------------|-------------|------------------|
| **linux/amd64** | Intel/AMD 64-bit | Desktop computers, servers, cloud VMs |
| **linux/arm64** | ARM 64-bit | Apple Silicon Macs, ARM servers, newer Raspberry Pi |

## Registry Configuration

To push to a registry, you need to:

1. **Login to your registry**:
   ```bash
   docker login your-registry.com
   ```

2. **Update image tags** (if needed):
   ```bash
   docker tag instrada-ogm-postgres:0.0.9.55 your-registry/instrada-ogm-postgres:0.0.9.55
   ```

3. **Push images**:
   ```bash
   docker push your-registry/instrada-ogm-postgres:0.0.9.55
   ```

## Troubleshooting

### **Buildx Not Available**
```bash
# Check if buildx is available
docker buildx version

# If not available, install Docker Buildx
# On Linux:
sudo apt-get install docker-buildx-plugin

# On macOS:
brew install docker-buildx
```

### **Multi-Platform Build Driver Error**
If you get the error "Multi-platform build is not supported for the docker driver":

```bash
# Check current driver
docker buildx inspect

# Fix the driver issue
npm run docker:buildx:fix

# Or manually fix it
docker buildx rm default 2>/dev/null || true
docker buildx create --use --driver docker-container
```

### **Platform Not Supported**
If you encounter platform-specific issues:
```bash
# Build for specific platform only
docker buildx build --platform linux/amd64 --tag instrada-ogm-postgres:0.0.9.55 .
```

### **Memory Issues**
Multi-platform builds can be memory-intensive:
```bash
# Increase Docker memory limit in Docker Desktop settings
# Or use a dedicated build server for large builds
```

### **Build Cache**
Clear build cache if you encounter issues:
```bash
docker buildx prune
```

## Best Practices

1. **Use NPM Scripts**: They automatically handle version extraction and build arguments
2. **Test Locally**: Always test builds on your target platform
3. **Use Specific Tags**: Avoid using `latest` for production deployments
4. **Monitor Build Times**: Multi-platform builds take longer than single-platform builds
5. **Use Registry**: Push images to a registry for easier distribution

## Versioned vs Latest Tags

### **When to Use Versioned Tags**
- **Production Deployments**: Always use specific version tags for production
- **Rollback Scenarios**: Versioned tags allow easy rollback to previous versions
- **Audit Trails**: Versioned tags provide clear audit trails
- **CI/CD Pipelines**: Use versioned tags for automated deployments

### **When to Use Latest Tags**
- **Development**: Use latest tags for development and testing
- **Quick Testing**: Latest tags are convenient for quick testing
- **Documentation**: Latest tags are useful for documentation examples
- **Public Registries**: Latest tags are commonly expected in public registries

### **Recommended Workflow**
1. **Build Versioned Images**: `npm run docker:buildx:all`
2. **Test Versioned Images**: Test the specific version
3. **Push Versioned Images**: `npm run docker:buildx:push:all`
4. **Build Latest Images**: `npm run docker:buildx:latest:all`
5. **Push Latest Images**: `npm run docker:buildx:push:latest:all`

## CI/CD Integration

For automated builds in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Build multi-platform images
  run: |
    npm run docker:buildx:setup
    npm run docker:buildx:push:all
```

```yaml
# Example GitLab CI
build-multi-platform:
  script:
    - npm run docker:buildx:setup
    - npm run docker:buildx:push:all
```

---

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