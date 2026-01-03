#!/bin/bash
#
# Create pre-built distribution package for InstradaOGM
# Usage: ./scripts/create-prebuilt-package.sh [arch] [db_type]
#
# Arguments:
#   arch    - Target architecture: amd64, arm64 (default: auto-detect)
#   db_type - Database type: sqlite, postgres (default: sqlite)
#
# This script creates a tarball containing the pre-built Next.js standalone
# application ready for deployment on linux/amd64 and linux/arm64 systems.
# The package includes all runtime dependencies and can be extracted directly
# into Proxmox LXC containers.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get architecture (default to current system)
ARCH="${1:-$(dpkg --print-architecture 2>/dev/null || uname -m)}"
[[ "$ARCH" == "x86_64" ]] && ARCH="amd64"
[[ "$ARCH" == "aarch64" ]] && ARCH="arm64"

# Get database type (default to sqlite)
DB_TYPE="${2:-sqlite}"
if [[ "$DB_TYPE" != "sqlite" && "$DB_TYPE" != "postgres" ]]; then
    echo -e "${RED}Error: Invalid database type '$DB_TYPE'. Use 'sqlite' or 'postgres'.${NC}"
    exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
VERSION_TAG="v${VERSION}"

# Package name
PACKAGE_NAME="instradaogm-${DB_TYPE}-${VERSION_TAG}-${ARCH}"
DIST_DIR="dist"
PACKAGE_DIR="${DIST_DIR}/${PACKAGE_NAME}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}InstradaOGM Pre-built Package Creator${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Version: ${GREEN}${VERSION_TAG}${NC}"
echo -e "Architecture: ${GREEN}${ARCH}${NC}"
echo -e "Database: ${GREEN}${DB_TYPE}${NC}"
echo -e "Output: ${GREEN}${DIST_DIR}/${PACKAGE_NAME}.tar.gz${NC}"
echo ""

# Check if build exists
if [[ ! -d ".next/standalone" ]]; then
    echo -e "${RED}Error: .next/standalone not found!${NC}"
    echo -e "${YELLOW}Run the following commands first:${NC}"
    echo "  npm run db:switch:sqlite"
    echo "  npm install"
    echo "  npm run build"
    exit 1
fi

# Clean and create dist directory
echo -e "${YELLOW}Cleaning dist directory...${NC}"
rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"

# Copy Next.js standalone output (this becomes the root)
echo -e "${YELLOW}Copying Next.js standalone output...${NC}"
cp -r .next/standalone/* "${PACKAGE_DIR}/"

# Copy static files INTO the standalone directory structure
# This is critical - .next/static must exist inside the standalone output
echo -e "${YELLOW}Copying static assets...${NC}"
mkdir -p "${PACKAGE_DIR}/.next"
cp -r .next/static "${PACKAGE_DIR}/.next/"

# Copy ALL required .next files for production
echo -e "${YELLOW}Copying required Next.js metadata...${NC}"
# Copy all JSON files from .next/ root
cp .next/*.json "${PACKAGE_DIR}/.next/" 2>/dev/null || true
# Copy BUILD_ID
cp .next/BUILD_ID "${PACKAGE_DIR}/.next/" 2>/dev/null || true
# Copy server directory (contains page data and chunks)
cp -r .next/server "${PACKAGE_DIR}/.next/" 2>/dev/null || true

# Copy public directory
echo -e "${YELLOW}Copying public files...${NC}"
cp -r public "${PACKAGE_DIR}/"

# Copy Prisma files for migrations (database-specific, renamed to standard paths)
echo -e "${YELLOW}Copying Prisma schema and migrations for ${DB_TYPE}...${NC}"
mkdir -p "${PACKAGE_DIR}/prisma"
# Copy schema for the selected database type
# Copy schema and migrations (already switched by previous steps)
cp prisma/schema.prisma "${PACKAGE_DIR}/prisma/schema.prisma"
cp -r prisma/migrations "${PACKAGE_DIR}/prisma/migrations"
cp prisma/seed.ts "${PACKAGE_DIR}/prisma/"

# Copy scripts
echo -e "${YELLOW}Copying scripts...${NC}"
cp -r scripts "${PACKAGE_DIR}/"

# Copy MAC vendor database
echo -e "${YELLOW}Copying MAC vendor database...${NC}"
mkdir -p "${PACKAGE_DIR}/data/mac-db"
if [[ -d "data/mac-db" ]]; then
    cp -r data/mac-db/* "${PACKAGE_DIR}/data/mac-db/" 2>/dev/null || true
fi

# Modify the standalone package.json to add our custom scripts
# The standalone package.json already has all the dependencies we need
echo -e "${YELLOW}Updating package.json with custom scripts...${NC}"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('${PACKAGE_DIR}/package.json', 'utf8'));

// Add our custom scripts
pkg.scripts = {
  start: 'node server.js',
  'setup-dirs': 'node scripts/setup-dirs.js',
  'db:init': './scripts/init-db.sh',
  'db:migrate': 'prisma migrate deploy',
  'db:seed': 'tsx prisma/seed.ts'
};

// Ensure required dependencies are in dependencies (not devDependencies)
// Use versions from devDependencies (no fallbacks - fail if missing)
if (!pkg.dependencies['@prisma/client']) {
  if (!pkg.devDependencies['@prisma/client']) {
    throw new Error('@prisma/client not found in devDependencies');
  }
  pkg.dependencies['@prisma/client'] = pkg.devDependencies['@prisma/client'];
}
if (!pkg.dependencies['prisma']) {
  if (!pkg.devDependencies['prisma']) {
    throw new Error('prisma not found in devDependencies');
  }
  pkg.dependencies['prisma'] = pkg.devDependencies['prisma'];
}
if (!pkg.dependencies['tsx']) {
  if (!pkg.devDependencies['tsx']) {
    throw new Error('tsx not found in devDependencies');
  }
  pkg.dependencies['tsx'] = pkg.devDependencies['tsx'];
}

// Remove devDependencies to save space
delete pkg.devDependencies;

fs.writeFileSync('${PACKAGE_DIR}/package.json', JSON.stringify(pkg, null, 2));
"

# Install and copy additional runtime dependencies
# We need prisma, tsx, and their dependencies for migrations and seeding
echo -e "${YELLOW}Installing additional runtime dependencies in temporary location...${NC}"

# Create a temporary directory for installing additional deps
TEMP_DEPS_DIR="${DIST_DIR}/temp-deps"
mkdir -p "${TEMP_DEPS_DIR}"

# Extract versions from the main package.json to avoid version mismatches
echo -e "${YELLOW}Extracting dependency versions from package.json...${NC}"

# Determine the path to the root package.json (script can be run from different locations)
if [[ -f "package.json" ]]; then
    PACKAGE_JSON_PATH="./package.json"
elif [[ -f "../package.json" ]]; then
    PACKAGE_JSON_PATH="../package.json"
else
    echo -e "${RED}Error: Cannot find package.json${NC}"
    exit 1
fi

PRISMA_CLIENT_VERSION=$(node -p "require('${PACKAGE_JSON_PATH}').devDependencies['@prisma/client'].replace('^', '')")
PRISMA_VERSION=$(node -p "require('${PACKAGE_JSON_PATH}').devDependencies['prisma'].replace('^', '')")
TSX_VERSION=$(node -p "require('${PACKAGE_JSON_PATH}').devDependencies['tsx'].replace('^', '')")
BCRYPTJS_VERSION=$(node -p "require('${PACKAGE_JSON_PATH}').dependencies['bcryptjs'].replace('^', '')")
DOTENV_VERSION=$(node -p "require('${PACKAGE_JSON_PATH}').dependencies['dotenv'].replace('^', '')")

echo -e "${YELLOW}Using versions:${NC}"
echo "  @prisma/client: ${PRISMA_CLIENT_VERSION}"
echo "  prisma: ${PRISMA_VERSION}"
echo "  tsx: ${TSX_VERSION}"
echo "  bcryptjs: ${BCRYPTJS_VERSION}"
echo "  dotenv: ${DOTENV_VERSION}"

# Create a minimal package.json for installing only what we need
cat > "${TEMP_DEPS_DIR}/package.json" << EOF
{
  "name": "temp-deps",
  "version": "1.0.0",
  "dependencies": {
    "@prisma/client": "${PRISMA_CLIENT_VERSION}",
    "prisma": "${PRISMA_VERSION}",
    "tsx": "${TSX_VERSION}",
    "bcryptjs": "${BCRYPTJS_VERSION}",
    "dotenv": "${DOTENV_VERSION}"
  }
}
EOF

# Install dependencies in the temp directory
echo -e "${YELLOW}Running npm install for additional dependencies...${NC}"
cd "${TEMP_DEPS_DIR}"
npm install --omit=dev --no-package-lock --legacy-peer-deps > /dev/null 2>&1
cd - > /dev/null

# Copy the installed node_modules to the package
echo -e "${YELLOW}Copying installed dependencies to package...${NC}"
if [[ -d "${TEMP_DEPS_DIR}/node_modules" ]]; then
    # Copy all installed packages (including hidden files like .bin)
    cp -r "${TEMP_DEPS_DIR}/node_modules/"* "${PACKAGE_DIR}/node_modules/" 2>/dev/null || true
    cp -r "${TEMP_DEPS_DIR}/node_modules/".* "${PACKAGE_DIR}/node_modules/" 2>/dev/null || true
fi

# Copy the generated Prisma client from our build
echo -e "${YELLOW}Copying generated Prisma client...${NC}"
if [[ -d "node_modules/.prisma" ]]; then
    cp -r node_modules/.prisma "${PACKAGE_DIR}/node_modules/"
fi

# Clean up temp directory
rm -rf "${TEMP_DEPS_DIR}"

# Create tarball
echo -e "${YELLOW}Creating tarball...${NC}"
cd "${DIST_DIR}"
tar -czvf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}" > /dev/null 2>&1
cd ..

# Calculate size
SIZE=$(du -h "${DIST_DIR}/${PACKAGE_NAME}.tar.gz" | cut -f1)

# Clean up the staging directory (keep only the tarball)
echo -e "${YELLOW}Cleaning up staging directory...${NC}"
rm -rf "${DIST_DIR}/${PACKAGE_NAME}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Package created successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "File: ${BLUE}${DIST_DIR}/${PACKAGE_NAME}.tar.gz${NC}"
echo -e "Size: ${BLUE}${SIZE}${NC}"
echo ""
echo -e "${YELLOW}To Install:${NC}"
echo "  1. Extract: tar -xzf ${PACKAGE_NAME}.tar.gz -C /opt/"
echo "  2. Rename: mv /opt/${PACKAGE_NAME} /opt/instradaogm"
echo "  3. Run setup and migrations"