# MAC Address Tracking

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](../FEATURES/)

## Overview

The MAC Address Tracking feature provides comprehensive network device discovery and monitoring through automated ARP table scanning. This advanced system identifies devices on your network, tracks their active/inactive status, detects privacy MAC addresses, and integrates with DHCP reservations for complete network visibility.

## Key Features

### 🔄 **Automated Device Discovery**
- **Periodic ARP Scans**: Configurable scanning intervals (1-60 minutes)
- **Real-time Detection**: Immediate discovery of new devices joining the network
- **Interface Monitoring**: Tracks devices across multiple network interfaces
- **Background Processing**: Non-blocking scans that don't impact web interface performance

### 🔒 **Privacy MAC Detection**
- **Automatic Identification**: Detects randomized MAC addresses used by modern devices
- **Privacy Indicators**: Clear visual indicators for privacy-enabled devices
- **Pattern Recognition**: Identifies common privacy MAC patterns from iOS, Android, and Windows
- **Locally Administered Detection**: Uses bit-level analysis to identify randomized addresses

### 📋 **DHCP Integration**
- **Reservation Checking**: Real-time DHCP reservation status for all MAC/IP combinations
- **Conflict Detection**: Identifies potential IP/MAC address conflicts
- **Status Tracking**: Historical tracking of DHCP reservation changes
- **API Integration**: Seamless integration with OPNsense Kea DHCP service

### 📊 **Comprehensive Analytics**
- **Device Statistics**: Total devices, active/inactive counts, privacy MAC percentages
- **Historical Tracking**: Complete timeline of device activity and IP associations
- **Vendor Identification**: Automatic MAC vendor lookup using 37,000+ OUI database
- **Activity Patterns**: Track device connection patterns and behavior

### 🏷️ **OPNsense Device Identification**
- **Automatic Detection**: Identifies MAC addresses belonging to OPNsense firewall interfaces
- **Visual Badges**: Clear "OPNsense" indicators in device lists and history
- **Interface Tracking**: Tracks which OPNsense interface (VLAN, WAN, LAN) each MAC belongs to
- **Shared MAC Handling**: Intelligently handles MAC addresses shared across multiple OPNsense interfaces

### 🚫 **MAC Address Exclusion Management**
- **Flexible Exclusion System**: Exclude specific MAC addresses from tracking for network management
- **Enhanced IP History Tracking**: Comprehensive IP history with exclusion status integration
- **Automatic Protocol Detection**: Built-in VRRP/HSRP MAC address detection and exclusion
- **Role-Based Control**: Granular permissions for exclusion management
- **Audit Trail**: Complete audit logging for all exclusion operations

### 🔐 **Role-Based Access Control**
- **ADMIN Role**: Read-only access (view lists, export data, view history, manage exclusions)
- **SUPER_ADMIN Role**: Full access (all ADMIN permissions plus service control, deletion)
- **USER Role**: No access to MAC tracking features
- **Feature Toggle**: Complete feature can be disabled with automatic service management

## MAC Exclusion Integration

### Overview

The MAC Exclusion system provides comprehensive management capabilities for excluding specific MAC addresses from tracking while maintaining detailed monitoring and audit capabilities. This integration enhances the existing MAC Address Tracking functionality by allowing administrators to control which devices are tracked, reducing noise and improving operational efficiency.

### Exclusion Modes

The system supports two exclusion modes for flexible network management:

**FULL Mode** (Default):
- Completely skip MAC during ARP scanning
- No database records created or updated
- No tracking at all
- Useful for infrastructure devices that don't need any monitoring

**PARTIAL Mode** (Advanced):
- Continue tracking current/active IPs
- Stop recording historical IP changes
- Reduce database growth while maintaining visibility
- Useful for devices where you want to see current state but not history
- Shows deduplicated IP list (each IP appears only once)
- If MAC becomes inactive, all its IPs are marked as inactive

### Benefits of MAC Exclusions

**Network Management:**
- **Noise Reduction**: Exclude infrastructure devices, virtual interfaces, and protocol-specific MACs
- **Focus on Relevant Devices**: Concentrate monitoring on end-user devices and critical infrastructure
- **Cleaner Analytics**: Improved statistics and reporting without irrelevant entries
- **Flexible Tracking**: Use PARTIAL mode to track current state without historical clutter

**Compliance and Security:**
- **Privacy Control**: Exclude sensitive devices from tracking logs
- **Regulatory Compliance**: Meet data retention and privacy requirements
- **Access Control**: Granular control over what network activity is monitored

**Operational Efficiency:**
- **Reduced Storage**: Lower database storage requirements (especially with PARTIAL mode)
- **Improved Performance**: Faster queries and reporting with smaller datasets
- **Simplified Management**: Focus on devices that matter for operations

### How Exclusions Work with Existing MAC Tracking

The MAC exclusion system integrates seamlessly with the existing MAC tracking infrastructure:

```typescript
// Integration flow in MAC tracking service
async function processMacEntry(macAddress: string, ipAddress: string) {
  // 1. Check if MAC is excluded
  const exclusion = await checkMacExclusion(macAddress);
  if (exclusion?.enabled) {
    logger.debug(`MAC ${macAddress} is excluded from tracking`);
    return; // Skip all tracking operations
  }

  // 2. Check for protocol MACs (VRRP/HSRP)
  const protocolInfo = isProtocolMac(macAddress);
  if (protocolInfo.isProtocolMac) {
    logger.debug(`Skipping ${protocolInfo.protocolType} MAC address: ${macAddress}`);
    return; // Skip protocol MACs
  }

  // 3. Continue with normal MAC tracking
  await updateMacTracking(macAddress, ipAddress);
}
```

**Integration Points:**
- **Early Filtering**: Exclusions are checked before any database operations
- **Protocol Detection**: Automatic VRRP/HSRP detection works alongside manual exclusions
- **History Preservation**: Existing history is preserved when exclusions are created
- **Audit Integration**: All exclusion operations are logged in the audit system

### VRRP/HSRP Automatic Detection and Exclusion

The system includes automatic detection and exclusion of common network protocol MAC addresses:

**VRRP (Virtual Router Redundancy Protocol):**
- **Pattern**: `00-00-5E-00-01-XX` where XX is the Virtual Router ID
- **Detection**: Automatic identification using regex pattern matching
- **Exclusion**: Automatically excluded from tracking to reduce noise
- **Logging**: Debug logging for monitoring and troubleshooting

**Cisco HSRP (Hot Standby Router Protocol):**
- **Pattern**: `00-00-0C-07-AC-XX` where XX is the group number
- **Detection**: Automatic identification using regex pattern matching
- **Exclusion**: Automatically excluded from tracking to reduce noise
- **Logging**: Debug logging for monitoring and troubleshooting

**Detection Algorithm:**
```typescript
function isProtocolMac(macAddress: string): {
  isProtocolMac: boolean;
  protocolType?: 'VRRP' | 'HSRP';
} {
  const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();

  // VRRP Pattern: 00005E0001XX
  if (/^00005E0001[0-9A-F]{2}$/.test(normalizedMac)) {
    return { isProtocolMac: true, protocolType: 'VRRP' };
  }

  // HSRP Pattern: 00000C07ACXX
  if (/^00000C07AC[0-9A-F]{2}$/.test(normalizedMac)) {
    return { isProtocolMac: true, protocolType: 'HSRP' };
  }

  return { isProtocolMac: false };
}
```

### Manual Exclusion Management

Administrators have comprehensive control over MAC exclusions through both the web interface and API:

**Creation Methods:**
- **Manual Creation**: Add exclusions for specific MAC addresses with custom reasons
- **Bulk Operations**: Create multiple exclusions efficiently
- **Toggle Operations**: Quick enable/disable without deletion
- **API Integration**: Programmatic exclusion management for automation

**Exclusion Settings:**
- **Enabled/Disabled Status**: Temporarily disable exclusions without deletion
- **Custom Reasons**: Detailed explanations for exclusion decisions
- **Retention Policies**: Configurable data retention for exclusion records
- **Audit Trail**: Complete history of all exclusion changes

## Recent Improvements and Fixes

### IP Association Status Tracking

The system now properly tracks the active/inactive status of IP associations:

- **Dynamic Status Badges**: IP associations display "Active" or "Inactive" badges based on actual status
- **MAC Status Override**: If a MAC address becomes inactive, all its associated IPs are marked as inactive
- **Accurate History**: Historical IP associations are properly marked as inactive when no longer in use
- **Deduplication**: In PARTIAL exclusion mode, each IP appears only once (most recent association)

### UI/UX Improvements

**Label Updates:**
- "Current IPs" renamed to "IPs" for brevity and clarity
- "IP Association History" renamed to "Previous IP Associations" to better reflect content
- Consistent labeling across desktop and mobile views

**Layout Enhancements:**
- Improved scrolling and content visibility for multiple IPs
- Better handling of devices with 5+ IP associations
- Responsive design that works on all screen sizes
- Mobile-optimized card layout with dedicated modals for IP viewing

**Button Improvements:**
- Desktop view shows "Full History (x)" button that opens a modal with complete IP history
- Mobile view shows "Full History" button with same functionality
- For partial exclusion mode, shows "Show More (x)" button when multiple current IPs exist
- Consistent behavior across all screen sizes

### Partial Exclusion Enhancements

**IP Deduplication:**
- Each IP appears only once in the list (most recent association)
- Eliminates duplicate entries for devices with multiple IP changes
- Keeps only the most recent association for each unique IP address

**MAC Status Handling:**
- If MAC is inactive, all its IPs show as "Inactive" regardless of individual IP status
- Ensures accurate representation when device is offline
- Prevents showing "Active" IPs for offline devices

**No History Recording:**
- PARTIAL mode does not create historical entries
- Reduces database growth while maintaining current state visibility
- Perfect for infrastructure devices where you only care about current IPs

## Managing MAC Exclusions

### How to Create Exclusions

**Through the Web Interface:**
1. Navigate to **Admin → MAC Address Tracking**
2. Search for the MAC address or browse the device list
3. Click the **Exclude** button next to the desired device
4. Enter a reason for the exclusion (optional but recommended)
5. Confirm the exclusion creation

**Through the API:**
```bash
# Create a new exclusion
curl -X POST "{{SERVER_URL}}/api/admin/mac-tracking/exclusions" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "macAddress": "aa:bb:cc:dd:ee:ff",
    "reason": "Infrastructure device - exclude from tracking"
  }'
```

**Toggle Exclusion Status:**
```bash
# Toggle exclusion for existing MAC
curl -X POST "{{SERVER_URL}}/api/admin/mac-exclusions/aa%3Abb%3Acc%3Add%3Aee%3Aff/toggle" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "reason": "Re-enabling exclusion for maintenance window"
  }'
```

### Exclusion Settings and Retention Policies

**Global Exclusion Settings:**
- **Enable/Disable Feature**: Complete control over exclusion functionality
- **Retention Period**: Configurable data retention (1-365 days)
- **Default Behavior**: Settings for new exclusion creation
- **Access Control**: Role-based permissions for settings management

**Retention Policy Configuration:**
```typescript
interface ExclusionSettings {
  enableMacExclusions: boolean;        // Enable/disable exclusions
  macExclusionRetentionDays: number;   // Retention period (1-365 days)
}
```

**Data Cleanup:**
- **Automated Cleanup**: Scheduled removal of expired exclusion records
- **Manual Cleanup**: On-demand cleanup with custom retention periods
- **Preservation of Active Exclusions**: Active exclusions are never automatically removed
- **Audit Preservation**: Audit logs are maintained according to system-wide policies

### Viewing Exclusion History and Audit Trail

**Exclusion History:**
- **Complete Timeline**: Full history of all exclusion changes
- **User Attribution**: Track which user made each change
- **Timestamp Tracking**: Precise timing of all exclusion operations
- **Status Changes**: History of enable/disable transitions

**Audit Trail Integration:**
```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "userId": "admin-user-id",
  "action": "MAC_EXCLUSION_CREATED",
  "resource": "mac-exclusion",
  "resourceId": "clm123abc456def789",
  "details": {
    "macAddress": "aa:bb:cc:dd:ee:ff",
    "reason": "Infrastructure device - exclude from tracking",
    "enabled": true
  },
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0..."
}
```

**Monitoring and Reporting:**
- **Exclusion Statistics**: Track total exclusions, active/inactive counts
- **User Activity**: Monitor exclusion management by user
- **Compliance Reports**: Generate reports for audit and compliance requirements
- **Trend Analysis**: Track exclusion patterns over time

### Best Practices for Exclusion Management

**Strategic Exclusion Planning:**
- **Infrastructure Devices**: Exclude switches, routers, and APs that don't need tracking
- **Virtual Interfaces**: Exclude VLAN interfaces, loopbacks, and virtual IPs
- **Protocol MACs**: Rely on automatic VRRP/HSRP detection when possible
- **Temporary Exclusions**: Use disable/enable instead of delete for temporary needs

**Documentation and Communication:**
- **Clear Reasons**: Always provide descriptive reasons for exclusions
- **Regular Reviews**: Periodically review exclusions for relevance
- **Team Coordination**: Ensure team awareness of exclusion policies
- **Change Management**: Follow established change management procedures

**Security and Compliance:**
- **Principle of Least Privilege**: Only exclude what's necessary
- **Audit Trail Maintenance**: Ensure complete audit coverage
- **Data Retention**: Follow organizational data retention policies
- **Access Control**: Restrict exclusion management to authorized personnel

## Technical Implementation

### Database Schema

The MAC tracking system uses four main database tables:

#### MacAddress Table
```sql
model MacAddress {
  id                String   @id @default(cuid())
  macAddress        String   @unique
  vendor            String?
  hostname          String?
  isActive          Boolean  @default(false)
  isPrivacyMac      Boolean  @default(false)
  firstSeen         DateTime @default(now())
  lastSeen          DateTime @default(now())
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  ipAssociations    MacIpAssociation[]
  exclusion         MacExclusion?

  @@index([macAddress])
  @@index([isActive])
  @@index([isPrivacyMac])
  @@index([lastSeen])
}
```

#### MacIpAssociation Table
```sql
model MacIpAssociation {
  id                  String     @id @default(cuid())
  macAddressId        String
  ipAddress           String
  interface           String?
  firstSeen           DateTime   @default(now())
  lastSeen            DateTime   @default(now())
  hasDhcpReservation  Boolean    @default(false)
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt
  macAddress          MacAddress @relation(fields: [macAddressId], references: [id], onDelete: Cascade)

  @@index([macAddressId])
  @@index([ipAddress])
  @@index([lastSeen])
  @@unique([macAddressId, ipAddress])
  hasDhcpConflict     Boolean    @default(false)
}
```

#### MacExclusion Table
```sql
model MacExclusion {
  id              String     @id @default(cuid())
  macAddressId    String     @unique
  enabled         Boolean    @default(true)
  reason          String?
  excludedBy      String
  excludedAt      DateTime   @default(now())
  lastModifiedBy  String?
  lastModifiedAt  DateTime   @updatedAt
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  macAddress      MacAddress @relation(fields: [macAddressId], references: [id], onDelete: Cascade)

  @@index([macAddressId])
  @@index([enabled])
  @@index([excludedAt])
}
```

#### MacIpHistory Table
```sql
model MacIpHistory {
  id              String   @id @default(cuid())
  macAddressId    String
  ipAddress       String
  networkInterface String?
  firstSeen       DateTime @default(now())
  lastSeen        DateTime @default(now())
  detectionCount  Int      @default(1)
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([macAddressId])
  @@index([ipAddress])
  @@index([lastSeen])
  @@index([isActive])
}
```

### OPNsense MAC Detection

The system automatically identifies MAC addresses belonging to OPNsense interfaces:

```typescript
async function getCachedOpnsenseMacAddresses(): Promise<string[]> {
  // Fetches MAC addresses from OPNsense API
  // Caches for 5 minutes to reduce API calls
  // Returns array of OPNsense interface MAC addresses
}
```

**OPNsense Badge Display:**
- **Device Lists**: Shows "OPNsense" badge for identified firewall interfaces
- **History Views**: Includes OPNsense status in device history
- **Search Filtering**: Can filter by OPNsense devices using search keywords
- **Interface Information**: Displays specific interface name (vlan10, wan, lan0, etc.)

### Privacy MAC Detection Algorithm

The system uses multiple methods to detect privacy MAC addresses:

```typescript
function isPrivacyMac(macAddress: string): boolean {
  const cleanMac = macAddress.replace(/[:-]/g, '').toUpperCase();
  const firstOctet = parseInt(cleanMac.substring(0, 2), 16);

  // Check locally administered bit (bit 1 of first octet)
  const isLocallyAdministered = (firstOctet & 0x02) !== 0;

  // Ensure it's unicast (bit 0 should be 0)
  const isUnicast = (firstOctet & 0x01) === 0;

  return isLocallyAdministered && isUnicast;
}
```

**Privacy MAC Patterns:**
- **iOS Devices**: Often use `02:xx:xx:xx:xx:xx` or `06:xx:xx:xx:xx:xx` patterns
- **Android Devices**: Commonly use `12:xx:xx:xx:xx:xx` or `16:xx:xx:xx:xx:xx` patterns
- **Windows Devices**: Various patterns with locally administered bit set

### DHCP Integration

The system integrates with OPNsense Kea DHCP service:

```typescript
async function checkDhcpReservation(macAddress: string, ipAddress: string): Promise<boolean> {
  try {
    const response = await fetch('/api/kea/dhcpv4/search_reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();
    return data.reservations?.some(reservation =>
      reservation.hw_address === macAddress &&
      reservation.ip_address === ipAddress
    ) || false;
  } catch (error) {
    logger.error('DHCP reservation check failed:', error);
    return false;
  }
}
```

### Shared MAC Address Handling

The system includes intelligent logic to handle MAC addresses shared across multiple OPNsense interfaces (common in VLAN environments):

```typescript
// Logic for handling shared OPNsense MAC addresses
if (isOpnsenseMac) {
  const existingAssociation = await tx.macIpAssociation.findFirst({
    where: { macAddressId: macRecord.id, isActive: true }
  });

  if (!existingAssociation) {
    // Create first association for OPNsense MAC
    createAssociation();
  } else {
    const isSameInterface =
      existingAssociation.ipAddress === ipAddress &&
      existingAssociation.networkInterface === networkInterface;

    if (isSameInterface) {
      // Same interface - just update timestamp
      updateTimestamp();
    } else {
      // Different interface - update existing association without creating history
      // This prevents duplicate entries for shared MACs across VLANs
      updateExistingAssociation();
    }
  }
}
```

**Shared MAC Scenarios:**
- **VLAN Interfaces**: Same physical interface MAC appears on multiple VLANs
- **Interface Changes**: MAC moves between different OPNsense interfaces over time
- **IP Changes**: Same MAC gets different IP addresses on different interfaces
- **History Prevention**: Single association record updated instead of creating duplicates

**Benefits:**
- **Cleaner History**: Eliminates redundant entries for shared MAC addresses
- **Better Performance**: Reduces database storage and query overhead
- **Accurate Tracking**: Maintains current state without historical clutter
- **OPNsense-Specific**: Only affects OPNsense interfaces, regular devices still create full history

## Configuration

### Global Settings

MAC Address Tracking is configured through Global Settings:

```typescript
interface MacTrackingSettings {
  enableMacTracking: boolean;        // Enable/disable entire feature
  macTrackingInterval: number;       // Scan interval in minutes (1-60)
  macInactiveTimeout: number;        // Minutes before marking offline (default: 1440)
}

interface ExclusionSettings {
  enableMacExclusions: boolean;      // Enable/disable MAC exclusions
  macExclusionRetentionDays: number; // Retention period for exclusion data (1-365)
}
```

### Service Management
 
The MAC tracking service is tightly integrated with Global Settings but can also be controlled manually through the API:
 
- **Automatic Synchronization**: Toggling `enableMacTracking` in Global Settings automatically starts or stops the background service. Changing the `macTrackingInterval` automatically restarts it with the new schedule.
- **Manual Control** (API/UI):
  - **Start**: Begin periodic ARP scanning
  - **Stop**: Stop all scanning operations
  - **Restart**: Stop and restart with current settings
  - **Run**: Execute manual scan immediately
  - **Cleanup**: Remove old association data

> [!NOTE]
> **Service Restart Behavior**: Manually stopping the service through the API or UI is temporary. When the application restarts (e.g., container restart, deployment update), the service will automatically restart if `enableMacTracking` is enabled in Global Settings. To permanently disable the service, toggle `enableMacTracking` to `false` in Global Settings.


### Performance Tuning

**Scan Intervals:**
- **High Frequency** (1-2 minutes): Real-time tracking, higher resource usage
- **Standard** (5 minutes): Balanced performance and accuracy (default)
- **Low Frequency** (15-60 minutes): Reduced resource usage, less real-time accuracy

**Database Optimization:**
- Indexed fields for fast queries
- Automatic cleanup of old associations
- Efficient pagination for large datasets
- Connection pooling for concurrent operations

### Automated Data Cleanup

The MAC tracking system includes an automated cleanup service that runs independently of the main tracking service:

**Cleanup Schedule:**
- **Frequency**: Daily at 2:00 AM
- **Independence**: Runs even when MAC tracking is disabled
- **Transaction Safety**: Uses database transactions for data integrity

**Retention Configuration:**
- **Setting**: `macDataRetentionDays` in Global Settings
- **Range**: 1-365 days (default: 90 days)
- **Validation**: Both UI and API enforce the 1-365 day range
- **Real-time Updates**: Changes take effect immediately for future cleanup operations

**Data Types Cleaned:**
- **MAC Addresses**: Inactive MAC addresses with no IP associations older than retention period
- **IP Associations**: MAC-IP association records older than retention period
- **Criteria**: Only removes inactive records (isActive: false) and orphaned MAC addresses

**Manual Cleanup:**
- **API Endpoint**: `/api/admin/mac-tracking/cleanup` (SUPER_ADMIN only)
- **Custom Retention**: Can specify different retention period for manual cleanup
- **Statistics**: Returns count of records cleaned up

**Monitoring:**
- **Logging**: All cleanup operations are logged with details
- **Statistics**: Cleanup results include counts of removed records
- **Health Monitoring**: Track cleanup effectiveness through service status

### Service Architecture

The service uses a robust **File-Based State Management** system to ensure reliable operation in multi-worker environments (e.g., Next.js clustering):
- **State File**: `.service-state/mac-tracking.json` coordinates status across workers.
- **Single Instance**: Ensures only one background timer runs per server.
- **Self-Termination**: If the service is stopped (via settings or API), any running instances detect the state change and shut down automatically.

## User Interface

### Admin Dashboard

The MAC tracking interface provides:

- **Device List**: Paginated table with sorting and filtering (50 items per page)
- **Search Functionality**: Text search with special keyword filters and clear button
- **Status Indicators**: Visual badges for active/inactive, privacy MAC, DHCP reserved, OPNsense device, excluded
- **Export Options**: JSON and CSV export formats
- **Service Control**: Start/stop service, manual scans, data cleanup (SUPER_ADMIN only)
- **Exclusion Management**: Create, toggle, and manage MAC exclusions directly from device list

### Mobile Interface

Fully responsive design with:

- **Card Layout**: Mobile-optimized device cards
- **Touch-Friendly**: Large touch targets and swipe gestures
- **Compact Information**: Essential device details in limited space
- **Consistent Navigation**: Same functionality as desktop interface


#### Icon semantics for History/Current IPs

- **Full Tracking**: Shows "Full History" button with counter; clicking opens modal with complete IP history
  - **Counter Meaning**: Number represents **IP configuration changes**, not total scans
  - **Consolidated View**: Consecutive scans with the same IP(s) are grouped into ranges
  - **Example**: If a device has IP 192.168.1.100 for 50 consecutive scans, this shows as 1 entry with a date range
- **Full Exclusion**: History icon with a Slash overlay; no counter; clicking opens dialog without history
- **Partial Exclusion**: Shows "Show More" button (if multiple IPs); clicking opens modal showing all current IPs

**History Consolidation:**
The system automatically consolidates consecutive network scans with identical IP configurations into single range entries:
- **Reduces Clutter**: Instead of showing 50 identical entries, you see one entry with "First seen" and "Last seen" timestamps
- **Highlights Changes**: Only creates new entries when the IP configuration actually changes
- **Accurate Counting**: The history counter shows the number of IP configuration changes, not the total number of scans
- **Better Insights**: Makes it easier to see when devices changed IP addresses or network behavior

Note: Both mobile and desktop views use dedicated modals for viewing IP history and current IPs for consistent accessibility and better content visibility.

### Search Keywords

Special search keywords for advanced filtering:

- `dhcp:` - Show only devices with DHCP reservations
- `dhcp-conflict:` - Show only devices with DHCP conflicts
- `privacy:` - Show only devices with privacy MAC addresses
- `active:` - Show only currently active devices
- `inactive:` - Show only currently inactive devices
- `opnsense:` - Show only OPNsense interface devices
- `excluded:` - Show only excluded MAC addresses
- `em0:` - Filter by specific network interface
- `lan:` - Filter by interface name

## Security Considerations

### Access Control

- **Feature Toggle**: Complete feature can be disabled
- **Role-Based Permissions**: Granular access control by user role
- **API Protection**: All endpoints protected when feature is disabled
- **Audit Logging**: All operations logged in comprehensive audit system

### Privacy Protection

- **Privacy MAC Identification**: Clear indicators for randomized addresses
- **No Personal Data**: Only network identifiers collected
- **Data Retention**: Configurable cleanup policies
- **Transparent Operation**: Users aware of tracking through UI indicators

### Network Security

- **Read-Only Access**: No modification of network configuration
- **Secure Integration**: Encrypted communication with OPNsense APIs
- **Error Handling**: Graceful handling of network failures
- **Resource Limits**: Configurable limits to prevent resource exhaustion

## Troubleshooting

### Common Issues

**Service Won't Start:**
- Check if MAC tracking is enabled in Global Settings
- Verify SUPER_ADMIN permissions for service control
- Check logs for OPNsense API connectivity issues

**No Devices Detected:**
- Verify OPNsense ARP table has entries
- Check network interface configuration
- Ensure proper API credentials for OPNsense

**Performance Issues:**
- Increase scan interval to reduce frequency
- Enable data cleanup to remove old associations
- Check database performance and indexing

**DHCP Integration Issues:**
- Verify Kea DHCP service is running on OPNsense
- Check DHCP API endpoint accessibility
- Review DHCP service logs for errors

### MAC Exclusion Troubleshooting

**Exclusions Not Working:**
- Verify MAC exclusions are enabled in Global Settings
- Check if specific exclusion is enabled (not disabled)
- Verify MAC address format is correct
- Check user permissions for exclusion management

**Automatic Protocol Detection Issues:**
- Verify VRRP/HSRP patterns are correctly configured
- Check debug logs for protocol MAC detection
- Ensure MAC addresses are in correct format
- Review regex pattern matching for edge cases

**Exclusion API Errors:**
- Verify API key has appropriate permissions (ADMIN/SUPER_ADMIN)
- Check MAC address format in API requests
- Review rate limiting headers if receiving 429 errors
- Ensure feature is not disabled in Global Settings

**Database Issues with Exclusions:**
- Check for duplicate exclusion records
- Verify foreign key relationships are intact
- Review database connection and transaction logs
- Ensure proper indexing on exclusion tables

### Logging

The system provides comprehensive logging:

- **Service Operations**: Start, stop, scan operations
- **Device Discovery**: New device detection and updates
- **DHCP Integration**: Reservation check results and errors
- **Performance Metrics**: Scan duration and device counts
- **Error Handling**: Detailed error messages and stack traces
- **Exclusion Operations**: Creation, modification, and deletion of exclusions
- **Protocol Detection**: VRRP/HSRP MAC detection and exclusion

### Monitoring

Monitor system health through:

- **Service Status**: Real-time service status and statistics
- **Device Counts**: Track total, active, and privacy MAC counts
- **Scan Performance**: Monitor scan duration and success rates
- **Database Growth**: Track data growth and cleanup effectiveness
- **Exclusion Metrics**: Monitor exclusion creation, modification, and usage patterns

## API Reference

For complete API documentation, see:
- [MAC Address Tracking Endpoints](../api/api_docs/13_mac_tracking_endpoints.md)
- [MAC Exclusion Endpoints](../api/api_docs/17_mac_exclusion_endpoints.md)

### Key Endpoints

**MAC Tracking:**
- `GET /api/admin/mac-tracking` - Get device list with filtering
- `GET /api/admin/mac-tracking/service` - Get service status
- `POST /api/admin/mac-tracking/service` - Control service operations
- `GET /api/admin/mac-tracking/export` - Export tracking data
- `GET /api/admin/mac-tracking/[mac]/history` - Get device history

**MAC Exclusions:**
- `GET /api/admin/mac-tracking/exclusions` - Get exclusion list
- `POST /api/admin/mac-tracking/exclusions` - Create new exclusion
- `PUT /api/admin/mac-tracking/exclusions/[id]` - Update exclusion
- `DELETE /api/admin/mac-tracking/exclusions/[id]` - Delete exclusion
- `POST /api/admin/mac-exclusions/[mac]/toggle` - Toggle exclusion
- `GET /api/admin/mac-tracking/exclusion-settings` - Get exclusion settings
- `PUT /api/admin/mac-tracking/exclusion-settings` - Update exclusion settings

## Integration Examples

### Automation Scripts

Monitor network changes:

```bash
#!/bin/bash
# Check for new devices every hour
curl -s "https://instrada-ogm.example.com/api/admin/mac-tracking?activeOnly=true" \
  -H "Authorization: Bearer $API_KEY" | \
  jq '.data[] | select(.firstSeen > "'$(date -d '1 hour ago' -Iseconds)'")'
```

### Monitoring Integration

Export data for external monitoring:

```bash
#!/bin/bash
# Daily export for monitoring system
curl -s "https://instrada-ogm.example.com/api/admin/mac-tracking/export?format=json&days=1" \
  -H "Authorization: Bearer $API_KEY" > /var/log/mac-tracking-$(date +%Y%m%d).json
```

### Exclusion Management

Automated exclusion for infrastructure devices:

```bash
#!/bin/bash
# Exclude known infrastructure MACs
INFRA_MACS=("00:00:5E:00:01:01" "00:00:0C:07:AC:01" "aa:bb:cc:dd:ee:ff")

for mac in "${INFRA_MACS[@]}"; do
  curl -X POST "https://instrada-ogm.example.com/api/admin/mac-tracking/exclusions" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"macAddress\": \"$mac\", \"reason\": \"Infrastructure device - auto-excluded\"}"
done
```

## Best Practices

### Configuration

- **Start with 5-minute intervals** for balanced performance
- **Enable data cleanup** with 90-day retention
- **Monitor resource usage** during initial deployment
- **Test DHCP integration** before production use
- **Configure exclusions** for known infrastructure devices

### Security

- **Use ADMIN role** for read-only monitoring users
- **Restrict SUPER_ADMIN** access for service control
- **Enable audit logging** for compliance requirements
- **Regular data cleanup** to manage storage growth
- **Document exclusion policies** for team coordination

### Performance

- **Monitor scan duration** and adjust intervals accordingly
- **Use pagination** for large device lists in UI
- **Implement caching** for frequently accessed data
- **Regular database maintenance** for optimal performance
- **Optimize exclusions** to reduce unnecessary tracking

### Exclusion Management

- **Document reasons** for all exclusions
- **Regular review** of exclusion list for relevance
- **Use automatic detection** for protocol MACs when possible
- **Implement change management** for exclusion policy changes
- **Monitor exclusion impact** on tracking accuracy and performance

---

## Section Navigation

### Features Documentation
- [📋 Features Overview](../FEATURES/) - Section index and overview
- [🔐 Related Document 1](../FEATURES/TWO_FACTOR_AUTHENTICATION_GUIDE.md) - Two-factor authentication setup and management
- [📊 Related Document 2](../FEATURES/ACCOUNT_ACTIVITY_DASHBOARD.md) - Account activity monitoring

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 API Reference](../api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Features Section](../FEATURES/) - Section-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report bugs or request features

---

**Last Updated**: 2025-11-06 | **Section**: Features | **Category**: Network Management
