# Network Group Validation System

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](./)

## Overview

The Network Group Validation System provides safety checks and connectivity warnings when managing network group settings, preventing accidental network disruptions and providing clear visibility into the impact of configuration changes.

## Key Features

### 1. Host Alias Validation
When attempting to globally disable a network group, the system automatically checks for assigned host aliases and prevents the action if aliases are found, requiring explicit user confirmation.

### 2. ARP Status Monitoring
Real-time detection of online devices through ARP table integration, showing which host aliases represent currently active network devices.

### 3. Connectivity Impact Warnings
Clear warnings when operations might affect online devices, helping administrators make informed decisions about network changes.

### 4. Bulk Operations with Safety Checks
Secure bulk removal of host alias assignments with detailed warnings about connectivity impact.

## How It Works

### Desktop Experience

#### 1. Validation Trigger
- User attempts to enable "Globally Disabled" toggle for a network group
- System automatically checks for assigned host aliases
- If aliases found, validation modal opens instead of allowing the toggle

#### 2. Validation Modal
The main validation modal displays:
- **Group Information**: Name and alias count
- **Status Summary**: "X Online Y Offline" showing ARP status breakdown
- **Warning Message**: Explanation of why the group cannot be disabled
- **Action Buttons**: Three options for proceeding

#### 3. Action Options

**View in Network Group**
- Opens detailed view modal showing all assigned host aliases
- Displays online status badges for active devices
- Scrollable list with IP addresses and descriptions
- Self-contained modal that overlays the main validation modal

**Remove All Assignments**
- Bulk removal of all host aliases from the network group
- Shows connectivity warning if online devices detected
- Requires typing "CONFIRM" to proceed
- Displays count of affected online devices

**Disable Group Anyway**
- Allows disabling the group while keeping host aliases assigned
- Shows detailed warning about consequences
- Explains that aliases become unmanaged and hidden from InstradaOGM
- Requires typing "CONFIRM" to proceed

### Mobile Experience

#### Responsive Design
- All modals automatically adapt to mobile screen sizes
- Touch-friendly button layouts and interactions
- Proper scrolling within modal constraints
- Optimized text sizes and spacing for mobile devices

#### Consistent Validation
- Same validation logic applies to mobile card view
- Mobile toggle switches trigger identical validation checks
- Modal system works seamlessly across all device types

## Visual Indicators

### Online Status Badges
- **Green "Online" Badge**: Device has active ARP entry (currently reachable)
- **No Badge**: Device is offline or not responding to ARP requests

### Status Summary
- **Green Dot + Count**: Number of online devices
- **Gray Dot + Count**: Number of offline devices
- **Real-time Data**: Reflects current network state

### Connectivity Warnings
- **Orange Warning Box**: Appears when online devices would be affected
- **Warning Triangle Icon**: Visual indicator for important warnings
- **Device Count**: Specific number of online devices that would be impacted

## Safety Features

### 1. Validation Checks
- Automatic detection of host alias assignments
- Prevention of accidental group disabling
- Real-time ARP status verification

### 2. Confirmation Requirements
- Double confirmation for destructive operations
- Required typing of "CONFIRM" for bulk operations
- Clear explanation of consequences before proceeding

### 3. Connectivity Protection
- Warnings when online devices would be affected
- Specific counts of impacted active connections
- Option to view detailed device information before proceeding

### 4. Reversible Operations
- Clear instructions for undoing changes
- Guidance on re-enabling groups or re-adding aliases
- Preservation of configuration data where possible

## User Workflow Examples

### Scenario 1: Disabling Group with Online Devices
1. User clicks "Globally Disabled" toggle
2. System detects 3 host aliases (2 online, 1 offline)
3. Validation modal opens showing status summary
4. User clicks "View in Network Group" to see details
5. Detailed modal shows which devices are online
6. User decides to "Remove All Assignments"
7. Connectivity warning shows "2 of 3 devices are online"
8. User types "CONFIRM" and proceeds
9. System removes all assignments and enables the toggle

### Scenario 2: Disabling Group Anyway
1. User attempts to disable group with assigned aliases
2. Validation modal opens with warnings
3. User chooses "Disable Group Anyway"
4. Second confirmation modal explains consequences
5. User types "CONFIRM" understanding aliases become unmanaged
6. Group is disabled but aliases remain assigned (hidden from InstradaOGM)

## Technical Implementation

### ARP Integration
- Real-time ARP table queries from OPNsense
- Efficient IP address matching using Set data structures
- Support for multi-IP host aliases
- Automatic refresh of ARP status during operations

### API Endpoints
- `/api/opnsense/network-groups/[uuid]/host-aliases` - Get aliases with ARP status
- `/api/opnsense/host-group-management` - Bulk operations for alias management

### Responsive Design
- Mobile-first modal design with proper viewport handling
- Touch-friendly interactions and button sizing
- Adaptive layouts for different screen sizes
- Consistent experience across desktop, tablet, and mobile

## Section Navigation

### Features Documentation
- [📋 Features Overview](./) - Section index and overview
- [🔐 Two-Factor Authentication Guide](./TWO_FACTOR_AUTHENTICATION_GUIDE.md) - 2FA setup and usage
- [📊 Account Activity Dashboard](./ACCOUNT_ACTIVITY_DASHBOARD.md) - User activity monitoring
- [📱 MAC Address Tracking](./MAC_ADDRESS_TRACKING.md) - Device tracking and management
- [🔓 MAC Randomization Guide](./MAC_RANDOMIZATION_GUIDE.md) - Privacy MAC detection and handling
- [🔧 Password Management](./PASSWORD_MANAGEMENT.md) - Password policies and management
- [🔗 Network Group Validation](./) - Current document
- [📋 Single/Multi Select Feature](./SINGLE_SELECT_MULTI_SELECT_FEATURE.md) - Group assignment options
- [🔓 Unmanaged Groups Feature](./UNMANAGED_GROUPS_FEATURE.md) - Group access restrictions

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 Configuration](../CONFIGURATION/) - System configuration
- [🔧 API Reference](../api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Features Section](./) - Section-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report feature problems

---

## Benefits

### For Network Administrators
- **Prevents Accidents**: Stops accidental disconnection of active devices
- **Provides Visibility**: Shows real-time network status and device connectivity
- **Enables Informed Decisions**: Clear information about impact of changes
- **Saves Time**: Bulk operations with safety checks reduce manual work

### For Network Operations
- **Reduces Downtime**: Prevents unintended service interruptions
- **Improves Planning**: Real-time device status helps with maintenance scheduling
- **Enhances Safety**: Multiple confirmation steps prevent costly mistakes
- **Maintains Compliance**: Audit trail of validation checks and user confirmations

## Best Practices

### Before Disabling Groups
1. Review the status summary to understand online device count
2. Use "View in Network Group" to identify specific online devices
3. Consider removing assignments for offline devices only
4. Plan maintenance windows for changes affecting online devices

### For Bulk Operations
1. Always review connectivity warnings carefully
2. Verify the count of online devices that would be affected
3. Consider the business impact of disconnecting active devices
4. Use "Disable Group Anyway" only when aliases should remain unmanaged

### Mobile Usage
1. Take advantage of responsive design for field operations
2. Use touch gestures for scrolling through device lists
3. Ensure stable network connection for real-time ARP status
4. Consider screen orientation for optimal modal viewing
