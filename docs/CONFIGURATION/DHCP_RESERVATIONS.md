# DHCP Reservations

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Configuration](./)

## Overview

This document provides comprehensive documentation for the DHCP reservation system in InstradaOGM, including API functionality, auto-reservation logic, MAC randomization detection, and complete system integration.

## System Architecture

### Core Components

The DHCP system in InstradaOGM consists of several integrated components:

1. **API Layer** (`/api/opnsense/dhcp`)
   - RESTful endpoints for DHCP operations
   - Authentication and authorization
   - MAC randomization detection
   - Conflict resolution

2. **Frontend Components**
   - `ManageDhcpCard`: Administrative DHCP management interface
   - `DhcpReservationsTableModal`: View and manage existing reservations
   - `ActiveArpTableModal`: Browse active network devices
   - `DhcpKeaLeasesTableModal`: View current DHCP leases
   - Auto-reservation integration in device renaming

3. **Backend Services**
   - OPNsense Kea DHCP integration
   - ARP table monitoring
   - Permission validation
   - Audit logging

4. **Utility Libraries**
   - `mac-utils.ts`: MAC address analysis and randomization detection
   - `user-permissions.ts`: DHCP access control
   - `network-utils.ts`: IP address and subnet utilities

## API Endpoints

### DHCP Route (`/api/opnsense/dhcp`)

The DHCP API supports both GET and POST operations with comprehensive parameter handling.

#### Authentication & Authorization

All DHCP operations require authentication:
- **Supported Roles**: USER, ADMIN, SUPER_ADMIN
- **Permission Model**: Role-based with IP-specific access control
- **Security**: Request tracking and audit logging

#### Supported Actions

| Action | Method | Parameters | Description |
|--------|--------|------------|-------------|
| `subnets` | GET | None | Fetch available DHCP subnets |
| `search_reservation` | GET/POST | `ip`, `mac` | Search for existing DHCP reservations |
| `all_reservations` | GET | None | Fetch all DHCP reservations (ADMIN+) |
| `arp_entries` | GET | None | Fetch active ARP table entries |
| `kea_leases` | GET | None | Fetch active Kea DHCP leases |
| `add_reservation` | POST | `subnet`, `ip_address`, `hw_address`, `hostname`, `description` | Create new DHCP reservation |
| `delete_reservation` | POST | `uuid` | Delete existing DHCP reservation |

#### Parameter Handling

The API supports flexible parameter passing:

**Query Parameters (Preferred)**
```javascript
GET /api/opnsense/dhcp?action=search_reservation&ip=192.168.1.100&mac=aa:bb:cc:dd:ee:ff
```

**JSON Body (Fallback)**
```javascript
POST /api/opnsense/dhcp?action=add_reservation
{
  "payload": {
    "subnet": "subnet-uuid",
    "ip_address": "192.168.1.100",
    "hw_address": "aa:bb:cc:dd:ee:ff",
    "hostname": "my-device",
    "description": "Auto-created reservation"
  }
}
```

## DHCP Reservation Management

### Creating Reservations

#### Manual Creation
Administrators can create DHCP reservations through the `ManageDhcpCard` interface:

1. **Subnet Selection**: Choose from available DHCP subnets
2. **Device Information**: Enter IP, MAC, hostname, and description
3. **Validation**: Automatic format validation and conflict detection
4. **MAC Analysis**: Privacy MAC detection with warnings

#### Auto-Reservation Logic

Auto DHCP reservation is triggered during host alias renaming when:

1. **Host Alias Rename**: User renames a host alias AND opts to create DHCP reservation
2. **Device Online**: Target device is currently online (has active ARP entry)
3. **No Existing Reservation**: Device doesn't already have a DHCP reservation
4. **User Permissions**: User has appropriate permissions for the IP address

### Permission Model

#### USER Role Permissions
Users can create DHCP reservations for:

1. **Same IP Access**: The IP address they're currently accessing from
2. **Permitted Devices**: IPs that match devices they have specific permissions for
3. **Network Range Access**: IPs within their permitted network ranges

#### Permission Check Flow
```
1. Check general device access permissions
   ├─ NO: Deny DHCP access
   └─ YES: Continue to step 2

2. Check same-IP access (user IP == target IP)
   ├─ YES: Allow DHCP reservation
   └─ NO: Continue to step 3

3. Check permitted devices list
   ├─ IP found in permitted devices: Allow DHCP reservation
   └─ IP not found: Continue to step 4

4. Check network-based permissions
   ├─ IP within permitted network ranges: Allow DHCP reservation
   └─ IP not in permitted ranges: Deny DHCP access
```

## MAC Randomization Detection

### Detection Process

The system automatically analyzes MAC addresses for privacy randomization:

1. **Automatic Analysis**: Every DHCP reservation request analyzes the MAC address
2. **Detection Logic**: Check if second character is 2, 6, A, or E (locally administered bit)
3. **Warning Generation**: Create user-friendly warnings when randomized MAC detected
4. **Audit Logging**: Include MAC randomization status in audit logs

### Detection Algorithm

```javascript
// Normalize MAC address - remove separators and convert to uppercase
const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();

// Get the second character (nibble) of the first byte
const secondChar = normalizedMac.charAt(1);

// Check if the second character indicates locally administered address
const randomizedChars = ['2', '6', 'A', 'E'];
const isRandomized = randomizedChars.includes(secondChar);
```

### Warning Messages

When privacy MAC addresses are detected, the system provides comprehensive warnings:

```
⚠️ Privacy MAC Detected: The MAC address aa:bb:cc:dd:ee:ff appears to be randomized for privacy protection.

🔄 This means the device may change its MAC address periodically, which could cause:
• DHCP reservation to stop working when MAC changes
• Device to receive different IP addresses over time
• Need to recreate DHCP reservation with new MAC address

💡 Consider:
• Disabling MAC randomization for this network on the device
• Using static IP configuration instead of DHCP reservation
• Being prepared to update the reservation if the MAC changes
```

## Frontend Integration

### Administrative Interface

The `ManageDhcpCard` component provides comprehensive DHCP management:

- **Reservation Creation**: Form-based reservation creation with validation
- **Subnet Management**: Dropdown selection of available DHCP subnets
- **Device Selection**: Integration with host aliases for easy device selection
- **Status Indicators**: Visual indicators for reservation status and conflicts

### Modal Components

#### DhcpReservationsTableModal
- View all configured DHCP reservations
- Search and filter reservations
- Bulk deletion capabilities
- Status indicators for active/inactive reservations
- MAC randomization warnings

#### ActiveArpTableModal
- Browse active network devices from ARP table
- Select devices for reservation creation
- Real-time device status
- MAC randomization detection

#### DhcpKeaLeasesTableModal
- View current DHCP leases from Kea
- Lease expiration information
- Device status correlation
- Reservation status indicators

### Self-Service Integration

Both `SelfServiceCard` and `DeviceManagementCard` support auto-reservation:

- **Rename Integration**: Checkbox option during host alias renaming
- **Permission Validation**: Automatic permission checking
- **Status Updates**: Real-time DHCP status refresh after operations
- **Error Handling**: User-friendly error messages and guidance

## Status Indicators and Badges

### DHCP Status Badges

The system uses color-coded badges to indicate DHCP reservation status:

- **Blue Badge**: Normal DHCP reservation
- **Yellow Badge**: Privacy MAC address detected
- **Orange Badge**: MAC address conflict detected
- **Green Checkmark**: Active reservation with matching ARP entry
- **Red X**: No DHCP reservation
- **Warning Triangle**: Reservation conflict or issue

### Tooltip Information

Detailed tooltips provide additional context:
- Reservation details (IP, MAC, hostname)
- Conflict explanations
- Privacy MAC warnings
- Resolution suggestions

## Conflict Detection and Resolution

### Types of Conflicts

1. **IP Conflicts**: Same IP assigned to different MAC addresses
2. **MAC Conflicts**: Same MAC address with different IP assignments
3. **ARP Mismatches**: DHCP reservation doesn't match active ARP entry
4. **Privacy MAC Issues**: Randomized MAC addresses causing instability

### Conflict Resolution

The system provides several conflict resolution mechanisms:

1. **Automatic Detection**: Real-time conflict identification
2. **Warning Systems**: Clear visual and textual warnings
3. **Resolution Guidance**: Step-by-step resolution instructions
4. **Administrative Tools**: Bulk operations for conflict resolution

## Error Handling

### Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `Permission denied` | User lacks IP access permissions | Grant user permission to host alias with target IP |
| `Reservation already exists` | DHCP reservation already created | Use existing reservation or delete and recreate |
| `Invalid MAC address` | Malformed MAC address format | Ensure MAC follows XX:XX:XX:XX:XX:XX format |
| `Device not online` | No ARP entry for IP | Ensure device is connected and responding |
| `OPNsense API error` | Backend DHCP service issue | Check OPNsense DHCP service status |
| `Subnet not found` | Invalid or missing subnet UUID | Verify subnet configuration in OPNsense |
| `MAC conflict detected` | MAC address already reserved | Resolve existing reservation or use different MAC |

### Error Response Format

```json
{
  "success": false,
  "error": "Permission denied for IP address 192.168.1.100",
  "details": {
    "code": "PERMISSION_DENIED",
    "ip": "192.168.1.100",
    "userId": "user123",
    "macRandomizationCheck": {
      "isRandomized": true,
      "confidence": "high"
    }
  }
}
```

## Performance Considerations

### Optimizations

1. **MAC Analysis**: Lightweight regex-based detection
2. **Permission Caching**: User permissions cached during request lifecycle
3. **API Efficiency**: Minimal OPNsense API calls with intelligent batching
4. **Error Short-Circuiting**: Fast failure for permission denials
5. **Data Correlation**: Efficient ARP table and reservation correlation

### Monitoring Points

- DHCP reservation creation success rate
- MAC randomization detection accuracy
- Permission check performance
- OPNsense API response times
- Conflict detection efficiency

## Security Considerations

### Authentication Requirements

All DHCP operations require proper authentication:
- Session-based authentication for web interface
- API key authentication for programmatic access
- Role-based access control (RBAC)

### Permission Validation

Multi-layer permission validation:
1. **Role Verification**: Ensure user has appropriate role
2. **IP Access Control**: Validate user can access target IP
3. **Network Boundaries**: Respect network segmentation
4. **Audit Logging**: Complete operation tracking

### Data Protection

- MAC address normalization to prevent injection
- IP address validation and sanitization
- Hostname validation and filtering
- Secure API communication

## Testing and Validation

### Test Scenarios

1. **Permission Testing**: Verify USER role can only access permitted IPs
2. **MAC Randomization**: Test with various MAC address formats
3. **Auto-Reservation**: Test host alias rename with DHCP creation
4. **Error Handling**: Test all error scenarios
5. **Conflict Resolution**: Test various conflict scenarios
6. **Performance Testing**: Load testing with multiple concurrent operations

### Test MAC Addresses

```
Randomized MACs (should trigger warnings):
- 02:11:22:33:44:55 (starts with 02)
- 06:aa:bb:cc:dd:ee (starts with 06) 
- 0a:12:34:56:78:90 (starts with 0A)
- 0e:ff:ff:ff:ff:ff (starts with 0E)

Normal MACs (should not trigger warnings):
- 00:11:22:33:44:55 (manufacturer assigned)
- 08:00:27:12:34:56 (VirtualBox)
- bc:24:11:aa:91:97 (real device)
```

## Integration with OPNsense

### Kea DHCP Integration

The system integrates with OPNsense's Kea DHCP server:

- **Reservation Management**: Direct API calls to Kea DHCP
- **Lease Monitoring**: Real-time lease status tracking
- **Subnet Discovery**: Automatic subnet enumeration
- **Configuration Sync**: Consistent configuration management

### API Endpoints Used

- `/api/kea/dhcpv4/search_subnet`: Subnet enumeration
- `/api/kea/dhcpv4/search_reservation`: Reservation lookup
- `/api/kea/dhcpv4/add_reservation`: Reservation creation
- `/api/kea/dhcpv4/del_reservation`: Reservation deletion
- `/api/kea/dhcpv4/search_lease`: Active lease lookup

## Troubleshooting

### Common Issues

1. **Reservations Not Working**
   - Check OPNsense DHCP service status
   - Verify subnet configuration
   - Confirm MAC address format

2. **Permission Errors**
   - Verify user group memberships
   - Check host alias permissions
   - Confirm IP address access rights

3. **MAC Randomization Problems**
   - Educate users about privacy MAC addresses
   - Provide device-specific disable instructions
   - Consider static IP alternatives

4. **Performance Issues**
   - Monitor OPNsense API response times
   - Check network connectivity
   - Review audit logs for patterns

## Section Navigation

### Configuration Documentation
- [📋 Configuration Overview](./) - Section index and overview
- [🔐 SSO Provider Config](SSO_PROVIDER_CONFIG.md) - Configure single sign-on providers
- [🌐 Proxy Settings](CADDY-PROXY-SETTINGS.md) - Configure reverse proxy
- [🗄️ Database Configuration](../SETUP/DATABASE_CONFIGURATION_GUIDE.md) - Database setup and configuration

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 API Reference](../api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Configuration Section](./) - Section-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report configuration problems

---

### Diagnostic Tools

- **DHCP Reservations Table**: View all reservations and their status
- **ARP Table Browser**: Check active network devices
- **Kea Leases Viewer**: Monitor current DHCP leases
- **Audit Logs**: Track all DHCP operations and errors

---

**Last Updated**: 2025-11-06 | **Section**: Configuration | **Category**: Network Management


