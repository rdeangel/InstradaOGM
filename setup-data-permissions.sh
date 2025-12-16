#!/bin/bash
#
# setup-data-permissions.sh
# 
# Configures correct ownership and permissions for InstradaOGM data directory
# to match the container's nextjs user (UID:GID 65532:65532)
#
# Usage:
#   ./setup-data-permissions.sh /path/to/data
#
# Example:
#   ./setup-data-permissions.sh ./data
#   ./setup-data-permissions.sh /var/lib/instrada-ogm/data
#

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Container user UID and GID (from Dockerfile)
CONTAINER_UID=65532
CONTAINER_GID=65532

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 <data_directory_path>"
    echo ""
    echo "Arguments:"
    echo "  data_directory_path    Path to the data directory (e.g., ./data or /var/lib/instrada-ogm/data)"
    echo ""
    echo "Examples:"
    echo "  $0 ./data"
    echo "  $0 /var/lib/instrada-ogm/data"
    echo ""
    echo "This script will:"
    echo "  1. Create the data directory if it doesn't exist"
    echo "  2. Create subdirectories (db, backups, temp) if needed"
    echo "  3. Set ownership to UID:GID ${CONTAINER_UID}:${CONTAINER_GID} (nextjs user in container)"
    echo "  4. Set appropriate permissions (755 for directories, 644 for files)"
    exit 1
}

# Check if help is requested
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    show_usage
fi

# Check if data directory path is provided
if [ -z "$1" ]; then
    print_error "Data directory path is required"
    echo ""
    show_usage
fi

DATA_DIR="$1"

# Remove trailing slash from DATA_DIR if present
DATA_DIR="${DATA_DIR%/}"

# Check if running as root (required for chown)
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (use sudo)"
    echo ""
    echo "Example: sudo $0 $DATA_DIR"
    exit 1
fi

print_info "Setting up permissions for data directory: $DATA_DIR"
print_info "Target UID:GID: ${CONTAINER_UID}:${CONTAINER_GID}"

# Create main data directory if it doesn't exist
if [ ! -d "$DATA_DIR" ]; then
    print_info "Creating data directory: $DATA_DIR"
    mkdir -p "$DATA_DIR"
else
    print_info "Data directory already exists: $DATA_DIR"
fi

# Create subdirectories
SUBDIRS=("db" "backups" "temp")
for subdir in "${SUBDIRS[@]}"; do
    SUBDIR_PATH="$DATA_DIR/$subdir"
    if [ ! -d "$SUBDIR_PATH" ]; then
        print_info "Creating subdirectory: $SUBDIR_PATH"
        mkdir -p "$SUBDIR_PATH"
    else
        print_info "Subdirectory already exists: $SUBDIR_PATH"
    fi
done

# Set ownership recursively
print_info "Setting ownership to ${CONTAINER_UID}:${CONTAINER_GID}..."
chown -R ${CONTAINER_UID}:${CONTAINER_GID} "$DATA_DIR"

# Set directory permissions (755 = rwxr-xr-x)
print_info "Setting directory permissions to 755..."
find "$DATA_DIR" -type d -exec chmod 755 {} \;

# Set file permissions (644 = rw-r--r--)
print_info "Setting file permissions to 644..."
find "$DATA_DIR" -type f -exec chmod 644 {} \;

# Verify permissions
print_info "Verifying permissions..."
ACTUAL_OWNER=$(stat -c '%u:%g' "$DATA_DIR")
ACTUAL_PERMS=$(stat -c '%a' "$DATA_DIR")

if [ "$ACTUAL_OWNER" == "${CONTAINER_UID}:${CONTAINER_GID}" ]; then
    print_success "Ownership verified: $ACTUAL_OWNER"
else
    print_warning "Ownership mismatch: Expected ${CONTAINER_UID}:${CONTAINER_GID}, got $ACTUAL_OWNER"
fi

if [ "$ACTUAL_PERMS" == "755" ]; then
    print_success "Permissions verified: $ACTUAL_PERMS"
else
    print_warning "Permissions: $ACTUAL_PERMS (expected 755)"
fi

# Show summary
echo ""
print_success "Data directory setup complete!"
echo ""
print_info "Summary:"
echo "  Directory: $DATA_DIR"
echo "  Owner: ${CONTAINER_UID}:${CONTAINER_GID}"
echo "  Permissions: 755 (directories), 644 (files)"
echo ""
print_info "Subdirectories created:"
for subdir in "${SUBDIRS[@]}"; do
    echo "  - $DATA_DIR/$subdir"
done
echo ""
print_info "You can now start your InstradaOGM container"
