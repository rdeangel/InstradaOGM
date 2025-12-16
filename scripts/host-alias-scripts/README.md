# InstadaOGM Host Alias Management Scripts
[⬆️ Back to Documentation Home](../docs/DOCUMENTATION_INDEX.md)

## Overview

This directory contains bash scripts for bulk management of host aliases using the InstadaOGM (InstradaOGM) API. These scripts are designed to be run externally by administrators for bulk operations.

## 📋 Scripts Overview

### 1. create-host-aliases.sh
Creates host aliases for IP addresses within a specified range using intelligent hostname detection.

### 2. cleanup-unused-host-aliases.sh  
Identifies and optionally removes host aliases that meet specific cleanup criteria with comprehensive safety features.

---

## 🚀 create-host-aliases.sh

### Overview
Intelligently creates host aliases for IP addresses within a specified range. The script uses smart hostname detection to create meaningful alias names when possible.

### Features
- **Intelligent Hostname Detection**: Scans OPNsense ARP table for detected hostnames
- **Sanitized Names**: Converts detected hostnames to OPNsense-compatible alias names
- **Fallback Naming**: Uses standard `HOST_x_x_x_x` format when no hostname is detected
- **Existing Alias Protection**: Never overwrites existing host aliases (even custom names)
- **Dry Run Mode**: Preview changes before execution
- **Debug Mode**: Detailed logging for troubleshooting

### Usage
```bash
./create-host-aliases.sh --url <InstradaOGM> --range <IP_RANGE> [OPTIONS]
```

### Required Parameters
- `--url <URL>`: InstadaOGM server URL (e.g., `https://instrada-ogm.example.com`)
- `--range <IP_RANGE>`: IP range in format `start_ip-end_ip` (e.g., `192.168.1.1-192.168.1.255`)

### Optional Parameters
- `--dry-run`: Show what would be done without making changes
- `--debug`: Enable detailed debug output
- `--help`: Display help information

### Examples
```bash
# Create host aliases for a small range
./create-host-aliases.sh --url https://instrada-ogm.example.com --range 192.168.1.100-192.168.1.110

# Preview changes without making them
./create-host-aliases.sh --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --dry-run

# Create aliases with debug output
./create-host-aliases.sh --url https://instrada-ogm.example.com --range 192.168.1.50-192.168.1.60 --debug
```

### How It Works
1. **Hostname Detection**: Checks OPNsense ARP table for detected hostnames
2. **Sanitization**: Converts hostnames to OPNsense-compatible format (lowercase, underscores, alphanumeric only)
3. **Fallback**: Uses `HOST_x_x_x_x` format when no hostname is detected
4. **Safety**: Skips IPs that already have host aliases

---

## 🧹 cleanup-unused-host-aliases.sh

### Overview
Identifies and optionally removes host aliases that meet specific cleanup criteria. Includes comprehensive safety features and multiple confirmation steps for dangerous operations.

### Safety Features
- **Multiple Confirmation Steps**: Requires explicit "CONFIRM" input for dangerous operations
- **Selective Deletion**: Fine-grained control over what gets deleted
- **Group Unassignment**: Safely removes group memberships before deletion
- **Duplicate Detection**: Identifies and handles duplicate IP address objects
- **ARP Detection**: Identifies active devices to prevent accidental deletion
- **DHCP Protection**: Protects devices with DHCP reservations

### Usage
```bash
./cleanup-unused-host-aliases.sh --url <InstradaOGM> --range <IP_RANGE> [OPTIONS]
```

### Required Parameters
- `--url <URL>`: InstadaOGM server URL (e.g., `https://instrada-ogm.example.com`)
- `--range <IP_RANGE>`: IP range to check (e.g., `192.168.1.1-192.168.1.255`)

### Safety Options
- `--dry-run`: Show what would be done without making changes
- `--debug`: Enable detailed debug output
- `--unassign-from-groups`: Remove group assignments before deletion
- `--delete-host-alias`: Actually delete host aliases (requires confirmation)

### Deletion Scope Options (Dangerous - Require --delete-host-alias)
- `--delete-renamed-host-aliases`: Include renamed host aliases in deletion
- `--delete-arp-host-aliases`: Include host aliases with ARP detection (active devices)
- `--delete-dhcp-host-aliases`: Include host aliases with DHCP reservations

### Examples
```bash
# Safe preview - see what would be cleaned up
./cleanup-unused-host-aliases.sh --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --dry-run

# Unassign from groups only (safe operation)
./cleanup-unused-host-aliases.sh --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --unassign-from-groups

# Full cleanup with confirmations (dangerous)
./cleanup-unused-host-aliases.sh --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --unassign-from-groups --delete-host-alias

# Debug mode for troubleshooting
./cleanup-unused-host-aliases.sh --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.255 --dry-run --debug
```

### Default Cleanup Criteria
By default, the script targets host aliases that are:
1. **Not active** (no ARP detection)
2. **No DHCP reservation**
3. **Standard naming** (HOST_x_x_x_x format, not renamed)
4. **Not assigned to groups** (or unassigned first with --unassign-from-groups)

### Advanced Features
- **Duplicate IP Handling**: Automatically detects and removes duplicate host aliases for the same IP
- **Friendly Group Names**: Shows readable group names during unassignment
- **Comprehensive Reporting**: Detailed logs of all actions taken
- **Error Recovery**: Graceful handling of API errors and network issues

---

## 📋 Prerequisites

### 1. API Key Requirements
You need a valid InstadaOGM API key with appropriate permissions:
- **For creation**: ADMIN or SUPER_ADMIN role
- **For cleanup**: ADMIN or SUPER_ADMIN role

### 2. System Dependencies
- **bash**: Version 4.0 or higher
- **curl**: For API communication
- **jq**: JSON processor (for parsing API responses)

### 3. jq Installation
```bash
# Ubuntu/Debian
sudo apt-get install jq

# CentOS/RHEL
sudo yum install jq

# macOS
brew install jq
```

### 4. Network Access
- Direct network access to your InstadaOGM server
- Firewall rules allowing HTTPS traffic to InstradaOGM

---

## 🔐 Security Considerations

### API Key Handling
- Scripts prompt securely for API key (hidden input)
- API key is not stored or logged
- Use environment variables for automation:
  ```bash
  export OGM_API_KEY="your-api-key-here"
  ./create-host-aliases.sh --url https://instrada-ogm.example.com --range 192.168.1.1-192.168.1.10
  ```

### Safety Recommendations
1. **Always test with --dry-run first**
2. **Start with small IP ranges**
3. **Use --debug for troubleshooting**
4. **Keep backups of your InstadaOGM configuration**
5. **Test in non-production environment first**

---

## 🚨 Important Notes

### For create-host-aliases.sh
- **Never overwrites existing aliases**: Protects custom naming
- **Hostname detection**: Requires devices to be active in ARP table
- **Large ranges**: Process in batches for better performance

### For cleanup-unused-host-aliases.sh
- **Destructive operations**: Requires multiple confirmations
- **Group assignments**: Use --unassign-from-groups to safely remove group memberships
- **Active devices**: Protected by default unless explicitly overridden
- **DHCP reservations**: Protected by default unless explicitly overridden

### Performance Tips
- Use smaller IP ranges for faster processing
- Run during low-traffic periods
- Monitor InstadaOGM server resources during large operations

---

## 📞 Support

If you encounter issues:
1. Run with `--debug` flag for detailed output
2. Check InstadaOGM server logs
3. Verify API key permissions
4. Test network connectivity to InstadaOGM server
5. Ensure all dependencies are installed

For more information, see the individual script help:
```bash
./create-host-aliases.sh --help
./cleanup-unused-host-aliases.sh --help
```

---

## Section Navigation

### Host Alias Scripts Documentation
- [🔧 create-host-aliases.sh](./create-host-aliases.sh) - Create host aliases for IP ranges
- [🧹 cleanup-unused-host-aliases.sh](./cleanup-unused-host-aliases.sh) - Clean up unused host aliases

---

## Related Documentation

- [📚 Documentation Home](../../docs/DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../../docs/SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 Configuration](../../docs/CONFIGURATION/) - System configuration
- [🔧 API Reference](../../docs/api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../../docs/DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Host Alias Scripts](./) - Script-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report script issues

---

**Last Updated**: 2025-11-07 | **Section**: Scripts | **Category**: Host Management
