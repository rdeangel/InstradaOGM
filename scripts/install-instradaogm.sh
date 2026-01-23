#!/usr/bin/env bash

set -e

# Error trap to show where script fails
trap 'echo "ERROR: Script failed at line $LINENO with exit code $?" >&2; exit 1' ERR

#########################################
# InstradaOGM Installation Script
# Self-contained installer for InstradaOGM
# Supports: amd64, arm64 architectures
# Database: SQLite
#########################################

# Color codes for output formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration variables
REPO_OWNER="rdeangel"
REPO_NAME="InstradaOGM"
INSTALL_DIR="/opt/instradaogm"
DB_TYPE="sqlite"
NODE_VERSION="23"
SERVICE_NAME="instradaogm"
LOG_FILE="/var/log/instradaogm-install.log"

# Architecture variable (will be set by detect_architecture)
ARCH=""

#########################################
# Helper Functions
#########################################

msg_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

msg_ok() {
    echo -e "${GREEN}[OK]${NC} $1" | tee -a "$LOG_FILE"
}

msg_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE" >&2
    exit 1
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        msg_error "This script must be run as root or with sudo privileges"
    fi
    msg_ok "Running with root privileges"
}

detect_architecture() {
    local machine_arch
    machine_arch=$(uname -m)
    
    case "$machine_arch" in
        x86_64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            msg_error "Unsupported architecture: $machine_arch. Only amd64 and arm64 are supported."
            ;;
    esac
    
    msg_ok "Detected architecture: $ARCH"
}

check_dependencies() {
    local missing_deps=()
    local required_tools=("curl" "tar" "openssl" "systemctl" "sqlite3")
    
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            missing_deps+=("$tool")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        msg_info "Missing dependencies: ${missing_deps[*]}"
        return 1
    fi
    
    msg_ok "All required dependencies are installed"
    return 0
}

install_dependencies() {
    msg_info "Installing missing dependencies..."
    
    # Detect package manager and install dependencies
    if command -v apt-get &> /dev/null; then
        apt-get update >> "$LOG_FILE" 2>&1
        apt-get install -y curl tar openssl systemd sqlite3 jq >> "$LOG_FILE" 2>&1
    elif command -v yum &> /dev/null; then
        yum install -y curl tar openssl systemd sqlite jq >> "$LOG_FILE" 2>&1
    elif command -v dnf &> /dev/null; then
        dnf install -y curl tar openssl systemd sqlite jq >> "$LOG_FILE" 2>&1
    else
        msg_error "Unable to detect package manager. Please install curl, tar, openssl, systemd, sqlite3, and jq manually."
    fi
    
    msg_ok "Dependencies installed successfully"
}

setup_nodejs() {
    msg_info "Checking Node.js installation..."
    
    local current_node_version=""
    if command -v node &> /dev/null; then
        current_node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        
        if [[ "$current_node_version" == "$NODE_VERSION" ]]; then
            msg_ok "Node.js v$NODE_VERSION is already installed"
            # Verify npm is also available
            if ! command -v npm &> /dev/null; then
                msg_error "Node.js is installed but npm is not found. Please check your Node.js installation."
            fi
            return 0
        else
            # Different version detected
            echo ""
            echo -e "${YELLOW}Found existing Node.js v$current_node_version${NC}"
            echo -e "${YELLOW}This script requires Node.js v$NODE_VERSION${NC}"
            echo ""
            read -p "Do you want to remove the existing version and install v$NODE_VERSION? (y/n): " -n 1 -r
            echo
            
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                msg_error "Installation cancelled. Node.js v$NODE_VERSION is required."
            fi
            
            msg_info "Removing existing Node.js v$current_node_version..."
            
            # Remove old Node.js packages
            if command -v apt-get &> /dev/null; then
                apt-get remove -y nodejs npm >> "$LOG_FILE" 2>&1
                apt-get purge -y nodejs npm >> "$LOG_FILE" 2>&1
                apt-get autoremove -y >> "$LOG_FILE" 2>&1
                
                # Remove old NodeSource repository files
                rm -f /etc/apt/sources.list.d/nodesource.list >> "$LOG_FILE" 2>&1
                rm -f /etc/apt/sources.list.d/nodesource.list.save >> "$LOG_FILE" 2>&1
                rm -f /usr/share/keyrings/nodesource.gpg >> "$LOG_FILE" 2>&1
                
            elif command -v yum &> /dev/null; then
                yum remove -y nodejs npm >> "$LOG_FILE" 2>&1
                rm -f /etc/yum.repos.d/nodesource*.repo >> "$LOG_FILE" 2>&1
            elif command -v dnf &> /dev/null; then
                dnf remove -y nodejs npm >> "$LOG_FILE" 2>&1
                rm -f /etc/yum.repos.d/nodesource*.repo >> "$LOG_FILE" 2>&1
            fi
            
            # Clear command cache
            hash -r
            
            msg_ok "Old Node.js version removed"
        fi
    fi
    
    msg_info "Installing Node.js v$NODE_VERSION using nvm..."
    
    # Install nvm if not already installed
    if [[ ! -d "$HOME/.nvm" ]]; then
        msg_info "Installing nvm (Node Version Manager)..."
        echo "  Downloading nvm installer..." >&2
        if ! curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash >> "$LOG_FILE" 2>&1; then
            msg_error "Failed to install nvm. Check $LOG_FILE for details."
        fi
    fi
    
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Verify nvm is loaded
    if ! command -v nvm &> /dev/null; then
        # Try alternative loading method
        if [ -s "$NVM_DIR/nvm.sh" ]; then
            source "$NVM_DIR/nvm.sh"
        else
            msg_error "Failed to load nvm. Please install Node.js v$NODE_VERSION manually."
        fi
    fi
    
    # Install Node.js v23 using nvm
    msg_info "Installing Node.js v$NODE_VERSION with nvm..."
    echo "  This may take a minute..." >&2
    if ! nvm install "$NODE_VERSION" >> "$LOG_FILE" 2>&1; then
        echo "" >&2
        echo "nvm install failed. Last 30 lines of log:" >&2
        tail -n 30 "$LOG_FILE" >&2
        msg_error "Failed to install Node.js v$NODE_VERSION with nvm."
    fi
    
    if ! nvm use "$NODE_VERSION" >> "$LOG_FILE" 2>&1; then
        msg_error "Failed to activate Node.js v$NODE_VERSION."
    fi
    
    if ! nvm alias default "$NODE_VERSION" >> "$LOG_FILE" 2>&1; then
        msg_error "Failed to set Node.js v$NODE_VERSION as default."
    fi
    
    # Refresh command cache
    hash -r
    
    # Verify installation
    if ! command -v node &> /dev/null; then
        echo "PATH: $PATH" >> "$LOG_FILE"
        msg_error "Node.js installation completed but 'node' command not found. Please check the installation."
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "PATH: $PATH" >> "$LOG_FILE"
        echo "Checking for npm package..." >> "$LOG_FILE"
        if command -v apt-get &> /dev/null; then
            dpkg -l | grep nodejs >> "$LOG_FILE" 2>&1
        fi
        msg_error "Node.js installation completed but 'npm' command not found. Please check the installation."
    fi
    
    local installed_version
    installed_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    
    if [[ "$installed_version" != "$NODE_VERSION" ]]; then
        echo "Expected: v$NODE_VERSION" >> "$LOG_FILE"
        echo "Got: v$installed_version" >> "$LOG_FILE"
        echo "Installed Node.js package info:" >> "$LOG_FILE"
        if command -v apt-get &> /dev/null; then
            dpkg -l | grep nodejs >> "$LOG_FILE" 2>&1
            apt-cache policy nodejs >> "$LOG_FILE" 2>&1
        fi
        msg_error "Node.js installed but version mismatch. Expected v$NODE_VERSION, got v$installed_version"
    fi
    
    msg_ok "Node.js v$NODE_VERSION installed successfully"
    echo "Node version: $(node -v)" >> "$LOG_FILE"
    echo "npm version: $(npm -v)" >> "$LOG_FILE"
    echo "Node path: $(which node)" >> "$LOG_FILE"
}

#########################################
# Version Comparison Helper
#########################################

compare_versions() {
    # Compare two version strings (e.g., v1.0.1 vs v1.0.2)
    # Returns: 0 if equal, 1 if first > second, 2 if first < second
    local ver1="$1"
    local ver2="$2"
    
    # Remove 'v' prefix if present
    ver1="${ver1#v}"
    ver2="${ver2#v}"
    
    if [[ "$ver1" == "$ver2" ]]; then
        return 0
    fi
    
    # Split versions and compare
    local IFS=.
    local i ver1_arr=($ver1) ver2_arr=($ver2)
    
    # Fill empty positions with zeros
    for ((i=${#ver1_arr[@]}; i<${#ver2_arr[@]}; i++)); do
        ver1_arr[i]=0
    done
    
    for ((i=0; i<${#ver1_arr[@]}; i++)); do
        if [[ -z ${ver2_arr[i]} ]]; then
            ver2_arr[i]=0
        fi
        if ((10#${ver1_arr[i]} > 10#${ver2_arr[i]})); then
            return 1
        fi
        if ((10#${ver1_arr[i]} < 10#${ver2_arr[i]})); then
            return 2
        fi
    done
    
    return 0
}

#########################################
# Update/Upgrade Process
#########################################

update_instradaogm() {
    local version="$1"
    local arch="$2"
    
    # Normalize version - ensure it has 'v' prefix
    [[ "$version" != v* ]] && version="v$version"
    
    msg_info "Checking for existing installation..."
    
    if [[ ! -d "$INSTALL_DIR" ]]; then
        msg_error "No InstradaOGM installation found at $INSTALL_DIR"
    fi
    
    if [[ ! -f "$INSTALL_DIR/.env" ]]; then
        msg_error "No .env file found. Cannot proceed with update."
    fi
    
    msg_ok "Found existing installation"
    
    # Get current installed version
    local current_version=""
    if [[ -f "$INSTALL_DIR/package.json" ]]; then
        current_version=$(grep '"version"' "$INSTALL_DIR/package.json" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
        if [[ -n "$current_version" ]]; then
            # Add 'v' prefix if not present
            [[ "$current_version" != v* ]] && current_version="v$current_version"
            msg_info "Current version: $current_version"
        fi
    fi
    
    # Compare versions if current version is known
    if [[ -n "$current_version" ]]; then
        echo "Comparing versions: $current_version vs $version" >> "$LOG_FILE"
        
        # Call compare_versions and capture result (use set +e temporarily to avoid exit on non-zero)
        set +e
        compare_versions "$current_version" "$version"
        local result=$?
        set -e
        
        echo "Comparison result: $result" >> "$LOG_FILE"
        
        if [[ $result -eq 0 ]]; then
            msg_ok "Already running version $version"
            echo "No update needed. Your installation is up to date."
            exit 0
        elif [[ $result -eq 1 ]]; then
            echo ""
            echo -e "${YELLOW}Warning: You are trying to downgrade from $current_version to $version${NC}"
            echo ""
            read -p "Are you sure you want to downgrade? (y/n): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "Downgrade cancelled."
                exit 0
            fi
        else
            msg_info "Upgrading from $current_version to $version"
        fi
    fi
    
    # Download new version FIRST (before stopping service or removing files)
    msg_info "Downloading new version..."
    local package_path
    package_path=$(download_prebuilt_package "$version" "$arch")
    msg_ok "Package downloaded: $(basename "$package_path")"
    
    # Now that we have the package, proceed with update
    # Stop the service
    msg_info "Stopping InstradaOGM service..."
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME" >> "$LOG_FILE" 2>&1
        msg_ok "Service stopped"
    else
        msg_info "Service was not running"
    fi
    
    # Backup .env and data
    msg_info "Backing up configuration and data..."
    cp -p "$INSTALL_DIR/.env" /tmp/instradaogm.env.backup >> "$LOG_FILE" 2>&1
    
    if [[ -d "$INSTALL_DIR/data" ]]; then
        mkdir -p /tmp/instradaogm-data-backup >> "$LOG_FILE" 2>&1
        if [[ -d "$INSTALL_DIR/data/backups" ]]; then
            cp -Rp "$INSTALL_DIR/data/backups" /tmp/instradaogm-data-backup/ >> "$LOG_FILE" 2>&1
        fi
        if [[ -d "$INSTALL_DIR/data/db" ]]; then
            cp -Rp "$INSTALL_DIR/data/db" /tmp/instradaogm-data-backup/ >> "$LOG_FILE" 2>&1
        fi
    fi
    msg_ok "Backup completed"
    
    # Remove old installation (keep directory)
    msg_info "Removing old installation files..."
    find "$INSTALL_DIR" -mindepth 1 -delete >> "$LOG_FILE" 2>&1
    msg_ok "Old files removed"
    
    # Extract new version
    extract_package "$package_path"
    
    # Restore .env and data
    msg_info "Restoring configuration and data..."
    cp -p /tmp/instradaogm.env.backup "$INSTALL_DIR/.env" >> "$LOG_FILE" 2>&1
    
    if [[ -d /tmp/instradaogm-data-backup ]]; then
        if [[ -d /tmp/instradaogm-data-backup/backups ]]; then
            cp -Rp /tmp/instradaogm-data-backup/backups "$INSTALL_DIR/data/" >> "$LOG_FILE" 2>&1
        fi
        if [[ -d /tmp/instradaogm-data-backup/db ]]; then
            cp -Rp /tmp/instradaogm-data-backup/db "$INSTALL_DIR/data/" >> "$LOG_FILE" 2>&1
        fi
    fi
    msg_ok "Configuration and data restored"
    
    # Clean up backups
    rm -f /tmp/instradaogm.env.backup >> "$LOG_FILE" 2>&1
    rm -rf /tmp/instradaogm-data-backup >> "$LOG_FILE" 2>&1
    
    # Run database migrations
    msg_info "Running database migrations..."
    cd "$INSTALL_DIR" || msg_error "Failed to change to installation directory"
    
    export NODE_OPTIONS='--max-old-space-size=512'
    export DATABASE_URL=$(grep "^DATABASE_URL=" "$INSTALL_DIR/.env" | cut -d'=' -f2-)
    
    if ! npm run db:migrate >> "$LOG_FILE" 2>&1; then
        echo "" >&2
        echo "Database migration failed. Last 30 lines of log:" >&2
        tail -n 30 "$LOG_FILE" >&2
        unset NODE_OPTIONS
        msg_error "Database migration failed. Check $LOG_FILE for details."
    fi
    
    msg_info "Seeding database..."
    if ! npm run db:seed >> "$LOG_FILE" 2>&1; then
        echo "" >&2
        echo "Database seeding failed. Last 30 lines of log:" >&2
        tail -n 30 "$LOG_FILE" >&2
        unset NODE_OPTIONS
        msg_error "Database seeding failed. Check $LOG_FILE for details."
    fi
    
    unset NODE_OPTIONS
    msg_ok "Database migrations and seeding completed"
    
    # Recreate systemd service (in case it changed)
    create_systemd_service
    
    # Clean up downloaded package
    rm -f "$package_path" >> "$LOG_FILE" 2>&1
    
    msg_ok "Update completed successfully!"
    echo ""
    echo "InstradaOGM has been updated to version $version"
    echo "Service is now running at: $(grep "^NEXTAUTH_URL=" "$INSTALL_DIR/.env" | cut -d'=' -f2-)"
}

#########################################
# GitHub Release Download Logic
#########################################

get_latest_version() {
    echo "[INFO] Fetching latest version from GitHub..." >> "$LOG_FILE"
    
    local api_url="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
    local version
    
    version=$(curl -s "$api_url" | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4)
    
    if [[ -z "$version" ]]; then
        echo "[ERROR] Failed to fetch latest version from GitHub API. Please check your internet connection or try again later." >&2
        exit 1
    fi
    
    echo "[OK] Latest version: $version" >> "$LOG_FILE"
    echo "$version"
}

download_prebuilt_package() {
    local version="$1"
    local arch="$2"
    local package_filename="instradaogm-${DB_TYPE}-${version}-${arch}.tar.gz"
    local download_path="/tmp/${package_filename}"
    
    echo "[INFO] Fetching release information for version $version..." >> "$LOG_FILE"
    echo "Looking for package: $package_filename" >> "$LOG_FILE"
    
    local api_url="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${version}"
    local release_data
    local download_url
    local http_status
    
    # Fetch release data with HTTP status
    echo "Fetching from: $api_url" >> "$LOG_FILE"
    http_status=$(curl -s -w "%{http_code}" -o /tmp/github_release.json "$api_url")
    release_data=$(cat /tmp/github_release.json)
    
    echo "HTTP Status: $http_status" >> "$LOG_FILE"
    echo "Response length: ${#release_data} bytes" >> "$LOG_FILE"
    
    if [[ "$http_status" != "200" ]]; then
        echo "HTTP Error $http_status when fetching release" >&2
        echo "URL: $api_url" >&2
        echo "Response: $release_data" >&2
        echo "[ERROR] Failed to fetch release information from GitHub (HTTP $http_status). URL: $api_url" >&2
        exit 1
    fi
    
    if [[ -z "$release_data" ]]; then
        echo "[ERROR] Empty response from GitHub API. Please check your internet connection." >&2
        exit 1
    fi
    
    # Debug: log the API response
    echo "API Response:" >> "$LOG_FILE"
    echo "$release_data" >> "$LOG_FILE"
    
    # Parse JSON using jq to find the download URL - simplified regex pattern
    # Looking for: instradaogm-sqlite-v1.0.1-amd64.tar.gz
    download_url=$(echo "$release_data" | jq -r ".assets[] | select(.name | contains(\"instradaogm-${DB_TYPE}\") and contains(\"${arch}.tar.gz\")) | .browser_download_url" | head -n 1)
    
    if [[ -z "$download_url" || "$download_url" == "null" ]]; then
        echo "[INFO] Available assets in this release:" >&2
        echo "$release_data" | jq -r '.assets[].name' >&2
        echo "[ERROR] Failed to find package matching 'instradaogm-${DB_TYPE}-*-${arch}.tar.gz' for version $version." >&2
        exit 1
    fi
    
    echo "[INFO] Downloading package from GitHub..." >> "$LOG_FILE"
    echo "Package: $(basename "$download_url")" >> "$LOG_FILE"
    echo "Download URL: $download_url" >> "$LOG_FILE"
    
    if ! curl -L -o "$download_path" "$download_url" >> "$LOG_FILE" 2>&1; then
        echo "[ERROR] Failed to download package. Please check your internet connection." >&2
        exit 1
    fi
    
    if [[ ! -f "$download_path" ]]; then
        echo "[ERROR] Package download failed. File not found at $download_path" >&2
        exit 1
    fi
    
    local file_size
    file_size=$(ls -lh "$download_path" | awk '{print $5}')
    echo "[OK] Package downloaded successfully ($file_size)" >> "$LOG_FILE"
    
    # Clean up temp file
    rm -f /tmp/github_release.json
    
    # Only output the path to stdout for capture
    echo "$download_path"
}

#########################################
# Backup Cleanup
#########################################

clean_backup_directories() {
    echo ""
    echo "============================================"
    echo "Clean Backup Directories"
    echo "============================================"
    echo ""
    
    # Find all backup directories
    local backup_dirs=()
    if [[ -d "/opt" ]]; then
        while IFS= read -r dir; do
            backup_dirs+=("$dir")
        done < <(find /opt -maxdepth 1 -type d -name "instradaogm.backup.*" 2>/dev/null | sort)
    fi
    
    if [[ ${#backup_dirs[@]} -eq 0 ]]; then
        echo -e "${GREEN}[OK]${NC} No backup directories found"
        exit 0
    fi
    
    echo "Found ${#backup_dirs[@]} backup director(ies):"
    echo ""
    
    local total_size=0
    for dir in "${backup_dirs[@]}"; do
        local size=$(du -sh "$dir" 2>/dev/null | cut -f1)
        echo "  • $(basename "$dir") - $size"
        # Get size in KB for total calculation
        local size_kb=$(du -sk "$dir" 2>/dev/null | cut -f1)
        total_size=$((total_size + size_kb))
    done
    
    # Convert total size to human readable
    local total_size_mb=$((total_size / 1024))
    echo ""
    echo "Total space used: ${total_size_mb}MB"
    echo ""
    
    read -p "Do you want to delete all these backups? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cleanup cancelled."
        exit 0
    fi
    
    echo ""
    echo -e "${BLUE}[INFO]${NC} Removing backup directories..."
    
    # Disable exit on error for the removal loop
    set +e
    
    local removed=0
    local failed=0
    for dir in "${backup_dirs[@]}"; do
        echo -n "  Removing: $(basename "$dir")..."
        if rm -rf "$dir" 2>/dev/null; then
            echo " Done"
            ((removed++))
        else
            echo " Failed"
            ((failed++))
        fi
    done
    
    # Re-enable exit on error
    set -e
    
    echo ""
    if [[ $failed -gt 0 ]]; then
        echo -e "${YELLOW}[WARNING]${NC} Removed $removed backup director(ies), $failed failed, freed approximately ${total_size_mb}MB"
    else
        echo -e "${GREEN}[OK]${NC} Removed $removed backup director(ies), freed approximately ${total_size_mb}MB"
    fi
    exit 0
}

#########################################
# Uninstall
#########################################

uninstall_instradaogm() {
    echo ""
    echo "============================================"
    echo "Uninstall InstradaOGM"
    echo "============================================"
    echo ""
    
    # Check if InstradaOGM is installed
    if [[ ! -d "$INSTALL_DIR" ]]; then
        echo -e "${YELLOW}[WARNING]${NC} InstradaOGM is not installed at $INSTALL_DIR"
        exit 0
    fi
    
    # Get current version if available
    local current_version=""
    if [[ -f "$INSTALL_DIR/package.json" ]]; then
        current_version=$(grep '"version"' "$INSTALL_DIR/package.json" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
        if [[ -n "$current_version" ]]; then
            echo "Installed version: v$current_version"
            echo ""
        fi
    fi
    
    # Warning
    echo -e "${RED}⚠️  WARNING: This will completely remove InstradaOGM!${NC}"
    echo ""
    echo "This will:"
    echo "  • Stop the InstradaOGM service"
    echo "  • Remove the systemd service file"
    echo "  • Remove the installation directory ($INSTALL_DIR)"
    echo ""
    
    read -p "Do you want to continue? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Uninstall cancelled."
        exit 0
    fi
    
    # Ask about data and backups
    echo ""
    read -p "Do you also want to remove all data and backups? (y/n): " -n 1 -r
    echo
    local remove_data=$REPLY
    
    echo ""
    
    # Stop and disable service
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        echo -e "${BLUE}[INFO]${NC} Stopping service..."
        systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        echo "  Service stopped"
    fi
    
    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        echo -e "${BLUE}[INFO]${NC} Disabling service..."
        systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        echo "  Service disabled"
    fi
    
    # Remove systemd service file
    if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
        echo -e "${BLUE}[INFO]${NC} Removing systemd service file..."
        rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
        systemctl daemon-reload 2>/dev/null || true
        echo "  Service file removed"
    fi
    
    # Remove installation directory
    echo -e "${BLUE}[INFO]${NC} Removing installation directory..."
    if rm -rf "$INSTALL_DIR" 2>/dev/null; then
        echo "  Installation directory removed"
    else
        echo -e "${YELLOW}[WARNING]${NC} Failed to remove installation directory"
    fi
    
    # Remove backups if requested
    if [[ $remove_data =~ ^[Yy]$ ]]; then
        local backup_dirs=()
        if [[ -d "/opt" ]]; then
            while IFS= read -r dir; do
                backup_dirs+=("$dir")
            done < <(find /opt -maxdepth 1 -type d -name "instradaogm.backup.*" 2>/dev/null)
        fi
        
        if [[ ${#backup_dirs[@]} -gt 0 ]]; then
            echo -e "${BLUE}[INFO]${NC} Removing ${#backup_dirs[@]} backup director(ies)..."
            set +e
            for dir in "${backup_dirs[@]}"; do
                rm -rf "$dir" 2>/dev/null && echo "  Removed: $(basename "$dir")"
            done
            set -e
        fi
    fi
    
    echo ""
    echo -e "${GREEN}[OK]${NC} InstradaOGM has been uninstalled"
    
    if [[ ! $remove_data =~ ^[Yy]$ ]]; then
        local backup_count=$(find /opt -maxdepth 1 -type d -name "instradaogm.backup.*" 2>/dev/null | wc -l)
        if [[ $backup_count -gt 0 ]]; then
            echo ""
            echo -e "${YELLOW}Note: $backup_count backup director(ies) remain in /opt${NC}"
            echo "Run with --clean-backups to remove them"
        fi
    fi
    
    exit 0
}

#########################################
# Installation Process
#########################################

prepare_installation() {
    local skip_confirmation="${1:-false}"
    
    msg_info "Preparing installation directory..."
    
    if [[ -d "$INSTALL_DIR" ]]; then
        if [[ "$skip_confirmation" != "true" ]]; then
            echo -e "${YELLOW}Warning: Installation directory already exists at $INSTALL_DIR${NC}"
            read -p "Do you want to backup and overwrite? (y/n): " -n 1 -r
            echo
            
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                msg_error "Installation cancelled by user"
            fi
        fi
        
        local backup_dir="${INSTALL_DIR}.backup.$(date +%s)"
        msg_info "Creating backup at $backup_dir..."
        mv "$INSTALL_DIR" "$backup_dir" >> "$LOG_FILE" 2>&1
        msg_ok "Backup created successfully"
    fi
    
    mkdir -p "$INSTALL_DIR" >> "$LOG_FILE" 2>&1
    msg_ok "Installation directory prepared"
}

extract_package() {
    local package_path="$1"
    
    msg_info "Extracting package..."
    
    echo "Extracting $package_path to $INSTALL_DIR" >> "$LOG_FILE"
    
    # Extract directly to INSTALL_DIR, stripping the top-level directory
    # This handles the instradaogm-sqlite-v1.0.1-amd64 wrapper directory
    if ! tar -xzf "$package_path" -C "$INSTALL_DIR" --strip-components=1 >> "$LOG_FILE" 2>&1; then
        msg_error "Failed to extract package. Check $LOG_FILE for details."
    fi
    
    # Verify extraction worked by checking for package.json
    if [[ ! -f "$INSTALL_DIR/package.json" ]]; then
        echo "Contents of $INSTALL_DIR after extraction:" >> "$LOG_FILE"
        ls -la "$INSTALL_DIR" >> "$LOG_FILE"
        msg_error "Extraction completed but package.json not found. Installation package may be corrupted."
    fi
    
    echo "Extraction successful. Contents of $INSTALL_DIR:" >> "$LOG_FILE"
    ls -la "$INSTALL_DIR" >> "$LOG_FILE"
    
    msg_ok "Package extracted successfully"
}

create_environment_file() {
    msg_info "Configuring environment variables..."
    
    echo ""
    echo "=== OPNsense Configuration ==="
    echo "You can configure OPNsense credentials now or skip and edit the .env file later."
    echo ""
    read -p "Do you want to configure OPNsense credentials now? (y/n): " -n 1 -r
    echo
    
    local opnsense_url=""
    local opnsense_api_key=""
    local opnsense_api_secret=""
    local skip_ssl="false"
    local configure_now=false
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        configure_now=true
        
        # Prompt for OPNsense URL
        while true; do
            read -p "Enter OPNsense URL (e.g., https://192.168.1.1): " opnsense_url
            if [[ "$opnsense_url" =~ ^https:// ]]; then
                break
            else
                echo -e "${RED}Error: URL must start with https://${NC}"
            fi
        done
        
        # Prompt for API credentials
        read -p "Enter OPNsense API Key: " opnsense_api_key
        read -sp "Enter OPNsense API Secret: " opnsense_api_secret
        echo
        
        # Prompt for SSL verification
        read -p "Skip SSL verification? (true/false, default: false): " skip_ssl
        skip_ssl=${skip_ssl:-false}
    else
        # Leave fields empty when skipped
        opnsense_url=""
        opnsense_api_key=""
        opnsense_api_secret=""
        skip_ssl="false"
        
        echo -e "${YELLOW}Skipping OPNsense configuration. You MUST edit ${INSTALL_DIR}/.env before starting the service.${NC}"
    fi
    
    # Auto-detect server IP
    echo ""
    echo "=== Server Configuration ==="
    local server_ip
    server_ip=$(hostname -I | awk '{print $1}')
    
    if [[ -z "$server_ip" ]]; then
        read -p "Enter server IP address: " server_ip
    else
        read -p "Server IP detected as $server_ip. Press Enter to accept or enter a different IP: " user_ip
        if [[ -n "$user_ip" ]]; then
            server_ip="$user_ip"
        fi
    fi
    
    # Generate secure secrets
    msg_info "Generating secure secrets..."
    local nextauth_secret
    local backup_encryption_key
    nextauth_secret=$(openssl rand -base64 32)
    backup_encryption_key=$(openssl rand -hex 32)
    
    # Create .env file
    local env_file="${INSTALL_DIR}/.env"
    
    cat > "$env_file" << EOF
# OPNsense Configuration
OPNSENSE_URL=${opnsense_url}
OPNSENSE_API_KEY=${opnsense_api_key}
OPNSENSE_API_SECRET=${opnsense_api_secret}
SKIP_SSL_VERIFICATION=${skip_ssl}

# Database Configuration
DATABASE_URL=file:${INSTALL_DIR}/data/db/instradaogm.db

# Security Secrets
NEXTAUTH_SECRET=${nextauth_secret}
BACKUP_ENCRYPTION_SECRET_KEY=${backup_encryption_key}

# Application Settings
PORT=3000
NODE_ENV=production
APP_DEBUG_LEVEL=ERROR
NEXTAUTH_URL=http://${server_ip}:3000
ALLOW_HTTP=true

# Local Authentication
AUTH_ALLOW_LOCAL_LOGIN=true
AUTH_ENABLE_OPNSENSE_LOGIN=false

# Optional SMTP Configuration (uncomment and configure if needed)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=your-app-password
# SMTP_FROM=your-email@gmail.com
EOF

    chmod 600 "$env_file" >> "$LOG_FILE" 2>&1
    msg_ok "Environment configuration created"
    
    if [[ $configure_now == false ]]; then
        echo ""
        echo -e "${YELLOW}============================================${NC}"
        echo -e "${YELLOW}IMPORTANT: Configuration Required${NC}"
        echo -e "${YELLOW}============================================${NC}"
        echo -e "${YELLOW}You chose to skip OPNsense configuration.${NC}"
        echo -e "${YELLOW}Before using the application, edit:${NC}"
        echo -e "${YELLOW}  ${INSTALL_DIR}/.env${NC}"
        echo ""
        echo -e "${YELLOW}Update the following values:${NC}"
        echo -e "${YELLOW}  - OPNSENSE_URL${NC}"
        echo -e "${YELLOW}  - OPNSENSE_API_KEY${NC}"
        echo -e "${YELLOW}  - OPNSENSE_API_SECRET${NC}"
        echo -e "${YELLOW}  - SKIP_SSL_VERIFICATION (if needed)${NC}"
        echo ""
        echo -e "${YELLOW}After editing, restart the service:${NC}"
        echo -e "${YELLOW}  systemctl restart ${SERVICE_NAME}${NC}"
        echo -e "${YELLOW}============================================${NC}"
        echo ""
    fi
}

#########################################
# Database and Directory Setup
#########################################

setup_directories() {
    msg_info "Setting up application directories..."
    
    cd "$INSTALL_DIR" || msg_error "Failed to change to installation directory"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        msg_error "package.json not found in $INSTALL_DIR. Installation package may be corrupted."
    fi
    
    export NODE_OPTIONS='--max-old-space-size=512'
    
    echo "Running: npm run setup-dirs" >> "$LOG_FILE"
    if ! npm run setup-dirs >> "$LOG_FILE" 2>&1; then
        echo "npm run setup-dirs failed. Last 20 lines of log:" >&2
        tail -n 20 "$LOG_FILE" >&2
        unset NODE_OPTIONS
        msg_error "Failed to create application directories. Check $LOG_FILE for details."
    fi
    
    chmod 755 "${INSTALL_DIR}/data" >> "$LOG_FILE" 2>&1
    
    unset NODE_OPTIONS
    
    msg_ok "Application directories created"
}

initialize_database() {
    msg_info "Initializing database..."
    
    cd "$INSTALL_DIR" || msg_error "Failed to change to installation directory"
    
    export NODE_OPTIONS='--max-old-space-size=512'
    
    # Export DATABASE_URL from .env
    if [[ -f "${INSTALL_DIR}/.env" ]]; then
        export DATABASE_URL=$(grep "^DATABASE_URL=" "${INSTALL_DIR}/.env" | cut -d'=' -f2-)
        echo "DATABASE_URL: $DATABASE_URL" >> "$LOG_FILE"
    else
        unset NODE_OPTIONS
        msg_error ".env file not found"
    fi
    
    msg_info "Running database migrations..."
    echo "Running: npm run db:init" >> "$LOG_FILE"
    if ! npm run db:init >> "$LOG_FILE" 2>&1; then
        echo "npm run db:init failed. Last 30 lines of log:" >&2
        tail -n 30 "$LOG_FILE" >&2
        unset NODE_OPTIONS
        msg_error "Database migration failed. Check $LOG_FILE for details."
    fi
    
    msg_info "Seeding database..."
    echo "Running: npm run db:seed" >> "$LOG_FILE"
    if ! npm run db:seed >> "$LOG_FILE" 2>&1; then
        echo "npm run db:seed failed. Last 30 lines of log:" >&2
        tail -n 30 "$LOG_FILE" >&2
        unset NODE_OPTIONS
        msg_error "Database seeding failed. Check $LOG_FILE for details."
    fi
    
    unset NODE_OPTIONS
    
    # Verify database file exists
    if [[ ! -f "${INSTALL_DIR}/data/db/instradaogm.db" ]]; then
        msg_error "Database file not found after initialization at ${INSTALL_DIR}/data/db/instradaogm.db"
    fi
    
    msg_ok "Database initialized successfully"
}

#########################################
# Systemd Service Setup
#########################################

create_systemd_service() {
    msg_info "Creating systemd service..."
    
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
    
    # Get the actual path to node
    local node_path
    node_path=$(which node)
    
    if [[ -z "$node_path" ]]; then
        msg_error "Cannot find node executable. Please ensure Node.js is properly installed."
    fi
    
    echo "Using node at: $node_path" >> "$LOG_FILE"
    
    cat > "$service_file" << EOF
[Unit]
Description=InstradaOGM Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${node_path} server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

    msg_info "Reloading systemd daemon..."
    systemctl daemon-reload >> "$LOG_FILE" 2>&1
    
    msg_info "Enabling service..."
    systemctl enable "$SERVICE_NAME" >> "$LOG_FILE" 2>&1
    
    msg_info "Starting service..."
    systemctl start "$SERVICE_NAME" >> "$LOG_FILE" 2>&1
    
    # Wait a moment for service to start
    sleep 2
    
    # Verify service is running
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        msg_ok "Service started successfully"
    else
        msg_error "Service failed to start. Check logs with: journalctl -u $SERVICE_NAME -n 50"
    fi
}

#########################################
# Usage Documentation
#########################################

show_help() {
    cat << EOF
InstradaOGM Installation Script

Usage:
    sudo ./install-instradaogm.sh [OPTIONS]

Options:
    --latest            Install the latest version (default)
    --version <version> Install a specific version (e.g., v1.0.1)
    --update            Update existing installation to latest or specified version
    --reinstall         Reinstall the current version (useful for fixing corrupted installations)
    --clean-backups     Remove all backup directories created during installations
    --uninstall         Completely remove InstradaOGM from the system
    --help              Display this help message

Examples:
    # Install latest version
    sudo ./install-instradaogm.sh --latest

    # Install specific version
    sudo ./install-instradaogm.sh --version v1.0.1
    
    # Update to latest version
    sudo ./install-instradaogm.sh --update
    
    # Update to specific version
    sudo ./install-instradaogm.sh --update --version v1.0.2
    
    # Reinstall current version (repair installation)
    sudo ./install-instradaogm.sh --reinstall
    
    # Clean up old backup directories
    sudo ./install-instradaogm.sh --clean-backups
    
    # Uninstall InstradaOGM
    sudo ./install-instradaogm.sh --uninstall

Requirements:
    - Root or sudo privileges
    - Internet connection
    - Supported architecture (amd64 or arm64)
    - Debian/Ubuntu or RHEL-based Linux distribution

What this script does:
    1. Detects system architecture
    2. Installs required dependencies (Node.js v23, sqlite3, etc.)
    3. Downloads prebuilt package from GitHub
    4. Extracts and installs to /opt/instradaogm
    5. Configures environment variables
    6. Initializes SQLite database
    7. Creates and starts systemd service

Update Mode:
    When using --update flag, the script will:
    1. Check current version and compare with target
    2. Download new version package
    3. Stop the running service
    4. Backup .env and data directories
    5. Download and extract new version
    6. Restore configuration and data
    7. Run database migrations
    8. Restart the service

Reinstall Mode:
    When using --reinstall flag, the script will:
    1. Detect the currently installed version
    2. Reinstall the same version (useful for fixing corrupted files)
    3. Preserve all configuration and data

Clean Backups:
    When using --clean-backups flag, the script will:
    1. Find all backup directories (instradaogm.backup.*)
    2. Show total space used
    3. Prompt for confirmation
    4. Remove all backup directories

Uninstall:
    When using --uninstall flag, the script will:
    1. Stop and disable the systemd service
    2. Remove the systemd service file
    3. Remove the installation directory
    4. Optionally remove all data and backup directories

For more information, visit: https://github.com/${REPO_OWNER}/${REPO_NAME}
EOF
}

#########################################
# Post-Installation Information
#########################################

show_post_install_info() {
    local server_ip
    server_ip=$(grep "^NEXTAUTH_URL=" "${INSTALL_DIR}/.env" | cut -d'=' -f2- | sed 's|http://||' | cut -d':' -f1)
    
    echo ""
    echo "============================================"
    echo -e "${GREEN}Installation Complete!${NC}"
    echo "============================================"
    echo ""
    echo "Service Status:"
    systemctl status "$SERVICE_NAME" --no-pager | head -n 5
    echo ""
    echo "Access URL:"
    echo -e "  ${BLUE}http://${server_ip}:3000${NC}"
    echo ""
    echo "Installation Directory:"
    echo "  ${INSTALL_DIR}"
    echo ""
    echo "Configuration File:"
    echo "  ${INSTALL_DIR}/.env"
    echo ""
    echo "Log Files:"
    echo "  Installation: ${LOG_FILE}"
    echo "  Service logs: journalctl -u ${SERVICE_NAME} -f"
    echo ""
    echo "Useful Commands:"
    echo "  View logs:     journalctl -u ${SERVICE_NAME} -f"
    echo "  Restart:       systemctl restart ${SERVICE_NAME}"
    echo "  Stop:          systemctl stop ${SERVICE_NAME}"
    echo "  Status:        systemctl status ${SERVICE_NAME}"
    echo ""
    echo "Next Steps:"
    echo "  1. Access the application at http://${server_ip}:3000"
    echo "  2. Create an admin account"
    echo "  3. Configure OPNsense connection"
    echo ""
    echo "============================================"
}

#########################################
# Main Script Flow
#########################################

main() {
    local version_to_install=""
    local install_latest=true
    local update_mode=false
    local reinstall_mode=false
    local clean_backups=false
    local uninstall_mode=false
    
    # Parse command-line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --version)
                version_to_install="$2"
                install_latest=false
                shift 2
                ;;
            --latest)
                install_latest=true
                shift
                ;;
            --update)
                update_mode=true
                shift
                ;;
            --reinstall)
                reinstall_mode=true
                shift
                ;;
            --clean-backups)
                clean_backups=true
                shift
                ;;
            --uninstall)
                uninstall_mode=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done
    
    # If clean-backups mode, run cleanup and exit
    if [[ "$clean_backups" == true ]]; then
        clean_backup_directories
    fi
    
    # If uninstall mode, run uninstall and exit
    if [[ "$uninstall_mode" == true ]]; then
        uninstall_instradaogm
    fi
    
    # Display banner
    echo ""
    echo " ___           _                 _         ___   ____  __  __"
    echo "|_ _|_ __  ___| |_ _ __ __ _  __| | __ _  / _ \ / ___|/  \/  \\"
    echo " | || '_ \/ __| __| '__/ _\` |/ _\` |/ _\` || | | | |  _|  |\/| |"
    echo " | || | | \__ \ |_| | | (_| | (_| | (_| || |_| | |_| |  |  | |"
    echo "|___|_| |_|___/\__|_|  \__,_|\__,_|\__,_| \___/ \____|__|  |_|"
    echo ""
    
    if [[ "$update_mode" == true ]]; then
        echo "Update Script - Database: SQLite"
        echo ""
        
        # Ask for confirmation to proceed with update
        echo "This script will update your existing InstradaOGM installation."
        echo ""
        read -p "Do you want to proceed with the update? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Update cancelled."
            exit 0
        fi
    elif [[ "$reinstall_mode" == true ]]; then
        echo "Reinstall Script - Database: SQLite"
        echo ""
        
        # Warning about reinstall consequences
        echo -e "${RED}⚠️  WARNING: REINSTALL MODE${NC}"
        echo ""
        echo "Reinstalling will:"
        echo "  • Reset the database to default (all data will be lost)"
        echo "  • Reset the .env file to default configuration"
        echo "  • Reinstall all application files"
        echo ""
        echo -e "${YELLOW}If you want to preserve your data and configuration, use --update instead.${NC}"
        echo ""
        
        read -p "Are you sure you want to reinstall and lose all data? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Reinstall cancelled."
            exit 0
        fi
    else
        echo "Installation Script - Database: SQLite"
        echo ""
        
        # Ask for confirmation to proceed with installation
        echo "This script will install InstradaOGM on your system."
        echo ""
        read -p "Do you want to proceed with the installation? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Installation cancelled."
            exit 0
        fi
    fi
    echo ""
    
    # Initialize log file
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "Installation started at $(date)" > "$LOG_FILE"
    
    # Check root privileges
    check_root
    
    # Detect architecture
    detect_architecture
    
    # Check and install dependencies
    if ! check_dependencies; then
        install_dependencies
    fi
    
    # Ensure jq is installed for JSON parsing
    if ! command -v jq &> /dev/null; then
        msg_info "Installing jq for JSON parsing..."
        if command -v apt-get &> /dev/null; then
            apt-get install -y jq >> "$LOG_FILE" 2>&1
        elif command -v yum &> /dev/null; then
            yum install -y jq >> "$LOG_FILE" 2>&1
        elif command -v dnf &> /dev/null; then
            dnf install -y jq >> "$LOG_FILE" 2>&1
        fi
    fi
    
    # Setup Node.js
    setup_nodejs
    
    # Determine version to install
    if [[ "$install_latest" == true ]]; then
        version_to_install=$(get_latest_version)
        msg_ok "Latest version: $version_to_install"
    else
        msg_info "Installing version: $version_to_install"
    fi
    
    # If update mode, run update function and exit
    if [[ "$update_mode" == true ]]; then
        echo ""
        echo "============================================"
        echo "Update Mode"
        echo "============================================"
        echo "  Version:      $version_to_install"
        echo "  Architecture: $ARCH"
        echo "  Install Dir:  $INSTALL_DIR"
        echo ""
        
        read -p "Proceed with update? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            msg_error "Update cancelled by user"
        fi
        
        update_instradaogm "$version_to_install" "$ARCH"
        exit 0
    fi
    
    # Check for existing installation (for fresh install mode)
    if [[ -d "$INSTALL_DIR" ]] && [[ -f "$INSTALL_DIR/package.json" ]]; then
        local existing_version
        existing_version=$(grep '"version"' "$INSTALL_DIR/package.json" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
        
        if [[ -n "$existing_version" ]]; then
            # Add 'v' prefix if not present
            [[ "$existing_version" != v* ]] && existing_version="v$existing_version"
            
            # Normalize version_to_install for comparison
            local normalized_version="$version_to_install"
            [[ "$normalized_version" != v* ]] && normalized_version="v$normalized_version"
            
            if [[ "$reinstall_mode" == true ]]; then
                # Reinstall mode - allow installation even if same version
                msg_info "Reinstall mode: Current version $existing_version will be reinstalled"
            else
                # Not in reinstall mode - check if installation exists
                echo ""
                echo -e "${RED}ERROR: InstradaOGM is already installed!${NC}"
                echo ""
                echo "Current version: $existing_version"
                echo "Requested version: $normalized_version"
                echo ""
                
                # Compare versions to give helpful message
                if [[ "$existing_version" == "$normalized_version" ]]; then
                    echo "The requested version is already installed."
                    echo "Use --reinstall flag to reinstall the same version:"
                    echo "  sudo $0 --reinstall"
                else
                    echo "A different version is installed."
                    echo "Use --update flag to update to a different version:"
                    echo "  sudo $0 --update --version $normalized_version"
                fi
                echo ""
                exit 1
            fi
        fi
    fi
    
    # Display installation summary
    echo ""
    if [[ "$reinstall_mode" == true ]]; then
        echo "Reinstallation Summary:"
    else
        echo "Installation Summary:"
    fi
    echo "  Version:      $version_to_install"
    echo "  Architecture: $ARCH"
    echo "  Database:     $DB_TYPE"
    echo "  Install Dir:  $INSTALL_DIR"
    echo ""
    
    read -p "Proceed with installation? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        msg_error "Installation cancelled by user"
    fi
    
    # If reinstalling, stop the service first
    if [[ "$reinstall_mode" == true ]]; then
        msg_info "Stopping InstradaOGM service for reinstallation..."
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            systemctl stop "$SERVICE_NAME" >> "$LOG_FILE" 2>&1
            msg_ok "Service stopped"
        else
            msg_info "Service was not running"
        fi
    fi
    
    # Download package
    msg_info "Downloading package from GitHub..."
    local package_path
    package_path=$(download_prebuilt_package "$version_to_install" "$ARCH")
    msg_ok "Package downloaded: $(basename "$package_path")"
    
    # Prepare installation directory (skip confirmation if reinstalling)
    if [[ "$reinstall_mode" == true ]]; then
        prepare_installation "true"
    else
        prepare_installation
    fi
    
    # Extract package
    extract_package "$package_path"
    
    # Create environment file
    create_environment_file
    
    # Setup directories
    setup_directories
    
    # Initialize database
    initialize_database
    
    # Create systemd service
    create_systemd_service
    
    # Clean up downloaded package
    msg_info "Cleaning up temporary files..."
    rm -f "$package_path"
    
    # Display post-installation information
    show_post_install_info
    
    echo "Installation log saved to: ${LOG_FILE}"
    echo ""
}

# Run main function
main "$@"
