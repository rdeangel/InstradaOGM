#!/bin/bash

# Host Alias Creation Script for InstradaOGM
# This script creates host aliases for IP addresses in a specified range
# It intelligently detects existing hostnames and creates appropriate alias names

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

This script creates host aliases for IP addresses in a specified range using intelligent hostname detection:
- Detects existing hostnames from OPNsense ARP table
- Creates host aliases using sanitized hostnames when available
- Falls back to standard HOST_x_x_x_x format when no hostname is detected
- Skips IPs that already have host aliases (even with custom names)

Options:
    --url <URL>                    InstadaOGM server URL (e.g., https://instrada-ogm.example.com)
    --range <IP_RANGE>             IP range to process (e.g., 192.168.1.1-192.168.1.255)
    --dry-run                      Show what would be done without making changes
    --debug                        Enable debug output for troubleshooting
    --help                         Show this help message

Examples:
    $0 --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --dry-run
    $0 --url https://instrada-ogm.example.com --range 192.168.1.100-192.168.1.200
    $0 --url https://instrada-ogm.example.com --range 192.168.1.50-192.168.1.60 --debug

The script will prompt for your API key securely.

EOF
}

# Removed set -e to handle errors more gracefully

# Trap to handle script interruption
trap 'print_error "Script was interrupted or failed unexpectedly"; print_error "Please check your server URL and network connectivity"; exit 1' ERR

# Initialize variables
SERVER_URL=""
IP_RANGE=""
DRY_RUN="false"
DEBUG="false"
API_KEY=""
START_IP=""
END_IP=""
SYSTEM_SUMMARY_FILE=""

# Function to validate IP address
is_valid_ip() {
    local ip="$1"
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        local IFS='.'
        local -a octets=($ip)
        for octet in "${octets[@]}"; do
            if (( octet > 255 )); then
                return 1
            fi
        done
        return 0
    fi
    return 1
}

# Function to convert IP to integer
ip_to_int() {
    local ip="$1"
    local IFS='.'
    local -a octets=($ip)
    echo $(( (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3] ))
}

# Function to convert integer to IP
int_to_ip() {
    local int="$1"
    echo "$(( (int >> 24) & 255 )).$(( (int >> 16) & 255 )).$(( (int >> 8) & 255 )).$(( int & 255 ))"
}

# Function to parse IP range
parse_ip_range() {
    local range="$1"
    
    if [[ $range =~ ^([0-9.]+)-([0-9.]+)$ ]]; then
        START_IP="${BASH_REMATCH[1]}"
        END_IP="${BASH_REMATCH[2]}"
        
        if ! is_valid_ip "$START_IP" || ! is_valid_ip "$END_IP"; then
            print_error "Invalid IP addresses in range: $range"
            return 1
        fi
        
        local start_int=$(ip_to_int "$START_IP")
        local end_int=$(ip_to_int "$END_IP")
        
        if (( start_int > end_int )); then
            print_error "Start IP must be less than or equal to end IP"
            return 1
        fi
        
        return 0
    else
        print_error "Invalid IP range format. Use: start_ip-end_ip (e.g., 192.168.1.1-192.168.1.255)"
        return 1
    fi
}

# Function to test connectivity
test_connectivity() {
    print_status "Performing quick connectivity test..."
    
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed"
        return 1
    fi
    
    if ! command -v jq &> /dev/null; then
        print_error "jq is required but not installed"
        return 1
    fi
    
    # Test basic connectivity
    if ! curl -s --connect-timeout 5 --max-time 10 "$SERVER_URL" > /dev/null; then
        print_error "Cannot connect to server: $SERVER_URL"
        return 1
    fi
    
    print_success "Quick connectivity test passed"
    return 0
}

# Function to make API request
api_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    # Build curl command properly without eval
    local curl_args=(
        -s
        --connect-timeout 10
        --max-time 30
        -w "%{http_code}"
        -o /tmp/api_response
        -X "$method"
        -H "Authorization: Bearer $API_KEY"
        -H "Content-Type: application/json"
        "$SERVER_URL/api$endpoint"
    )
    
    if [ -n "$data" ]; then
        curl_args+=(-d "$data")
    fi
    
    local response
    response=$(curl "${curl_args[@]}")
    local http_code="${response: -3}"
    local api_response=$(cat /tmp/api_response 2>/dev/null)
    
    # Clean up temp file
    rm -f /tmp/api_response
    
    # Debug output if enabled
    if [ "$DEBUG" = "true" ]; then
        print_status "Debug: API $method $endpoint - HTTP $http_code" >&2
        if [ -n "$api_response" ]; then
            print_status "Debug: Response: ${api_response:0:200}..." >&2
        fi
    fi
    
    # Check HTTP status code
    if [ "$http_code" = "000" ]; then
        print_error "Network error - cannot connect to server"
        return 1
    elif [ "$http_code" = "401" ]; then
        print_error "Authentication failed - please check your API key"
        return 1
    elif [ "$http_code" = "403" ]; then
        print_error "Access forbidden - please check your API permissions"
        return 1
    elif [ "$http_code" = "404" ]; then
        print_error "API endpoint not found: $endpoint"
        return 1
    elif [ "$http_code" -ge 500 ]; then
        print_error "Server error (HTTP $http_code) - server may be experiencing issues"
        return 1
    elif [ "$http_code" -ge 400 ]; then
        print_error "Client error (HTTP $http_code): $api_response"
        return 1
    elif [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        # Check for JSON error messages in successful responses
        if echo "$api_response" | grep -q '"error":\|"message":.*[Ee]rror'; then
            print_error "API returned error in response: $api_response"
            return 1
        fi
        
        echo "$api_response"
        return 0
    else
        print_error "Unexpected HTTP status code: $http_code"
        return 1
    fi
}

# Function to get system summary and save to file
get_system_summary_to_file() {
    local output_file="$1"
    print_status "Fetching system summary..." >&2
    
    # Make the API call and save to output file
    local curl_args=(
        -s
        --connect-timeout 10
        --max-time 30
        -w "%{http_code}"
        -o "$output_file"
        -X "GET"
        -H "Authorization: Bearer $API_KEY"
        -H "Content-Type: application/json"
        "$SERVER_URL/api/admin/system-summary"
    )
    
    local http_code
    http_code=$(curl "${curl_args[@]}")
    
    # Check HTTP status code
    if [ "$http_code" != "200" ]; then
        print_error "System summary API returned HTTP $http_code"
        rm -f "$output_file"
        return 1
    fi
    
    # Check if file exists and has content
    if [ ! -f "$output_file" ] || [ ! -s "$output_file" ]; then
        print_error "Empty response from system summary API"
        rm -f "$output_file"
        return 1
    fi
    
    # Validate JSON
    if ! jq empty "$output_file" 2>/dev/null; then
        print_error "Invalid JSON response from system summary API"
        rm -f "$output_file"
        return 1
    fi
    
    return 0
}

# Function to get host alias by IP
get_host_alias_by_ip() {
    local ip="$1"

    local response
    response=$(api_request "GET" "/opnsense/host-alias-management?ipAddress=$ip")

    if [ $? -eq 0 ]; then
        local alias_name
        alias_name=$(echo "$response" | jq -r '.name // empty' 2>/dev/null)

        if [ -n "$alias_name" ] && [ "$alias_name" != "null" ]; then
            echo "$response"
            return 0
        fi
    fi

    return 1
}

# Function to detect hostname from ARP table
detect_hostname_from_arp() {
    local ip="$1"

    # Check if IP exists in ARP table with hostname
    local arp_entry
    arp_entry=$(jq -r --arg ip "$ip" '.hostAliasStats.total.lists.activeDevicesInArpTable[] | select(.content == $ip) | .detectedHostname // empty' "$SYSTEM_SUMMARY_FILE" 2>/dev/null)

    if [ -n "$arp_entry" ] && [ "$arp_entry" != "null" ]; then
        echo "$arp_entry"
        return 0
    fi

    return 1
}

# Function to sanitize hostname for OPNsense alias compatibility
sanitize_hostname() {
    local hostname="$1"

    # Convert to lowercase, replace hyphens with underscores, remove invalid characters
    echo "$hostname" | tr '[:upper:]' '[:lower:]' | sed 's/-/_/g' | sed 's/[^a-z0-9_]//g'
}

# Function to create host alias
create_host_alias() {
    local ip="$1"
    local alias_name="$2"
    local description="$3"

    print_status "Creating host alias: $alias_name for IP $ip"

    local alias_data="{
        \"alias\": {
            \"enabled\": \"1\",
            \"name\": \"$alias_name\",
            \"type\": \"host\",
            \"content\": \"$ip\",
            \"description\": \"$description\",
            \"proto\": \"\",
            \"interface\": \"\",
            \"counters\": \"0\",
            \"updatefreq\": \"\",
            \"categories\": \"\"
        }
    }"

    local response
    response=$(api_request "POST" "/opnsense/host-alias-management" "$alias_data")

    if [ $? -eq 0 ]; then
        # Check for success indicators in the response
        local message
        local uuid
        message=$(echo "$response" | jq -r '.message // empty' 2>/dev/null)
        uuid=$(echo "$response" | jq -r '.uuid // empty' 2>/dev/null)

        # Check if the message indicates success
        if echo "$message" | grep -qi "created.*successfully"; then
            print_success "Successfully created host alias: $alias_name for IP $ip (UUID: $uuid)"
            return 0
        elif [ -n "$uuid" ] && [ "$uuid" != "null" ]; then
            # If we got a UUID, it's likely successful
            print_success "Successfully created host alias: $alias_name for IP $ip (UUID: $uuid)"
            return 0
        else
            # Check for legacy "result": "saved" format
            local result
            result=$(echo "$response" | jq -r '.result // empty' 2>/dev/null)
            if [ "$result" = "saved" ]; then
                print_success "Successfully created host alias: $alias_name for IP $ip"
                return 0
            else
                print_error "Failed to create host alias: $message"
                return 1
            fi
        fi
    else
        print_error "Failed to create host alias for IP $ip"
        return 1
    fi
}

# Function to process IP range
process_ip_range() {
    local start_ip_int=$(ip_to_int "$START_IP")
    local end_ip_int=$(ip_to_int "$END_IP")
    local total_ips=$((end_ip_int - start_ip_int + 1))

    print_status "Processing IP range: $START_IP to $END_IP"
    print_status "Total IPs to check: $total_ips"

    local processed=0
    local created=0
    local skipped_existing=0

    for ((ip_int=start_ip_int; ip_int<=end_ip_int; ip_int++)); do
        local ip=$(int_to_ip "$ip_int")
        processed=$((processed + 1))

        # Progress indicator
        if [ $((processed % 10)) -eq 0 ]; then
            print_status "Processed $processed IPs..."
        fi

        # Check if host alias already exists
        local existing_alias
        existing_alias=$(get_host_alias_by_ip "$ip")
        local alias_exists=$?

        if [ "$DEBUG" = "true" ]; then
            print_status "Debug: Checking IP $ip - alias exists: $alias_exists" >&2
            if [ $alias_exists -eq 0 ]; then
                local existing_name
                existing_name=$(echo "$existing_alias" | jq -r '.name // empty' 2>/dev/null)
                print_status "Debug: Existing alias: $existing_name" >&2
            fi
        fi

        if [ $alias_exists -eq 0 ]; then
            local existing_name
            existing_name=$(echo "$existing_alias" | jq -r '.name // empty' 2>/dev/null)
            print_status "Skipping IP with existing host alias: $ip ($existing_name)"
            skipped_existing=$((skipped_existing + 1))
            continue
        fi

        # Try to detect hostname from ARP table
        local detected_hostname
        detected_hostname=$(detect_hostname_from_arp "$ip")

        local alias_name
        local description

        if [ -n "$detected_hostname" ]; then
            # Use detected hostname (sanitized)
            alias_name=$(sanitize_hostname "$detected_hostname")
            description="Auto-created from detected hostname: $detected_hostname"
            print_status "Found hostname for $ip: $detected_hostname -> $alias_name"
        else
            # Use standard HOST_x_x_x_x format
            alias_name="HOST_${ip//./_}"
            description="Auto-created host alias for IP $ip"
            print_status "No hostname detected for $ip, using standard name: $alias_name"
        fi

        # Create the host alias
        if [ "$DRY_RUN" = "true" ]; then
            print_warning "[DRY RUN] Would create host alias: $alias_name for IP $ip"
            if [ -n "$detected_hostname" ]; then
                print_warning "[DRY RUN] Would use detected hostname: $detected_hostname"
            fi
            created=$((created + 1))
        else
            if create_host_alias "$ip" "$alias_name" "$description"; then
                created=$((created + 1))
            fi
        fi
    done

    # Print summary
    echo
    print_success "Processing complete!"
    print_status "Total IPs processed: $processed"
    print_status "Host aliases created: $created"
    print_status "Skipped (existing alias): $skipped_existing"

    if [ "$DRY_RUN" = "true" ]; then
        print_warning "DRY RUN MODE - No changes were made"
    fi
}

# Main script
main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --url)
                SERVER_URL="$2"
                shift 2
                ;;
            --range)
                IP_RANGE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --debug)
                DEBUG="true"
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [ -z "$SERVER_URL" ]; then
        print_error "Server URL is required. Use --url <URL>"
        show_help
        exit 1
    fi

    if [ -z "$IP_RANGE" ]; then
        print_error "IP range is required. Use --range <IP_RANGE>"
        show_help
        exit 1
    fi

    # Parse and validate IP range
    if ! parse_ip_range "$IP_RANGE"; then
        exit 1
    fi

    # Test connectivity
    if ! test_connectivity; then
        exit 1
    fi

    # Get API key securely
    echo -n "Enter your API key: "
    read -s API_KEY
    echo

    if [ -z "$API_KEY" ]; then
        print_error "API key is required"
        exit 1
    fi

    # Test server connectivity and authentication
    print_status "Attempting to connect to: $SERVER_URL"
    print_status "Testing server connectivity..."
    print_status "Sending test request to: $SERVER_URL/api/admin/system-summary"

    local test_response
    test_response=$(api_request "GET" "/admin/system-summary")

    if [ $? -ne 0 ]; then
        print_error "Failed to connect to server or authenticate"
        print_error "Please check your server URL and API key"
        exit 1
    fi

    print_success "Server is reachable and authentication successful"

    # Start the host alias creation process
    print_status "Starting host alias creation process..."
    print_status "Server URL: $SERVER_URL"
    print_status "IP Range: $IP_RANGE"
    print_status "Dry run mode: $DRY_RUN"

    # Get system summary for hostname detection
    SYSTEM_SUMMARY_FILE="/tmp/system_summary_$$"
    get_system_summary_to_file "$SYSTEM_SUMMARY_FILE"
    local summary_exit_code=$?
    if [ $summary_exit_code -ne 0 ]; then
        print_error "Failed to get system summary (exit code: $summary_exit_code)"
        rm -f "$SYSTEM_SUMMARY_FILE"
        exit 1
    fi

    # Debug: Show system summary structure if debug mode is enabled
    if [ "$DEBUG" = "true" ]; then
        print_status "Debug: System summary structure:"
        local sample_arp
        sample_arp=$(jq -r '.hostAliasStats.total.lists.activeDevicesInArpTable[0:2]' "$SYSTEM_SUMMARY_FILE" 2>/dev/null)
        if [ $? -eq 0 ] && [ -n "$sample_arp" ] && [ "$sample_arp" != "null" ]; then
            echo "$sample_arp" | jq '.' 2>/dev/null || echo "$sample_arp"
        else
            print_warning "Debug: Could not parse system summary ARP data"
        fi

        # Show total count of active devices
        local active_count
        active_count=$(jq -r '.hostAliasStats.total.lists.activeDevicesInArpTable | length' "$SYSTEM_SUMMARY_FILE" 2>/dev/null)
        if [ -n "$active_count" ] && [ "$active_count" != "null" ]; then
            print_status "Debug: Total active devices in ARP table: $active_count"
        else
            print_warning "Debug: Could not get active device count"
        fi
    fi

    # Process the IP range
    process_ip_range

    print_success "Script completed successfully!"

    # Clean up temporary files
    rm -f "$SYSTEM_SUMMARY_FILE"
}

# Run main function with all arguments
main "$@"
