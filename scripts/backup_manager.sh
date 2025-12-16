#!/bin/bash

# InstradaOGM Backup Manager Script
# Automatically creates and downloads database backups

set -e  # Exit on any error

# Default values
SCRIPT_NAME="backup_manager.sh"
DEFAULT_DEST_DIR="./backups"
SERVER_URL=""
API_KEY=""
CUSTOM_FILENAME=""
BACKUP_PREFIX="instrada-ogm"
VERBOSE=false
DRY_RUN=false
DELETE_REMOTE=false
FORCE_DELETE_REMOTE=false
ENV_FILE="$(dirname "$0")/.env"
VAR_FILE="$(dirname "$0")/.backup_instrada_vars"
EMAIL_NOTIFICATIONS=false
EMAIL_TO=""
EMAIL_SUBJECT=""
EMAIL_FROM=""
SMTP_SERVER=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASSWORD=""

# Load environment variables from .backup_instrada_vars file if it exists
load_env_file() {
    # Check for .backup_instrada_vars file
    if [ -f "$VAR_FILE" ]; then
        log_info "Loading variables from: $VAR_FILE"
        
        # Read the variable file and process placeholders
        while IFS= read -r line; do
            # Skip comments and empty lines
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ -z "$line" ]] && continue
            
            # Extract variable name and value (handling placeholders)
            if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
                var_name="${BASH_REMATCH[1]}"
                var_value="${BASH_REMATCH[2]}"
                
                # Skip placeholder values (still contain {{}})
                if [[ "$var_value" =~ \{\{.*\}\} ]]; then
                    log_info "Skipping placeholder variable: $var_name"
                    continue
                fi
                
                # Set the variable
                case "$var_name" in
                    INSTRADA_SERVER_URL)
                        SERVER_URL="${SERVER_URL:-$var_value}"
                        ;;
                    INSTRADA_API_KEY)
                        API_KEY="${API_KEY:-$var_value}"
                        ;;
                    BACKUP_DEST_DIR)
                        DEST_DIR="${DEST_DIR:-$var_value}"
                        ;;
                    CUSTOM_BACKUP_NAME)
                        CUSTOM_FILENAME="${CUSTOM_FILENAME:-$var_value}"
                        ;;
                    BACKUP_PREFIX)
                        BACKUP_PREFIX="${BACKUP_PREFIX:-$var_value}"
                        ;;
                    EMAIL_TO)
                        EMAIL_TO="${EMAIL_TO:-$var_value}"
                        ;;
                    EMAIL_FROM)
                        EMAIL_FROM="${EMAIL_FROM:-$var_value}"
                        ;;
                    EMAIL_SUBJECT)
                        EMAIL_SUBJECT="${EMAIL_SUBJECT:-$var_value}"
                        ;;
                    SMTP_SERVER)
                        SMTP_SERVER="${SMTP_SERVER:-$var_value}"
                        ;;
                    SMTP_PORT)
                        SMTP_PORT="${SMTP_PORT:-$var_value}"
                        ;;
                    SMTP_USER)
                        SMTP_USER="${SMTP_USER:-$var_value}"
                        ;;
                    SMTP_PASSWORD)
                        SMTP_PASSWORD="${SMTP_PASSWORD:-$var_value}"
                        ;;
                    DELETE_REMOTE)
                        DELETE_REMOTE="${DELETE_REMOTE:-$var_value}"
                        ;;
                esac
            fi
        done < "$VAR_FILE"
        
        log_info "Variables loaded from $VAR_FILE"
    else
        log_info "No configuration file found at: $VAR_FILE"
        log_info "Using command line arguments or defaults"
    fi
}

# Create sample variable file
create_var_file() {
    cat > "$VAR_FILE" << 'EOF'
# InstradaOGM Backup Manager - Variable Configuration File
# Copy this file and replace the {{PLACEHOLDER}} values with your actual values

# Server Configuration
INSTRADA_SERVER_URL={{SERVER_URL}}
INSTRADA_API_KEY={{API_KEY}}

# Backup Configuration
BACKUP_DEST_DIR={{BACKUP_DEST_DIR}}
CUSTOM_BACKUP_NAME={{CUSTOM_BACKUP_NAME}}

# Email Configuration
EMAIL_TO={{EMAIL_TO}}
EMAIL_FROM={{EMAIL_FROM}}
EMAIL_SUBJECT={{EMAIL_SUBJECT}}
SMTP_SERVER={{SMTP_SERVER}}
SMTP_PORT={{SMTP_PORT}}
SMTP_USER={{SMTP_USER}}
SMTP_PASSWORD={{SMTP_PASSWORD}}

# Optional settings
# VERBOSE=true
# DELETE_REMOTE=true

# Notes:
# - Replace {{PLACEHOLDER}} with actual values
# - API key must have SUPER_ADMIN privileges
# - Server URL should include protocol (http:// or https://)
# - BACKUP_DEST_DIR will be created if it doesn't exist
# - Email configuration is optional but required for --email notifications
# - Command line arguments override these settings
# - To use this file, copy it to .backup_instrada_vars and replace placeholders
#
# SMTP Configuration Examples:
#
# Local mail relay (no auth, no encryption):
#   SMTP_SERVER=localhost
#   SMTP_PORT=25
#   SMTP_USER=
#   SMTP_PASSWORD=
#
# Gmail (requires App Password - https://myaccount.google.com/apppasswords):
#   SMTP_SERVER=smtp.gmail.com
#   SMTP_PORT=587
#   SMTP_USER=your-email@gmail.com
#   SMTP_PASSWORD=your-app-password
#
# Gmail with SSL (port 465):
#   SMTP_SERVER=smtp.gmail.com
#   SMTP_PORT=465
#   SMTP_USER=your-email@gmail.com
#   SMTP_PASSWORD=your-app-password
#
# Outlook/Office365:
#   SMTP_SERVER=smtp.office365.com
#   SMTP_PORT=587
#   SMTP_USER=your-email@outlook.com
#   SMTP_PASSWORD=your-password
EOF

    log_success "Sample variable file created: $VAR_FILE"
    log_info "Edit the file and replace {{PLACEHOLDER}} values with your actual configuration"
    log_info "Then run: $SCRIPT_NAME"
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Send email notification
send_email_notification() {
    local backup_filename="$1"
    local file_size="$2"

    log_info "=== EMAIL NOTIFICATION PROCESS STARTING ==="

    if [ "$EMAIL_NOTIFICATIONS" != true ]; then
        log_info "Email notifications are disabled"
        return 0
    fi

    log_info "Email notifications are enabled"

    # Check if required email parameters are set
    log_info "Checking email configuration..."

    if [ -z "$EMAIL_TO" ]; then
        log_error "EMAIL_TO is not configured"
        return 1
    else
        log_info "EMAIL_TO: $EMAIL_TO"
    fi

    if [ -z "$EMAIL_FROM" ]; then
        log_error "EMAIL_FROM is not configured"
        return 1
    else
        log_info "EMAIL_FROM: $EMAIL_FROM"
    fi

    # Set default values
    local subject="${EMAIL_SUBJECT:-InstradaOGM Backup Completed}"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local smtp_server="${SMTP_SERVER:-localhost}"
    local smtp_port="${SMTP_PORT:-25}"

    log_info "Email subject: $subject"
    log_info "Timestamp: $timestamp"
    log_info "SMTP server: $smtp_server:$smtp_port"

    # Create temporary file for email content
    local email_file=$(mktemp)

    # Build email in RFC 5322 format
    cat > "$email_file" << EOF
From: $EMAIL_FROM
To: $EMAIL_TO
Subject: $subject
Date: $(date -R)
Content-Type: text/plain; charset=UTF-8

InstradaOGM backup process completed successfully.

Server: $SERVER_URL
Backup Filename: $backup_filename
File Size: $file_size
Completed: $timestamp

This is an automated notification from InstradaOGM Backup Manager Script.
EOF

    log_info "Email content created"

    # Determine protocol and build curl command
    local curl_cmd="curl -s --max-time 30"
    local protocol="smtp"

    # Check if authentication is required
    if [ -n "$SMTP_USER" ] && [ -n "$SMTP_PASSWORD" ]; then
        log_info "SMTP authentication enabled"
        curl_cmd="$curl_cmd --user \"$SMTP_USER:$SMTP_PASSWORD\""

        # Determine encryption based on port
        if [ "$smtp_port" = "465" ]; then
            # Port 465 uses implicit SSL/TLS
            protocol="smtps"
            log_info "Using implicit SSL/TLS (port 465)"
        elif [ "$smtp_port" = "587" ]; then
            # Port 587 uses STARTTLS
            curl_cmd="$curl_cmd --ssl-reqd"
            log_info "Using STARTTLS encryption (port 587)"
        else
            log_warning "Authentication enabled but non-standard port $smtp_port - using plain SMTP"
        fi
    else
        log_info "No SMTP authentication (plain SMTP on port $smtp_port)"
    fi

    # Build final curl command
    curl_cmd="$curl_cmd --url \"$protocol://$smtp_server:$smtp_port\" --mail-from \"$EMAIL_FROM\" --mail-rcpt \"$EMAIL_TO\" --upload-file \"$email_file\""

    # Send email using curl with SMTP
    log_info "Sending email via curl SMTP..."
    if [ "$VERBOSE" = true ]; then
        log_info "Command: $curl_cmd"
    fi

    local curl_output
    local curl_exit_code

    # Execute curl command
    curl_output=$(eval "$curl_cmd" 2>&1)
    curl_exit_code=$?

    # Clean up temp file
    rm -f "$email_file"

    if [ $curl_exit_code -eq 0 ]; then
        log_success "Email notification sent successfully via curl SMTP"
        log_info "Recipient: $EMAIL_TO"
        log_info "Subject: $subject"
        log_info "SMTP server: $smtp_server:$smtp_port"
    else
        log_error "curl SMTP failed with exit code: $curl_exit_code"
        if [ -n "$curl_output" ]; then
            log_error "curl output: $curl_output"
        fi
        log_error "Failed to send email notification"
        log_info "Check SMTP server configuration: $smtp_server:$smtp_port"
        return 1
    fi

    log_info "=== EMAIL NOTIFICATION PROCESS COMPLETED ==="
    return 0
}

# Logging functions
log_info() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[INFO]${NC} $1" >&2
    fi
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Help function
show_help() {
    cat << EOF
$SCRIPT_NAME - InstradaOGM Backup Manager

USAGE:
    $SCRIPT_NAME [OPTIONS] [-s SERVER_URL] [-k API_KEY] [-d DESTINATION] [-f FILENAME] [-v] [-n] [--help]

OPTIONS:
    -s, --server URL      Server URL (e.g., https://instrada-ogm.example.com)
                          Can also be set via INSTRADA_SERVER_URL in .env file
    -k, --key API_KEY      API key with SUPER_ADMIN privileges
                          Can also be set via INSTRADA_API_KEY in .env file
    -d, --dest DIR         Destination directory for backup file (default: $DEFAULT_DEST_DIR)
                          Can also be set via BACKUP_DEST_DIR in .env file
    -f, --filename NAME    Custom backup filename (without extension)
    -p, --prefix PREFIX    Add a prefix to the auto-generated timestamp filename
                          (default: "instrada-ogm", e.g., "instrada-ogm_2025_11_21T10_56_58_839Z.postgresql.aes")
                          Use --prefix "" to disable prefix and use default "backup" naming
    -v, --verbose          Enable verbose output
    -n, --dry-run         Show what would be done without executing
    --delete-remote        Delete backup file from remote server after download
    --force-delete-remote   Force delete remote backup even if download fails
    --email                Enable email notifications (requires email configuration)
    --email-to EMAIL       Recipient email address
    --email-from EMAIL     Sender email address
    --email-subject SUBJ   Email subject line
    --smtp-server SERVER   SMTP server address (default: localhost)
    --smtp-port PORT       SMTP server port (default: 25)
                          Use 587 for STARTTLS, 465 for SSL/TLS, 25 for plain
    --smtp-user USER       SMTP username (enables authentication)
    --smtp-pass PASS       SMTP password (required if --smtp-user is set)
    --make-var-file        Create sample .backup_instrada_vars file with placeholders
    -h, --help             Show this help message

ENVIRONMENT FILE (.env):
    Place a .env file in the same directory as the script with the following variables:
    
    # Server Configuration
    INSTRADA_SERVER_URL=https://instrada-ogm.example.com
    INSTRADA_API_KEY=your-super-admin-api-key-here
    
    # Backup Configuration
    BACKUP_DEST_DIR=/path/to/backup/directory
    
    Command line arguments override .env file settings.

VARIABLE FILE (.backup_instrada_vars):
    Alternatively, use --make-var-file to create a sample variable file with placeholders.
    This file format uses variable placeholders for easier configuration management.
    
    # Server Configuration
    INSTRADA_SERVER_URL={{SERVER_URL}}
    INSTRADA_API_KEY={{API_KEY}}
    
    # Backup Configuration
    BACKUP_DEST_DIR={{BACKUP_DEST_DIR}}
    CUSTOM_BACKUP_NAME={{CUSTOM_BACKUP_NAME}}

EXAMPLES:
    # Using .env file (recommended)
    $SCRIPT_NAME
    
    # Override server URL from .env
    $SCRIPT_NAME -s https://staging.instrada-ogm.example.com
    
    # Custom destination directory
    $SCRIPT_NAME -d /path/to/backups
    
    # Default backup (uses "instrada-ogm" prefix)
    $SCRIPT_NAME
    # Result: instrada-ogm_2025_11_21T10_56_58_839Z.postgresql.aes

    # Custom filename and verbose output
    $SCRIPT_NAME -f "daily_backup_$(date +%Y%m%d)" -v

    # Add custom prefix to auto-generated timestamp filename
    $SCRIPT_NAME -p "daily" -v
    # Result: daily_2025_11_21T10_56_58_839Z.postgresql.aes

    # Disable prefix (use "backup" naming)
    $SCRIPT_NAME -p "" -v
    # Result: backup_2025_11_21T10_56_58_839Z.postgresql.aes

    # Create sample variable file
    $SCRIPT_NAME --make-var-file
    
    # Enable email notifications (local mail relay)
    $SCRIPT_NAME --email --email-to admin@example.com --email-from backup@example.com

    # Send email via Gmail (requires App Password)
    $SCRIPT_NAME --email --email-to admin@example.com --email-from you@gmail.com \\
        --smtp-server smtp.gmail.com --smtp-port 587 \\
        --smtp-user you@gmail.com --smtp-pass your-app-password

    # Download and delete remote backup
    $SCRIPT_NAME --delete-remote

    # Force delete remote backup even if download fails
    $SCRIPT_NAME --force-delete-remote

    # Dry run to test configuration
    $SCRIPT_NAME -n

DESCRIPTION:
    This script automates the process of creating and downloading database backups
    from an InstradaOGM server. It requires SUPER_ADMIN privileges and supports
    both SQLite and PostgreSQL databases.

    The script can load configuration from a .env file in the same directory,
    making it portable and easy to use across different environments.

    Email notifications can be enabled to send backup completion status via SMTP.
    The script uses curl to send emails directly via SMTP with support for:
    - Plain SMTP (port 25) for local mail relays
    - STARTTLS encryption (port 587) for Gmail, Outlook, etc.
    - SSL/TLS encryption (port 465) for secure connections
    - SMTP authentication when username and password are provided

    Remote backup deletion can be enabled to automatically remove the backup file
    from the server after successful download, keeping only the local copy.
    
    Force remote deletion can be used to delete the backup file from the server
    even if the download fails, ensuring cleanup of remote storage.

    The backup files are automatically encrypted with AES encryption and stored
    with the appropriate file extension (.sqlite.aes or .postgresql.aes).

EXIT CODES:
    0   Success
    1   General error
    2   Invalid arguments
    3   Authentication failed
    4   Network/Server error
    5   File system error

AUTHOR:
    InstradaOGM Development Team

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--server)
                SERVER_URL="$2"
                shift 2
                ;;
            -k|--key)
                API_KEY="$2"
                shift 2
                ;;
            -d|--dest)
                DEST_DIR="$2"
                shift 2
                ;;
            -f|--filename)
                CUSTOM_FILENAME="$2"
                shift 2
                ;;
            -p|--prefix)
                BACKUP_PREFIX="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            --delete-remote)
                DELETE_REMOTE=true
                shift
                ;;
            --force-delete-remote)
                FORCE_DELETE_REMOTE=true
                shift
                ;;
            --make-var-file)
                create_var_file
                exit 0
                ;;
            --email)
                EMAIL_NOTIFICATIONS=true
                shift
                # Parse remaining email options
                while [[ $# -gt 0 && ! "$1" =~ ^- ]]; do
                    case $1 in
                        --email-to)
                            EMAIL_TO="$2"
                            shift 2
                            ;;
                        --email-from)
                            EMAIL_FROM="$2"
                            shift 2
                            ;;
                        --email-subject)
                            EMAIL_SUBJECT="$2"
                            shift 2
                            ;;
                        --smtp-server)
                            SMTP_SERVER="$2"
                            shift 2
                            ;;
                        --smtp-port)
                            SMTP_PORT="$2"
                            shift 2
                            ;;
                        --smtp-user)
                            SMTP_USER="$2"
                            shift 2
                            ;;
                        --smtp-pass)
                            SMTP_PASSWORD="$2"
                            shift 2
                            ;;
                        *)
                            log_error "Unknown email option: $1"
                            exit 2
                            ;;
                    esac
                done
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information."
                exit 2
                ;;
        esac
    done
}

# Validate arguments
validate_arguments() {
    if [ -z "$SERVER_URL" ]; then
        log_error "Server URL is required. Use -s or --server option."
        exit 2
    fi

    if [ -z "$API_KEY" ]; then
        log_error "API key is required. Use -k or --key option."
        exit 2
    fi

    # Set default destination if not provided
    if [ -z "$DEST_DIR" ]; then
        DEST_DIR="$DEFAULT_DEST_DIR"
    fi

    # Validate server URL format
    if [[ ! "$SERVER_URL" =~ ^https?:// ]]; then
        log_error "Server URL must start with http:// or https://"
        exit 2
    fi

    log_info "Server URL: $SERVER_URL"
    log_info "Destination directory: $DEST_DIR"
    log_info "Custom filename: ${CUSTOM_FILENAME:-auto-generated}"
    log_info "Backup prefix: ${BACKUP_PREFIX:-none}"
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    command -v curl >/dev/null 2>&1 || missing_deps+=("curl")
    command -v jq >/dev/null 2>&1 || missing_deps+=("jq")

    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install the missing tools and try again."
        exit 1
    fi

    log_info "All dependencies are available"
}

# Create destination directory if it doesn't exist
create_destination_dir() {
    if [ "$DRY_RUN" = false ]; then
        if ! mkdir -p "$DEST_DIR"; then
            log_error "Failed to create destination directory: $DEST_DIR"
            exit 5
        fi
        log_info "Destination directory created/verified: $DEST_DIR"
    else
        log_info "[DRY RUN] Would create destination directory: $DEST_DIR"
    fi
}

# Create backup
create_backup() {
    local backup_filename="$CUSTOM_FILENAME"
    local response_file=$(mktemp)

    # Determine the filename to send to API
    local api_filename=""

    # Priority: custom filename > prefix > default
    if [ -n "$CUSTOM_FILENAME" ]; then
        api_filename="$CUSTOM_FILENAME"
    elif [ -n "$BACKUP_PREFIX" ]; then
        api_filename="$BACKUP_PREFIX"
    fi

    # Prepare curl command
    local curl_cmd="curl -s -w '%{http_code}' -o '$response_file' -X POST '$SERVER_URL/api/settings/backup' -H 'Authorization: Bearer $API_KEY' -F 'action=backup'"

    if [ -n "$api_filename" ]; then
        curl_cmd="$curl_cmd -F 'filename=$api_filename'"
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would execute: $curl_cmd"
        # API will add timestamp if no extension is present
        if [ -n "$api_filename" ] && [[ ! "$api_filename" =~ \.aes$ ]]; then
            backup_filename="${api_filename}_$(date +%Y%m%dT%H%M%S_%3NZ)"
        else
            backup_filename="${api_filename:-backup_$(date +%Y%m%dT%H%M%S_%3NZ)}"
        fi
        echo "${backup_filename}.sqlite.aes"
        rm -f "$response_file"
        return 0
    fi

    log_info "Creating backup..."

    # Execute curl command
    local http_code
    http_code=$(eval "$curl_cmd")

    log_info "HTTP response code: $http_code"

    case $http_code in
        200)
            log_success "Backup creation initiated successfully"
            ;;
        401)
            log_error "Authentication failed. Check your API key and permissions."
            rm -f "$response_file"
            exit 3
            ;;
        403)
            log_error "Access denied. SUPER_ADMIN role required."
            rm -f "$response_file"
            exit 3
            ;;
        429)
            log_error "Rate limit exceeded. Please try again later."
            rm -f "$response_file"
            exit 4
            ;;
        *)
            log_error "Server returned HTTP $http_code"
            if [ -f "$response_file" ]; then
                log_error "Response: $(cat "$response_file")"
            fi
            rm -f "$response_file"
            exit 4
            ;;
    esac

    # Parse response to get filename
    if [ -f "$response_file" ]; then
        backup_filename=$(jq -r '.filename' "$response_file" 2>/dev/null)
        if [ "$backup_filename" = "null" ] || [ -z "$backup_filename" ]; then
            log_error "Failed to parse backup filename from response"
            log_error "Response: $(cat "$response_file")"
            rm -f "$response_file"
            exit 4
        fi
        rm -f "$response_file"
    else
        log_error "No response file available"
        exit 4
    fi

    echo "$backup_filename"
}

# Download backup
download_backup() {
    local filename="$1"
    # Expand tilde and create absolute path
    local expanded_dest_dir
    expanded_dest_dir=$(eval echo "$DEST_DIR")
    local local_path="$expanded_dest_dir/$filename"

    log_info "Downloading backup: $filename"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would download: $SERVER_URL/api/settings/backup/versions/$filename"
        log_info "[DRY RUN] Would save to: $local_path"
        return 0
    fi

    log_info "Local path: $local_path"

    # Download the file with timeout and better error handling
    local http_code
    log_info "Download URL: $SERVER_URL/api/settings/backup/versions/$filename"
    log_info "Download command: curl -s -w '%{http_code}' -o \"$local_path\" -X GET \"$SERVER_URL/api/settings/backup/versions/$filename\" -H \"Authorization: Bearer $API_KEY\""
    
    # Create directory if it doesn't exist
    local dir_path
    dir_path=$(dirname "$local_path")
    if [ ! -d "$dir_path" ]; then
        log_info "Creating directory: $dir_path"
        mkdir -p "$dir_path"
    fi
    
    log_info "Starting download with 5 minute timeout..."
    http_code=$(curl -s -w '%{http_code}' --max-time 300 --connect-timeout 30 -o "$local_path" \
        -X GET "$SERVER_URL/api/settings/backup/versions/$filename" \
        -H "Authorization: Bearer $API_KEY" 2>/tmp/curl_download.log || true)
    
    log_info "Download HTTP response code: $http_code"
    
    # Log any curl errors
    if [ -f /tmp/curl_download.log ]; then
        log_info "Curl output/errors: $(cat /tmp/curl_download.log)"
        rm -f /tmp/curl_download.log
    fi

    case $http_code in
        200)
            log_success "Backup downloaded successfully"
            ;;
        401)
            log_error "Authentication failed during download."
            rm -f "$local_path"
            exit 3
            ;;
        403)
            log_error "Access denied during download."
            rm -f "$local_path"
            exit 3
            ;;
        404)
            log_error "Backup file not found: $filename"
            rm -f "$local_path"
            exit 4
            ;;
        *)
            log_error "Download failed with HTTP $http_code"
            rm -f "$local_path"
            exit 4
            ;;
    esac

    # Verify file was downloaded
    log_info "Verifying downloaded file..."
    if [ ! -f "$local_path" ]; then
        log_error "Download failed - file not created locally at: $local_path"
        log_error "This prevents remote deletion. Check download URL and server connectivity."
        log_info "Remote file still exists on server and was NOT deleted."
        exit 5
    fi
    
    # Check file size to ensure it's not empty
    local actual_size
    # Cross-platform stat command (Linux uses -c, macOS/BSD uses -f)
    if stat -c%s "$local_path" >/dev/null 2>&1; then
        actual_size=$(stat -c%s "$local_path" 2>/dev/null || echo "0")
    else
        actual_size=$(stat -f%z "$local_path" 2>/dev/null || echo "0")
    fi
    if [ "$actual_size" = "0" ]; then
        log_error "Downloaded file is empty: $local_path"
        exit 5
    fi

    # Show file information
    local file_size
    file_size=$(du -h "$local_path" | cut -f1)
    log_success "Backup file saved: $local_path ($file_size)"
    log_info "Actual file size: $actual_size bytes"
}

# Delete remote backup
delete_remote_backup() {
    local filename="$1"
    
    log_info "=== REMOTE BACKUP DELETION PROCESS STARTING ==="
    log_info "Deleting remote backup: $filename"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would delete remote backup: $SERVER_URL/api/settings/backup/versions/$filename"
        log_info "[DRY RUN] Command: curl -X DELETE \"$SERVER_URL/api/settings/backup/versions/$filename\" -H \"Authorization: Bearer $API_KEY\""
        return 0
    fi
    
    # Delete the remote backup file
    local http_code
    local delete_url="$SERVER_URL/api/settings/backup/versions/$filename"
    local temp_response_file

    log_info "Delete URL: $delete_url"
    log_info "Delete command: curl -s -w '%{http_code}' -X DELETE \"$delete_url\" -H \"Authorization: Bearer $API_KEY\""

    # Use a temporary file to capture response body separately from HTTP code
    temp_response_file=$(mktemp)
    trap "rm -f '$temp_response_file'" RETURN

    http_code=$(curl -s -w '%{http_code}' \
        -X DELETE "$delete_url" \
        -H "Authorization: Bearer $API_KEY" \
        -o "$temp_response_file" || true)

    log_info "Delete HTTP response code: $http_code"

    case $http_code in
        200)
            log_success "Remote backup deleted successfully: $filename"
            ;;
        401)
            log_error "Authentication failed during remote backup deletion."
            return 3
            ;;
        403)
            log_error "Access denied during remote backup deletion."
            return 3
            ;;
        404)
            log_warning "Remote backup file not found for deletion: $filename (may have been already deleted)"
            return 0
            ;;
        429)
            log_error "Rate limit exceeded during deletion. Please try again later."
            return 4
            ;;
        *)
            log_error "Remote backup deletion failed with HTTP $http_code"
            return 4
            ;;
    esac
    
    log_info "=== REMOTE BACKUP DELETION PROCESS COMPLETED ==="
    return 0
}

# Main function
main() {
    echo "InstradaOGM Backup Manager"
    echo "========================="
    echo

    # Load environment variables first
    load_env_file
    
    # Parse command line arguments (which override .env settings)
    parse_arguments "$@"
    validate_arguments
    check_dependencies
    create_destination_dir

    echo
    log_info "Starting backup process..."
    log_info "Server: $SERVER_URL"
    log_info "Destination: $DEST_DIR"

    # Create backup
    backup_filename=$(create_backup)
    
    if [ "$DRY_RUN" = true ]; then
        echo
        log_success "Dry run completed successfully"
        log_info "Would create backup: $backup_filename"
        exit 0
    fi

    echo
    log_success "Backup created: $backup_filename"

    # Download backup
    echo

    # Try download with retries
    local retry_count=0
    local max_retries=3
    local download_success=false

    # Construct local path for verification
    local expanded_dest_dir
    expanded_dest_dir=$(eval echo "$DEST_DIR")
    local local_path="$expanded_dest_dir/$backup_filename"

    while [ $retry_count -lt $max_retries ] && [ "$download_success" = false ]; do
        retry_count=$((retry_count + 1))
        log_info "Download attempt $retry_count of $max_retries"

        download_backup "$backup_filename"
        local download_exit_code=$?

        # Check if download was successful
        if [ $download_exit_code -eq 0 ] && [ -f "$local_path" ]; then
            local actual_size
            # Cross-platform stat command (Linux uses -c, macOS/BSD uses -f)
            if stat -c%s "$local_path" >/dev/null 2>&1; then
                actual_size=$(stat -c%s "$local_path" 2>/dev/null || echo "0")
            else
                actual_size=$(stat -f%z "$local_path" 2>/dev/null || echo "0")
            fi
            if [ "$actual_size" != "0" ]; then
                log_success "Download successful on attempt $retry_count"
                download_success=true
            else
                log_warning "Downloaded file is empty on attempt $retry_count, retrying..."
                rm -f "$local_path"
            fi
        else
            log_warning "Download failed on attempt $retry_count, retrying..."
            if [ $retry_count -lt $max_retries ]; then
                log_info "Waiting 5 seconds before retry..."
                sleep 5
            fi
        fi
    done
    
    if [ "$download_success" = true ]; then
        backup_filename_status="success"
        log_success "Backup downloaded successfully after $retry_count attempts"
    else
        backup_filename_status="failed"
        log_error "Download failed after $max_retries attempts"
    fi

    # Get file size for email notification
    local file_size="Unknown"
    local expanded_dest_dir
    expanded_dest_dir=$(eval echo "$DEST_DIR")
    local local_path="$expanded_dest_dir/$backup_filename"
    
    if [ -f "$local_path" ]; then
        file_size=$(du -h "$local_path" | cut -f1)
        log_info "Downloaded file size: $file_size"
    fi

    # Delete remote backup if enabled
    echo
    if [ "$DELETE_REMOTE" = true ] || [ "$FORCE_DELETE_REMOTE" = true ]; then
        if [ "$FORCE_DELETE_REMOTE" = true ]; then
            log_info "Force deleting remote backup (download may have failed)..."
        elif [ "$backup_filename_status" = "failed" ]; then
            log_info "Deleting remote backup (download failed but cleanup requested)..."
        else
            log_info "Deleting remote backup..."
        fi
        if delete_remote_backup "$backup_filename"; then
            log_success "Remote backup deleted successfully"
        else
            log_warning "Failed to delete remote backup"
        fi
    else
        log_info "Remote backup deletion is disabled"
    fi

    # Send email notification if enabled
    echo
    if [ "$EMAIL_NOTIFICATIONS" = true ]; then
        log_info "Sending email notification..."
        send_email_notification "$backup_filename" "$file_size"
    else
        log_info "Email notifications are disabled"
    fi

    echo
    log_success "Backup process completed successfully!"
    log_info "Backup file: $DEST_DIR/$backup_filename"
}

# Run main function with all arguments
main "$@"