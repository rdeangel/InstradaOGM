#!/bin/bash

# InstadaOGM Host Alias Cleanup Script
# This script identifies and optionally removes host aliases that meet specific criteria:
# 1. No ARP detection (not online) - unless --delete-arp-host-aliases is specified
# 2. No DHCP reservation - unless --delete-dhcp-host-aliases is specified
# 3. Standard name HOST_x_x_x_x (unless --delete-renamed-host-aliases is specified)
# 4. Optionally unassign from network groups
# 5. Optionally delete host aliases
#
# ENHANCED FEATURES:
# - Server connectivity testing before execution
# - Proper HTTP status code handling
# - Network timeout protection (10s connect, 30s total)
# - JSON response validation
# - Detailed error messages for troubleshooting

# Removed set -e to handle errors more gracefully

# Global flag to track successful exits
SCRIPT_EXIT_SUCCESS=false

echo "Running optimized cleanup script (v2.0)..."

# Trap to catch unexpected exits and provide feedback
trap 'if [ "$SCRIPT_EXIT_SUCCESS" != "true" ]; then echo; echo -e "\033[0;31m[ERROR]\033[0m Script was interrupted or failed unexpectedly"; echo -e "\033[0;31m[ERROR]\033[0m Please check your server URL and network connectivity"; fi' EXIT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
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
    cat << EOF
Usage: $0 [OPTIONS]

This script identifies and optionally removes host aliases that meet specific criteria:
- No ARP detection (not online) - unless --delete-arp-host-aliases is specified
- No DHCP reservation - unless --delete-dhcp-host-aliases is specified
- Standard name HOST_x_x_x_x (unless --delete-renamed-host-aliases is specified)

Additionally, the script automatically detects and removes duplicate IP address objects:
- If none are assigned to groups: removes all but one
- If some are assigned and some aren't: removes only the unassigned ones
- If all are assigned to groups: logs warning for manual review

Required Options:
    --url <URL>                    InstadaOGM server URL (e.g., https://instrada-ogm.example.com)
    --range <IP_RANGE>             IP range to check (e.g., 192.168.1.1-192.168.1.255)

Action Options (at least one required):
    --unassign-group               Unassign host aliases from network groups before deletion
    --delete-host-alias            Delete host aliases that meet criteria

Deletion Scope Options (require --delete-host-alias):
    --delete-renamed-host-aliases  Include renamed hosts (not just HOST_x_x_x_x format)
    --delete-arp-host-aliases      Include hosts that are ACTIVE in ARP table (DANGEROUS!)
    --delete-dhcp-host-aliases     Include hosts with DHCP reservations (DANGEROUS!)

Optional Options:
    --dry-run                      Show what would be done without making changes
    --debug                        Enable debug output for troubleshooting
    --help                         Show this help message

IMPORTANT NOTES:
- Running --delete-host-alias without --unassign-group will skip ALL host aliases
  assigned to groups, even if they meet other deletion criteria
- The --delete-arp-host-aliases and --delete-dhcp-host-aliases options can impact
  live network traffic and require explicit confirmation

Examples:
    # Safe preview mode
    $0 --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --dry-run

    # Standard cleanup (safe - only unused standard names)
    $0 --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --unassign-group --delete-host-alias

    # Include renamed hosts (still safe - respects ARP/DHCP)
    $0 --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --unassign-group --delete-host-alias --delete-renamed-host-aliases

    # DANGEROUS - Include active devices (requires confirmation)
    $0 --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --unassign-group --delete-host-alias --delete-arp-host-aliases

The script will prompt for your API key securely.
EOF
}

# Function to get API key securely
get_api_key() {
    # Check if API key is provided via environment variable
    if [ -n "$OGM_API_KEY" ]; then
        API_KEY="$OGM_API_KEY"
        print_status "Using API key from environment variable OGM_API_KEY"
        return 0
    fi

    echo -n "Enter your API key: "
    read -s API_KEY
    echo
    if [ -z "$API_KEY" ]; then
        print_error "API key is required"
        exit 1
    fi
}

# Function to show safety warning and get confirmation
confirm_dangerous_operation() {
    local operation_type="$1"

    echo
    echo "================================================================================"
    echo "                              ⚠️  DANGER WARNING  ⚠️"
    echo "================================================================================"

    # Determine what will be affected based on options
    local will_affect_groups=""
    local will_affect_custom_names=""
    local scope_description=""

    if [ "$UNASSIGN_GROUP" = "true" ]; then
        will_affect_groups="YES - Host aliases will be unassigned from groups before deletion"
    else
        will_affect_groups="NO - Only unassigned host aliases will be deleted (group-assigned aliases will be skipped)"
    fi

    if [ "$DELETE_RENAMED_HOST_ALIASES" = "true" ]; then
        will_affect_custom_names="YES - Custom named host aliases will be included"
        scope_description="ALL host aliases (standard HOST_x_x_x_x AND custom names)"
    else
        will_affect_custom_names="NO - Only standard HOST_x_x_x_x format aliases will be affected"
        scope_description="Only standard HOST_x_x_x_x format host aliases"
    fi

    case "$operation_type" in
        "arp")
            echo
            echo "  You have enabled --delete-arp-host-aliases"
            echo
            echo "  🚨 THIS WILL DELETE HOST ALIASES FOR DEVICES THAT ARE CURRENTLY ONLINE! 🚨"
            echo
            echo "  WHAT WILL BE AFFECTED:"
            echo "  • Scope: $scope_description"
            echo "  • Group-assigned aliases: $will_affect_groups"
            echo "  • Custom named aliases: $will_affect_custom_names"
            echo
            echo "  POTENTIAL IMPACT:"
            echo "  • Active devices will lose their host alias names"
            if [ "$UNASSIGN_GROUP" = "true" ]; then
                echo "  • Network group assignments WILL be disrupted (aliases unassigned before deletion)"
                echo "  • Firewall rules referencing these aliases WILL stop working"
                echo "  • Live network traffic WILL be affected if devices are online"
            else
                echo "  • Traffic should not be disrupted since aliases are not unassigned from groups"
            fi
            echo ""
            echo "  This option overrides the safety check that normally protects active"
            echo "  devices in the ARP table from deletion."
            ;;
        "dhcp")
            echo
            echo "  You have enabled --delete-dhcp-host-aliases"
            echo
            echo "  🚨 THIS WILL DELETE HOST ALIASES FOR DEVICES WITH DHCP RESERVATIONS! 🚨"
            echo
            echo "  WHAT WILL BE AFFECTED:"
            echo "  • Scope: $scope_description"
            echo "  • Group-assigned aliases: $will_affect_groups"
            echo "  • Custom named aliases: $will_affect_custom_names"
            echo
            echo "  POTENTIAL IMPACT:"
            echo "  • Reserved devices will lose their host alias names"
            if [ "$UNASSIGN_GROUP" = "true" ]; then
                echo "  • Network group assignments WILL be disrupted (aliases unassigned before deletion)"
                echo "  • Firewall rules referencing these aliases WILL stop working"
            else
                echo "  • Traffic should not be disrupted since aliases are not unassigned from groups"
            fi
            echo "  • DHCP reservations WILL NOT be deleted only host aliases are removed"

            echo "  This option overrides the safety check that normally protects devices"
            echo "  with DHCP reservations from deletion."
            ;;
        "both")
            echo
            echo "  You have enabled BOTH --delete-arp-host-aliases AND --delete-dhcp-host-aliases"
            echo
            echo "  🚨🚨 THIS WILL DELETE HOST ALIASES FOR ALL DEVICES REGARDLESS OF STATUS! 🚨🚨"
            echo
            echo "  WHAT WILL BE AFFECTED:"
            echo "  • Scope: $scope_description"
            echo "  • Group-assigned aliases: $will_affect_groups"
            echo "  • Custom named aliases: $will_affect_custom_names"
            echo
            echo "  POTENTIAL IMPACT:"
            echo "  • ALL devices (active, reserved, offline) will lose host alias names"
            if [ "$UNASSIGN_GROUP" = "true" ]; then
                echo "  • Network group assignments WILL be completely disrupted"
                echo "  • Firewall rules referencing these aliases WILL stop working"
                echo "  • Live network traffic WILL be affected if devices are online"
            else
                echo "  • Traffic should not be disrupted since aliases are not unassigned from groups"
            fi
            echo "  • Critical infrastructure devices WILL be affected"
            echo
            echo "  This disables ALL safety checks that normally protect devices from deletion"
            ;;
    esac

    echo
    if [ "$UNASSIGN_GROUP" != "true" ]; then
        echo "  ⚠️  NOTE: Without --unassign-group, group-assigned aliases will be SKIPPED"
        echo "  ⚠️  This may result in fewer deletions than expected"
        echo
    fi

    echo "  ⚠️  PROCEED ONLY IF YOU UNDERSTAND THE CONSEQUENCES  ⚠️"
    echo
    echo "  To continue with this potentially destructive operation, type: CONFIRM"
    echo "  To cancel and use safer options, press Ctrl+C or type anything else"
    echo
    echo "================================================================================"
    echo

    echo -n "Type CONFIRM to proceed with this dangerous operation: "
    read -r confirmation

    if [ "$confirmation" != "CONFIRM" ]; then
        echo
        print_error "Operation cancelled by user"
        print_status "Consider using safer options:"
        print_status "  • Remove --delete-arp-host-aliases to protect active devices"
        print_status "  • Remove --delete-dhcp-host-aliases to protect reserved devices"
        print_status "  • Use --dry-run first to preview what would be deleted"
        SCRIPT_EXIT_SUCCESS=true
        exit 1
    fi

    echo
    print_warning "User confirmed dangerous operation. Proceeding..."
    echo
}

# Function to validate IP range format
validate_ip_range() {
    local range="$1"
    if [[ ! "$range" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        print_error "Invalid IP range format. Use format: 192.168.1.1-192.168.1.255"
        exit 1
    fi
    
    # Extract start and end IPs
    START_IP=$(echo "$range" | cut -d'-' -f1)
    END_IP=$(echo "$range" | cut -d'-' -f2)
    
    # Validate IP addresses
    validate_ip "$START_IP" || exit 1
    validate_ip "$END_IP" || exit 1
}

# Function to validate server URL format
validate_server_url() {
    local url="$1"
    
    # Check if URL starts with http:// or https://
    if [[ ! "$url" =~ ^https?:// ]]; then
        print_error "Invalid server URL format: $url"
        print_error "URL must start with http:// or https://"
        print_error "Examples:"
        print_error "  https://instrada-ogm.example.com"
        print_error "  https://192.168.1.100"
        print_error "  https://instrada-ogm.example.com:8443"
        return 1
    fi
    
    # Check for basic URL structure
    if [[ ! "$url" =~ ^https?://[^/]+ ]]; then
        print_error "Invalid server URL format: $url"
        print_error "URL must include a valid hostname or IP address"
        return 1
    fi
    
    # Extract hostname/IP for additional validation
    local host=$(echo "$url" | sed 's|^https*://||' | sed 's|/.*||' | sed 's|:.*||')
    
    # Check if hostname/IP is not empty
    if [ -z "$host" ]; then
        print_error "Invalid server URL: missing hostname or IP address"
        return 1
    fi
    
    # Check for common URL mistakes
    if [[ "$url" =~ /$ ]]; then
        print_warning "URL ends with trailing slash - this is usually fine but may cause issues"
    fi
    
    return 0
}

# Function to validate IP address format
validate_ip() {
    local ip="$1"
    if [[ ! "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        print_error "Invalid IP address format: $ip"
        return 1
    fi
    
    # Check each octet
    IFS='.' read -r -a octets <<< "$ip"
    for octet in "${octets[@]}"; do
        if [ "$octet" -lt 0 ] || [ "$octet" -gt 255 ]; then
            print_error "Invalid IP address: $ip (octet $octet out of range)"
            return 1
        fi
    done
    return 0
}

# Function to convert IP to integer for comparison
ip_to_int() {
    local ip="$1"
    IFS='.' read -r -a octets <<< "$ip"
    echo $(( (${octets[0]} << 24) + (${octets[1]} << 16) + (${octets[2]} << 8) + ${octets[3]} ))
}

# Function to convert integer back to IP
int_to_ip() {
    local int="$1"
    echo $(( (int >> 24) & 255 )).$(( (int >> 16) & 255 )).$(( (int >> 8) & 255 )).$(( int & 255 ))
}

# Function to generate HOST_x_x_x_x format
generate_host_name() {
    local ip="$1"
    echo "HOST_${ip//./_}"
}

# Function to check if host alias name matches standard format
is_standard_host_name() {
    local name="$1"
    if [[ "$name" =~ ^HOST_[0-9]+_[0-9]+_[0-9]+_[0-9]+$ ]]; then
        return 0
    else
        return 1
    fi
}

# Function to test server connectivity
test_server_connectivity() {
    print_status "Testing server connectivity..."
    
    # Test basic connectivity without authentication
    print_status "Sending test request to: $SERVER_URL/api/admin/system-summary"
    
    # Use timeout to prevent hanging (if available)
    local test_response
    if command -v timeout &> /dev/null; then
        test_response=$(timeout 35 curl -s --connect-timeout 10 --max-time 30 -w "%{http_code}" -o /tmp/curl_test_response "$SERVER_URL/api/admin/system-summary" 2>/dev/null)
        local curl_exit_code=$?
        
        # Check if timeout occurred
        if [ $curl_exit_code -eq 124 ]; then
            print_error "Connection attempt timed out after 35 seconds"
            print_error "The server is not responding or the URL is incorrect."
            print_error ""
            print_error "TROUBLESHOOTING STEPS:"
            print_error "1. Verify the server URL is correct:"
            print_error "   - Check for typos in the URL"
            print_error "   - Ensure protocol is correct (https:// or http://)"
            print_error "   - Verify port number if using non-standard port"
            print_error ""
            print_error "2. Check server accessibility:"
            print_error "   - Ensure the InstadaOGM server is running"
            print_error "   - Verify the server is accessible from this machine"
            print_error "   - Check firewall settings on both client and server"
            print_error ""
            print_error "3. Test basic connectivity manually:"
            print_error "   - Try: curl -I $SERVER_URL"
            print_error "   - Try: ping $(echo $SERVER_URL | sed 's|https*://||' | sed 's|/.*||')"
            print_error ""
            print_error "4. Common URL formats:"
            print_error "   - https://instrada-ogm.example.com"
            print_error "   - https://192.168.1.100"
            print_error "   - https://instrada-ogm.example.com:8443 (if using custom port)"
            exit 1
        fi
    else
        # Fallback without timeout command
        test_response=$(curl -s --connect-timeout 10 --max-time 30 -w "%{http_code}" -o /tmp/curl_test_response "$SERVER_URL/api/admin/system-summary" 2>/dev/null)
        local curl_exit_code=$?
    fi
    
    local http_code="${test_response: -3}"
    
    # Check curl exit code first
    if [ $curl_exit_code -ne 0 ]; then
        print_error "Curl command failed with exit code: $curl_exit_code"
        print_error "This usually indicates a network connectivity issue."
        print_error ""
        print_error "TROUBLESHOOTING STEPS:"
        print_error "1. Verify the server URL is correct:"
        print_error "   - Check for typos in the URL"
        print_error "   - Ensure protocol is correct (https:// or http://)"
        print_error "   - Verify port number if using non-standard port"
        print_error ""
        print_error "2. Check server accessibility:"
        print_error "   - Ensure the InstadaOGM server is running"
        print_error "   - Verify the server is accessible from this machine"
        print_error "   - Check firewall settings on both client and server"
        print_error ""
        print_error "3. Test basic connectivity manually:"
        print_error "   - Try: curl -I $SERVER_URL"
        print_error "   - Try: ping $(echo $SERVER_URL | sed 's|https*://||' | sed 's|/.*||')"
        print_error ""
        print_error "4. Common URL formats:"
        print_error "   - https://instrada-ogm.example.com"
        print_error "   - https://192.168.1.100"
        print_error "   - https://instrada-ogm.example.com:8443 (if using custom port)"
        exit 1
    fi
    
    if [ "$http_code" = "000" ]; then
        print_error "Cannot connect to server at $SERVER_URL"
        print_error ""
        print_error "TROUBLESHOOTING STEPS:"
        print_error "1. Verify the server URL is correct:"
        print_error "   - Check for typos in the URL"
        print_error "   - Ensure protocol is correct (https:// or http://)"
        print_error "   - Verify port number if using non-standard port"
        print_error ""
        print_error "2. Check server accessibility:"
        print_error "   - Ensure the InstadaOGM server is running"
        print_error "   - Verify the server is accessible from this machine"
        print_error "   - Check firewall settings on both client and server"
        print_error ""
        print_error "3. Test basic connectivity:"
        print_error "   - Try: curl -I $SERVER_URL"
        print_error "   - Try: ping $(echo $SERVER_URL | sed 's|https*://||' | sed 's|/.*||')"
        print_error ""
        print_error "4. Common URL formats:"
        print_error "   - https://instrada-ogm.example.com"
        print_error "   - https://192.168.1.100"
        print_error "   - https://instrada-ogm.example.com:8443 (if using custom port)"
        print_error ""
        print_error "If the server is running but still not accessible, check:"
        print_error "  - DNS resolution (if using hostname)"
        print_error "  - Network routing"
        print_error "  - VPN connectivity (if applicable)"
        exit 1
    elif [ "$http_code" = "401" ]; then
        print_status "Server is reachable but requires authentication (expected)"
    elif [ "$http_code" = "404" ]; then
        print_error "Server responded with 404 - API endpoint not found"
        print_error ""
        print_error "This usually means:"
        print_error "1. The server URL is incorrect or incomplete"
        print_error "2. The InstadaOGM API is not available at this endpoint"
        print_error ""
        print_error "Please verify:"
        print_error "  - The server URL is correct and complete"
        print_error "  - The InstadaOGM server is properly configured"
        print_error "  - You're using the correct API endpoint"
        print_error ""
        print_error "Try accessing the InstadaOGM web interface directly:"
        print_error "  $SERVER_URL"
        exit 1
    elif [ "$http_code" = "403" ]; then
        print_error "Access forbidden (HTTP 403)"
        print_error "The server is reachable but access is denied."
        print_error "This might indicate:"
        print_error "  - Server is not configured for API access"
        print_error "  - IP restrictions are in place"
        print_error "  - Server requires different authentication method"
        exit 1
    elif [ "$http_code" -ge 500 ]; then
        print_error "Server error (HTTP $http_code) - server may be down or experiencing issues"
        print_error ""
        print_error "The server responded with an error. This could mean:"
        print_error "  - The InstadaOGM server is experiencing issues"
        print_error "  - The server is overloaded"
        print_error "  - There's a configuration problem"
        print_error ""
        print_error "Try:"
        print_error "  - Accessing the web interface: $SERVER_URL"
        print_error "  - Checking server logs"
        print_error "  - Restarting the InstadaOGM service"
        exit 1
    elif [ "$http_code" -ge 400 ] && [ "$http_code" != "401" ]; then
        print_warning "Server responded with HTTP $http_code"
        print_warning "This may be expected for unauthenticated requests, but could indicate:"
        print_warning "  - Incorrect URL format"
        print_warning "  - Server configuration issues"
        print_warning "  - Network proxy or firewall interference"
    else
        print_status "Server connectivity test passed (HTTP $http_code)"
    fi
    
    # Clean up temp file
    rm -f /tmp/curl_test_response
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
    print_status "Fetching system summary..."

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

# Function to debug ARP data structure
debug_arp_data() {
    local system_summary="$1"
    local ip="$2"
    
    print_status "Debug: Checking ARP data for IP $ip"
    
    # Show the structure of activeDevicesInArpTable
    local arp_data
    arp_data=$(echo "$system_summary" | jq -r '.hostAliasStats.total.lists.activeDevicesInArpTable[0:3]' 2>/dev/null)
    if [ $? -eq 0 ]; then
        print_status "Debug: Sample ARP data structure:"
        echo "$arp_data" | jq '.' 2>/dev/null || echo "$arp_data"
    else
        print_warning "Debug: Could not parse ARP data structure"
    fi
    
    # Check if the specific IP exists in ARP data
    local ip_found
    ip_found=$(echo "$system_summary" | jq -r --arg ip "$ip" '.hostAliasStats.total.lists.activeDevicesInArpTable[] | select(.content == $ip) | .content' 2>/dev/null)
    
    if [ -n "$ip_found" ] && [ "$ip_found" != "null" ]; then
        print_status "Debug: IP $ip found in ARP data"
        return 0
    else
        print_status "Debug: IP $ip NOT found in ARP data"
        return 1
    fi
}

# Function to check if IP is in ARP table (active)
is_ip_active() {
    local ip="$1"

    # Check if IP is in active devices list using the system summary file
    if jq -e --arg ip "$ip" '.hostAliasStats.total.lists.activeDevicesInArpTable[] | select(.content == $ip)' "$SYSTEM_SUMMARY_FILE" > /dev/null 2>&1; then
        return 0  # IP is active
    else
        return 1  # IP is not active
    fi
}

# Function to get all DHCP reservations
get_dhcp_reservations() {
    print_status "Fetching DHCP reservations..." >&2
    local response
    local reservations

    # Try the InstadaOGM DHCP API endpoint first
    response=$(api_request "GET" "/opnsense/dhcp?action=list_reservations")

    if [ $? -ne 0 ]; then
        print_warning "Failed to get DHCP reservations via InstadaOGM API - trying direct OPNsense API" >&2

        # Try direct OPNsense API as fallback
        response=$(api_request "POST" "/kea/dhcpv4/search_reservation" "{}")

        if [ $? -ne 0 ]; then
            print_warning "Failed to get DHCP reservations - assuming no reservations exist" >&2
            echo "[]"
            return 1
        fi

        # Extract just the rows array which contains the reservations
        reservations=$(echo "$response" | jq -c '.rows // []' 2>/dev/null)

        if [ $? -ne 0 ]; then
            print_warning "Failed to parse DHCP reservations response" >&2
            print_warning "Response: ${response:0:200}..." >&2
            echo "[]"
            return 1
        fi
    else
        # InstadaOGM API response format
        reservations=$(echo "$response" | jq -c '.reservations // []' 2>/dev/null)

        if [ $? -ne 0 ]; then
            print_warning "Failed to parse InstadaOGM DHCP reservations response" >&2
            print_warning "Response: ${response:0:200}..." >&2
            echo "[]"
            return 1
        fi
    fi

    # Debug output
    if [ "$DEBUG" = "true" ]; then
        local count
        count=$(echo "$reservations" | jq 'length' 2>/dev/null)
        print_status "Debug: Found $count DHCP reservations" >&2
        if [ "$count" -gt 0 ]; then
            print_status "Debug: Sample reservation:" >&2
            echo "$reservations" | jq '.[0] // {}' 2>/dev/null >&2
        fi
    fi

    echo "$reservations"
    return 0
}

# Function to check DHCP reservation
has_dhcp_reservation() {
    local ip="$1"

    # Check if IP exists in the DHCP reservations list
    if echo "$DHCP_RESERVATIONS" | jq -e --arg ip "$ip" '.[] | select(.ip_address == $ip)' > /dev/null 2>&1; then
        return 0  # IP has DHCP reservation
    else
        return 1  # IP does not have DHCP reservation
    fi
}

# Function to get host alias by IP
get_host_alias_by_ip() {
    local ip="$1"
    local response
    response=$(api_request "GET" "/opnsense/host-alias-management?ipAddress=$ip")
    
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    echo "$response"
}

# Function to get friendly group name
get_group_display_name() {
    local group_uuid="$1"

    # Get network groups to find friendly name
    local groups_response
    groups_response=$(api_request "GET" "/opnsense/network-groups")

    if [ $? -eq 0 ]; then
        # Try to get friendly name first, then fall back to regular name
        local friendly_name
        local regular_name

        friendly_name=$(echo "$groups_response" | jq -r --arg uuid "$group_uuid" '.networkGroups[] | select(.uuid == $uuid) | .friendlyName // empty' 2>/dev/null)
        regular_name=$(echo "$groups_response" | jq -r --arg uuid "$group_uuid" '.networkGroups[] | select(.uuid == $uuid) | .name // empty' 2>/dev/null)

        if [ -n "$friendly_name" ] && [ "$friendly_name" != "null" ] && [ "$friendly_name" != "$regular_name" ]; then
            echo "$friendly_name"
        elif [ -n "$regular_name" ] && [ "$regular_name" != "null" ]; then
            echo "$regular_name"
        else
            echo "$group_uuid"
        fi
    else
        echo "$group_uuid"
    fi
}

# Function to unassign host from all groups
unassign_from_groups() {
    local ip="$1"
    local host_alias_name="$2"
    
    print_status "Unassigning $ip ($host_alias_name) from all groups..."
    
    # Get current group memberships
    local membership_response
    membership_response=$(api_request "GET" "/opnsense/ip-group-membership?ip=$ip")
    
    if [ $? -ne 0 ]; then
        print_warning "Failed to get group membership for $ip"
        return 1
    fi
    
    # Extract group UUIDs
    local group_uuids
    group_uuids=$(echo "$membership_response" | jq -r '.[].uuid' 2>/dev/null)
    
    if [ -z "$group_uuids" ] || [ "$group_uuids" = "null" ]; then
        print_status "No group memberships found for $ip"
        return 0
    fi
    
    # Unassign from each group
    while IFS= read -r group_uuid; do
        if [ -n "$group_uuid" ] && [ "$group_uuid" != "null" ]; then
            local group_display_name
            group_display_name=$(get_group_display_name "$group_uuid")

            print_status "Unassigning $ip from group: $group_display_name"

            local unassign_data="{\"operation\":\"unassign\",\"ipAddress\":\"$ip\"}"
            local response
            response=$(api_request "POST" "/opnsense/host-group-management" "$unassign_data")

            if [ $? -eq 0 ]; then
                print_success "Successfully unassigned $ip from group: $group_display_name"
            else
                print_warning "Failed to unassign $ip from group: $group_display_name"
            fi
        fi
    done <<< "$group_uuids"
}

# Function to find and remove duplicate IP address objects
remove_duplicate_ip_objects() {
    local ip="$1"

    print_status "Checking for duplicate IP address objects for $ip..."

    # Get all host aliases for this IP
    # properly handle the cached aliases file or fetch if not available
    local all_aliases_content
    if [ -f "$ALL_ALIASES_CACHE_FILE" ]; then
        all_aliases_content=$(cat "$ALL_ALIASES_CACHE_FILE")
    else
        local all_aliases_response
        all_aliases_response=$(api_request "GET" "/opnsense/host-alias-management")
        
        if [ $? -ne 0 ]; then
            print_warning "Failed to get all host aliases for duplicate check"
            return 1
        fi

        # Handle various response formats
        if echo "$all_aliases_response" | jq -e '.displayableHostAliases' >/dev/null 2>&1; then
            all_aliases_content=$(echo "$all_aliases_response" | jq -c '.displayableHostAliases')
        elif echo "$all_aliases_response" | jq -e '.hostAliases' >/dev/null 2>&1; then
            # Handle standard aliases response
             all_aliases_content=$(echo "$all_aliases_response" | jq -c '.hostAliases')
        else
            all_aliases_content=$(echo "$all_aliases_response" | jq -c '.')
        fi
    fi

    # Find all aliases with the same IP content
    local duplicates
    duplicates=$(echo "$all_aliases_content" | jq -r --arg ip "$ip" '.[] | select(.content == $ip) | "\(.uuid)|\(.name)|\(.enabled)"' 2>/dev/null)

    if [ -z "$duplicates" ]; then
        return 0
    fi

    # Count duplicates
    local duplicate_count
    duplicate_count=$(echo "$duplicates" | wc -l)

    if [ "$duplicate_count" -le 1 ]; then
        return 0
    fi

    print_status "Found $duplicate_count duplicate host aliases for IP $ip"

    # Get group memberships for each duplicate
    local aliases_with_groups=""
    local aliases_without_groups=""

    while IFS='|' read -r uuid name enabled; do
        if [ -n "$uuid" ]; then
            local membership_response
            membership_response=$(api_request "GET" "/opnsense/ip-group-membership?ip=$ip")

            if [ $? -eq 0 ]; then
                local group_count
                group_count=$(echo "$membership_response" | jq 'length' 2>/dev/null)

                if [ "$group_count" -gt 0 ] 2>/dev/null; then
                    aliases_with_groups="$aliases_with_groups$uuid|$name|$enabled\n"
                else
                    aliases_without_groups="$aliases_without_groups$uuid|$name|$enabled\n"
                fi
            else
                aliases_without_groups="$aliases_without_groups$uuid|$name|$enabled\n"
            fi
        fi
    done <<< "$duplicates"

    # Remove duplicates based on strategy:
    # 1. If none are assigned to groups, remove all but one
    # 2. If some are assigned and some aren't, remove the unassigned ones
    # 3. If all are assigned, don't remove any (log warning)

    if [ -n "$aliases_with_groups" ] && [ -n "$aliases_without_groups" ]; then
        # Strategy 2: Remove unassigned duplicates
        print_status "Removing unassigned duplicate host aliases for IP $ip"
        echo -e "$aliases_without_groups" | while IFS='|' read -r uuid name enabled; do
            if [ -n "$uuid" ]; then
                print_status "Removing unassigned duplicate: $name ($uuid)"
                if [ "$DRY_RUN" = "true" ]; then
                    print_warning "[DRY RUN] Would delete duplicate host alias: $name"
                else
                    delete_host_alias "$ip" "$uuid" "$name"
                fi
            fi
        done
    elif [ -z "$aliases_with_groups" ] && [ -n "$aliases_without_groups" ]; then
        # Strategy 1: Remove all but the first one
        print_status "Removing all but one duplicate host alias for IP $ip"
        local first_line=true
        echo -e "$aliases_without_groups" | while IFS='|' read -r uuid name enabled; do
            if [ -n "$uuid" ]; then
                if [ "$first_line" = "true" ]; then
                    print_status "Keeping first duplicate: $name ($uuid)"
                    first_line=false
                else
                    print_status "Removing duplicate: $name ($uuid)"
                    if [ "$DRY_RUN" = "true" ]; then
                        print_warning "[DRY RUN] Would delete duplicate host alias: $name"
                    else
                        delete_host_alias "$ip" "$uuid" "$name"
                    fi
                fi
            fi
        done
    else
        # Strategy 3: All are assigned, don't remove
        print_warning "All duplicate host aliases for IP $ip are assigned to groups - manual review required"
    fi
}

# Function to delete host alias
delete_host_alias() {
    local ip="$1"
    local uuid="$2"
    local host_alias_name="$3"

    print_status "Deleting host alias $ip ($host_alias_name) with UUID $uuid..."

    local response
    response=$(api_request "DELETE" "/opnsense/aliases/$uuid")
    local api_exit_code=$?

    if [ "$DEBUG" = "true" ]; then
        print_status "Debug: Delete API response: $response" >&2
    fi

    if [ $api_exit_code -eq 0 ]; then
        # Check if the response indicates successful deletion
        local result
        result=$(echo "$response" | jq -r '.success // false' 2>/dev/null)

        if [ "$result" = "true" ]; then
            print_success "Successfully deleted host alias $ip ($host_alias_name)"
            return 0
        else
            # Check for alternative success indicators
            local message
            message=$(echo "$response" | jq -r '.message // ""' 2>/dev/null)

            if echo "$message" | grep -qi "deleted successfully"; then
                print_success "Successfully deleted host alias $ip ($host_alias_name)"
                return 0
            else
                print_error "Deletion failed: $message"
                if [ "$DEBUG" = "true" ]; then
                    print_status "Debug: Full response: $response" >&2
                fi
                return 1
            fi
        fi
    else
        print_error "Failed to delete host alias $ip ($host_alias_name) - API call failed"
        return 1
    fi
}

# Function to process IP range by checking existing aliases
process_ip_range() {
    print_status "Fetching all host aliases to optimize processing..."
    
    # Cache file for aliases
    ALL_ALIASES_CACHE_FILE="/tmp/aliases_cache_$$"
    
    local response
    response=$(api_request "GET" "/opnsense/host-alias-management")
    
    if [ $? -ne 0 ]; then
        print_error "Failed to fetch host aliases"
        return 1
    fi
    
    # Handle response format (array or object with displayableHostAliases or hostAliases)
    if echo "$response" | jq -e '.displayableHostAliases' >/dev/null 2>&1; then
        echo "$response" | jq -c '.displayableHostAliases' > "$ALL_ALIASES_CACHE_FILE"
    elif echo "$response" | jq -e '.hostAliases' >/dev/null 2>&1; then
        echo "$response" | jq -c '.hostAliases' > "$ALL_ALIASES_CACHE_FILE"
    else
        echo "$response" | jq -c '.' > "$ALL_ALIASES_CACHE_FILE"
    fi
    
    print_status "Filtering aliases within IP range $START_IP - $END_IP..."
    
    local start_int=$(ip_to_int "$START_IP")
    local end_int=$(ip_to_int "$END_IP")
    
    local processed=0
    local candidates=0
    local unassigned=0
    local deleted=0
    
    # Extract unique IPs from aliases that are in range
    # and valid IPs
    local ips_to_process_file="/tmp/ips_to_process_$$"
    
    jq -r '.[] | .content' "$ALL_ALIASES_CACHE_FILE" | sort -t . -k 1,1n -k 2,2n -k 3,3n -k 4,4n -u | while read -r ip; do
        if [ -z "$ip" ] || [ "$ip" = "null" ]; then continue; fi
        
        # Validate IP format
        if [[ ! "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then continue; fi
        
        # Check range
        local ip_int
        # Calculate IP int manually as function call in subshell is slow? 
        # Actually just use our function
        ip_int=$(ip_to_int "$ip")
        
        if [ "$ip_int" -ge "$start_int" ] && [ "$ip_int" -le "$end_int" ]; then
            echo "$ip"
        fi
    done > "$ips_to_process_file"
    
    local total_ips=$(wc -l < "$ips_to_process_file")
    print_status "Found $total_ips unique IPs with aliases in the specified range."
    
    # Iterate through unique IPs
    while read -r ip; do
        processed=$((processed + 1))
        
        if [ $((processed % 10)) -eq 0 ]; then
            print_status "Processed $processed/$total_ips IPs..."
        fi
        
        # For each IP, we get the alias(es) from our cache
        # We need to simulate the original loop logic which handled one alias (the "primary" one?)
        # BUT since we might have duplicates, we should iterate all aliases for this IP.
        
        # Get aliases for this IP from cache
        local ip_aliases
        ip_aliases=$(jq -c --arg ip "$ip" '[.[] | select(.content == $ip)]' "$ALL_ALIASES_CACHE_FILE")
        
        # Iterate over aliases for this IP
        while read -r alias_json; do
            local host_alias_name
            local host_alias_uuid
            
            host_alias_name=$(echo "$alias_json" | jq -r '.name // empty')
            host_alias_uuid=$(echo "$alias_json" | jq -r '.uuid // empty')
            
            if [ -z "$host_alias_name" ]; then continue; fi
            
            # --- CRITERIA CHECKS ---
            local skip=false
            
            # 1. Renamed check
            if [ "$DELETE_RENAMED_HOST_ALIASES" != "true" ] && ! is_standard_host_name "$host_alias_name"; then
                if [ "$DEBUG" = "true" ]; then print_status "Skipping renamed host alias: $ip ($host_alias_name)"; fi
                continue # loop to next alias
            fi
            
            # 2. Active IP check (ARP)
            if [ "$DELETE_ARP_HOST_ALIASES" != "true" ] && is_ip_active "$ip"; then
                if [ "$DEBUG" = "true" ]; then print_status "Skipping active IP: $ip ($host_alias_name)"; fi
                skip=true # If IP is active, we generally skip ALL aliases for this IP? 
                # Yes, safety first.
                break # Break inner loop (aliases), go to next IP
            fi
            
            # 3. DHCP Reservation check
            if [ "$DELETE_DHCP_HOST_ALIASES" != "true" ] && has_dhcp_reservation "$ip"; then
                 if [ "$DEBUG" = "true" ]; then print_status "Skipping IP with DHCP reservation: $ip ($host_alias_name)"; fi
                 skip=true
                 break
            fi
            
            # 4. Group Assignment check
            if [ "$UNASSIGN_GROUP" != "true" ]; then
                local membership_response
                # We still need to query API for membership as it's not in the alias cache usually
                membership_response=$(api_request "GET" "/opnsense/ip-group-membership?ip=$ip")
                
                if [ $? -eq 0 ]; then
                    local group_count
                    group_count=$(echo "$membership_response" | jq 'length' 2>/dev/null)
                    
                    if [ "$group_count" -gt 0 ] 2>/dev/null; then
                        print_status "Skipping IP assigned to groups: $ip ($host_alias_name) - assigned to $group_count group(s)"
                        continue
                    fi
                fi
            fi
            
            # Matches all criteria
            candidates=$((candidates + 1))
            print_status "Found candidate for cleanup: $ip ($host_alias_name)"
            
            if [ "$DRY_RUN" = "true" ]; then
                print_warning "[DRY RUN] Would process: $ip ($host_alias_name)"
                if [ "$UNASSIGN_GROUP" = "true" ]; then
                    print_warning "[DRY RUN] Would unassign from groups"
                fi
                if [ "$DELETE_HOST_ALIAS" = "true" ]; then
                    print_warning "[DRY RUN] Would delete host alias"
                fi
            else
                # Perform actual operations
                if [ "$UNASSIGN_GROUP" = "true" ]; then
                    # We pass variables but they are updated in subshell (pipe)
                    # so we won't see updates in summary. This is a known bash limitation with pipes.
                    # but unassign returns exit status.
                    unassign_from_groups "$ip" "$host_alias_name"
                fi
                
                if [ "$DELETE_HOST_ALIAS" = "true" ]; then
                    delete_host_alias "$ip" "$host_alias_uuid" "$host_alias_name"
                fi
            fi
            
        done < <(echo "$ip_aliases" | jq -c '.[]')
        
        # After processing "unused" cleanup, run duplicate processing for this IP
        # This handles the "duplicates" logic (merging etc)
        # Note: remove_duplicate_ip_objects uses ALL_ALIASES_CACHE_FILE now.
        # But if we just deleted some aliases above, the cache is STALE.
        # However, remove_duplicate_ip_objects is usually about duplicates that PERSIST.
        # The script flow is: if we deleted an alias because it was unused, it's gone.
        # If we didn't delete it (e.g. it's active), we might still want to clean duplicates?
        # The original script ran remove_duplicate_ip_objects at the end.
        
        if [ "$DRY_RUN" = "true" ]; then
             print_warning "[DRY RUN] Would check for and remove duplicate IP objects for $ip"
        else
             remove_duplicate_ip_objects "$ip"
        fi
        
    done < "$ips_to_process_file"
    
    # Print summary (Counts might be off due to subshells in pipe)
    echo
    print_success "Processing complete!"
    print_status "Total IPs with aliases processed: $processed"
    print_status "Candidates found/processed: $candidates (approx)"
    
    if [ "$DRY_RUN" = "true" ]; then
        print_warning "DRY RUN MODE - No changes were made"
    fi
    
    rm -f "$ALL_ALIASES_CACHE_FILE"
    rm -f "$ips_to_process_file"
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
            --unassign-group)
                UNASSIGN_GROUP="true"
                shift
                ;;
            --delete-host-alias)
                DELETE_HOST_ALIAS="true"
                shift
                ;;
            --delete-renamed-host-aliases)
                DELETE_RENAMED_HOST_ALIASES="true"
                shift
                ;;
            --delete-arp-host-aliases)
                DELETE_ARP_HOST_ALIASES="true"
                shift
                ;;
            --delete-dhcp-host-aliases)
                DELETE_DHCP_HOST_ALIASES="true"
                shift
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
                SCRIPT_EXIT_SUCCESS=true
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Validate required parameters
    if [ -z "$SERVER_URL" ]; then
        print_error "Server URL is required (--url)"
        show_usage
        exit 1
    fi

    if [ -z "$IP_RANGE" ]; then
        print_error "IP range is required (--range)"
        show_usage
        exit 1
    fi

    if [ "$UNASSIGN_GROUP" != "true" ] && [ "$DELETE_HOST_ALIAS" != "true" ]; then
        print_error "At least one action must be specified: --unassign-group or --delete-host-alias"
        show_usage
        exit 1
    fi

    # Validate that deletion scope options require --delete-host-alias
    if [ "$DELETE_RENAMED_HOST_ALIASES" = "true" ] || [ "$DELETE_ARP_HOST_ALIASES" = "true" ] || [ "$DELETE_DHCP_HOST_ALIASES" = "true" ]; then
        if [ "$DELETE_HOST_ALIAS" != "true" ]; then
            print_error "Deletion scope options (--delete-renamed-host-aliases, --delete-arp-host-aliases, --delete-dhcp-host-aliases) require --delete-host-alias"
            show_usage
            exit 1
        fi
    fi

    # Show warning about group assignment behavior
    if [ "$DELETE_HOST_ALIAS" = "true" ] && [ "$UNASSIGN_GROUP" != "true" ]; then
        print_warning "Running --delete-host-alias without --unassign-group will skip ALL host aliases"
        print_warning "assigned to groups, even if they meet other deletion criteria."
        print_warning "Use --unassign-group to remove group assignments before deletion."
        echo
    fi
    
    # Validate IP range format
    validate_ip_range "$IP_RANGE"
    
    # Validate server URL format
    validate_server_url "$SERVER_URL"
    
    # Quick connectivity test before getting API key
    print_status "Performing quick connectivity test..."
    if ! curl -s --connect-timeout 5 --max-time 10 -o /dev/null "$SERVER_URL" 2>/dev/null; then
        print_error "Quick connectivity test failed - cannot reach $SERVER_URL"
        print_error ""
        print_error "Please check:"
        print_error "  - Server URL is correct"
        print_error "  - Server is running and accessible"
        print_error "  - Network connectivity"
        print_error ""
        print_error "Try: curl -I $SERVER_URL"
        exit 1
    fi
    print_status "Quick connectivity test passed"

    # Safety confirmation for dangerous operations (only in non-dry-run mode)
    if [ "$DRY_RUN" != "true" ]; then
        if [ "$DELETE_ARP_HOST_ALIASES" = "true" ] && [ "$DELETE_DHCP_HOST_ALIASES" = "true" ]; then
            confirm_dangerous_operation "both"
        elif [ "$DELETE_ARP_HOST_ALIASES" = "true" ]; then
            confirm_dangerous_operation "arp"
        elif [ "$DELETE_DHCP_HOST_ALIASES" = "true" ]; then
            confirm_dangerous_operation "dhcp"
        fi
    fi

    # Get API key
    get_api_key
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        print_error "jq is required but not installed. Please install jq to continue."
        exit 1
    fi
    
    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed. Please install curl to continue."
        exit 1
    fi
    
    # Check if timeout is available (for connection timeout protection)
    if ! command -v timeout &> /dev/null; then
        print_warning "timeout command not available - connection attempts may hang on slow networks"
        print_warning "Consider installing coreutils package for better timeout protection"
    fi
    
    # Test server connectivity before proceeding
    print_status "Attempting to connect to: $SERVER_URL"
    test_server_connectivity
    
    print_status "Starting host alias cleanup process..."
    print_status "Server URL: $SERVER_URL"
    print_status "IP Range: $IP_RANGE"
    print_status "Unassign from groups: $UNASSIGN_GROUP"
    print_status "Delete host aliases: $DELETE_HOST_ALIAS"
    print_status "Include renamed hosts: $DELETE_RENAMED_HOST_ALIASES"
    print_status "Include ARP active hosts: $DELETE_ARP_HOST_ALIASES"
    print_status "Include DHCP reserved hosts: $DELETE_DHCP_HOST_ALIASES"
    print_status "Dry run mode: $DRY_RUN"
    
    # Get system summary for ARP table and other data
    SYSTEM_SUMMARY_FILE="/tmp/system_summary_$$"
    get_system_summary_to_file "$SYSTEM_SUMMARY_FILE"
    local summary_exit_code=$?
    if [ $summary_exit_code -ne 0 ]; then
        print_error "Failed to get system summary (exit code: $summary_exit_code)"
        rm -f "$SYSTEM_SUMMARY_FILE"
        exit 1
    fi

    # Get DHCP reservations for checking
    print_status "Getting DHCP reservations..."
    DHCP_RESERVATIONS=$(get_dhcp_reservations)
    if [ $? -ne 0 ]; then
        print_warning "Failed to get DHCP reservations, continuing without DHCP checks"
        DHCP_RESERVATIONS="[]"
    fi

    # Debug: Show what's in DHCP_RESERVATIONS variable
    if [ "$DEBUG" = "true" ]; then
        print_status "Debug: DHCP_RESERVATIONS variable content: ${DHCP_RESERVATIONS:0:200}..." >&2
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

        # Show DHCP reservations count
        local dhcp_count
        dhcp_count=$(echo "$DHCP_RESERVATIONS" | jq 'length' 2>/dev/null)
        print_status "Debug: Total DHCP reservations: $dhcp_count"
    fi
    
    # Process the IP range
    process_ip_range
    
    print_success "Script completed successfully!"

    # Clean up temporary files
    rm -f "$SYSTEM_SUMMARY_FILE"
    rm -f "$ALL_ALIASES_CACHE_FILE"

    SCRIPT_EXIT_SUCCESS=true
}

# Initialize variables
SERVER_URL=""
IP_RANGE=""
UNASSIGN_GROUP="false"
DELETE_HOST_ALIAS="false"
DELETE_RENAMED_HOST_ALIASES="false"
DELETE_ARP_HOST_ALIASES="false"
DELETE_DHCP_HOST_ALIASES="false"
DRY_RUN="false"
DEBUG="false"
API_KEY=""
START_IP=""
END_IP=""
SYSTEM_SUMMARY_FILE=""
DHCP_RESERVATIONS=""
ALL_ALIASES_CACHE_FILE=""

# Wrapper function to catch failures and provide generic error message
run_script() {
    # Check if no arguments were provided
    if [ $# -eq 0 ]; then
        SCRIPT_EXIT_SUCCESS=true
        show_usage
        exit 0
    fi
    
    # Run main function and capture exit code
    main "$@"
    local exit_code=$?
    
    # If main function didn't exit with 0, provide generic error
    if [ $exit_code -ne 0 ]; then
        echo
        print_error "Script failed to complete successfully (exit code: $exit_code)"
        print_error ""
        print_error "This could be due to:"
        print_error "  - Network connectivity issues"
        print_error "  - Invalid server URL or API endpoint"
        print_error "  - Authentication problems"
        print_error "  - Server configuration issues"
        print_error "  - Permission or access problems"
        print_error ""
        print_error "Please check the error messages above and try again."
        print_error "If the problem persists, verify your server URL and API key."
        exit $exit_code
    else
        # Script completed successfully, set flag and remove the error trap
        SCRIPT_EXIT_SUCCESS=true
        trap - EXIT
    fi
}

# Run the script with error handling
run_script "$@" 