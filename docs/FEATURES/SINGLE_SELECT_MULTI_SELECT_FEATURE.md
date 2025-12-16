# 📋 **Single Select & Multi Select Group Types**

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](./)

## 🎯 **Overview**

The InstradaOGM supports two types of network group assignment behaviors: **Single Select** and **Multi Select**. This feature gives administrators flexible control over how devices can be assigned to network groups.

## 🔧 **Group Types Explained**

### **Single Select Groups**
- **Behavior**: A device can only be assigned to **one** Single Select group at a time
- **Use Case**: Mutually exclusive network policies (e.g., "Work Network" vs "Guest Network")
- **Assignment**: Assigning to a new Single Select group automatically removes the device from its current Single Select group

### **Multi Select Groups**
- **Behavior**: A device can be assigned to **multiple** Multi Select groups simultaneously
- **Use Case**: Additive network policies (e.g., "VPN Access" + "Printer Access" + "File Server Access")
- **Assignment**: Adding to Multi Select groups is cumulative - existing assignments are preserved

## 🎛️ **Administrator Configuration**

### **Global Group Types Setting**
Administrators can enable/disable the Group Types feature:

- **Enabled**: Groups show type indicators and enforce assignment rules
- **Disabled**: All groups behave as traditional single-assignment groups

### **Individual Group Configuration**
When Group Types are enabled, each network group can be configured as:

- **SingleSelect**: Device can only be in one SingleSelect group
- **MultiSelect**: Device can be in multiple MultiSelect groups simultaneously

### **Visual Indicators**
When Group Types are enabled, you'll see visual indicators next to group names:

- **Single Select Groups**: Single dot icon (●) - Device can only be in one
- **Multi Select Groups**: Multiple dots icon (⋯) - Device can be in multiple

### **Assignment Buttons**
The interface adapts based on current assignments:

- **"Assign"**: When device is not in any groups of this type
- **"Move"**: For Single Select groups when device is already in another Single Select group
- **"Add"**: For Multi Select groups when device can be added to additional groups

## 🔧 **Administrator Settings**

### **Global Configuration**
Administrators can configure Group Types in Global Settings:

#### **Enable Group Types**
- **Enabled**: Groups show type indicators and enforce assignment rules
- **Disabled**: All groups behave as traditional single-assignment groups

#### **Self-Service Access**
- **Allow Multi Select for Self-Service**: Controls whether self-service users can see and use Multi Select groups
- **Single Select Only**: Self-service users only see Single Select groups

#### **Custom Names & Icons**
- **Custom Display Names**: Change "Single Select" and "Multi Select" to organization-specific terms
- **Custom Icons**: Choose different icons for each group type

### **Individual Group Configuration**
Each network group can be configured as:
- **Single Select**: Mutually exclusive assignment
- **Multi Select**: Additive assignment

### **Scenario 1: Corporate Network**
**Setup:**
- **"Work Network"** (Single Select) - Main corporate access
- **"Guest Network"** (Single Select) - Limited guest access
- **"VPN Access"** (Multi Select) - Remote access capability
- **"Printer Access"** (Multi Select) - Printer permissions

**Usage:**
- Employee devices are assigned to **"Work Network"** + **"VPN Access"** + **"Printer Access"**
- Guest devices are assigned to **"Guest Network"** only
- If an employee device is moved to **"Guest Network"**, it automatically leaves **"Work Network"** but keeps **"VPN Access"** and **"Printer Access"**

### **Scenario 2: Home Network**
**Setup:**
- **"Tech Group"** (Single Select) - Full network access
- **"Family Group"** (Single Select) - Full home network access
- **"Kids Devices"** (Single Select) - Filtered internet access
- **"IoT Devices"** (Single Select) - Limited network access
- **"Gaming Priority"** (Multi Select) - QoS priority for gaming
- **"Streaming Priority"** (Multi Select) - QoS priority for streaming

**Usage:**
- Family laptops: **"Family Devices"** + **"Streaming Priority"**
- Gaming consoles: **"Family Devices"** + **"Gaming Priority"**
- Kids' tablets: **"Kids Devices"** (no additional priorities)
- Smart TVs: **"IoT Devices"** + **"Streaming Priority"**

### **Scenario 3: School Network**
**Setup:**
- **"Student Network"** (Single Select) - Student internet access
- **"Staff Network"** (Single Select) - Staff network access
- **"Admin Network"** (Single Select) - Administrative access
- **"Classroom Tools"** (Multi Select) - Access to educational tools
- **"Library Resources"** (Multi Select) - Access to library systems

**Usage:**
- Student devices: **"Student Network"** + **"Classroom Tools"**
- Teacher devices: **"Staff Network"** + **"Classroom Tools"** + **"Library Resources"**
- Admin devices: **"Admin Network"** + **"Library Resources"**

### **Smart Assignment Logic**
The system automatically handles group assignments based on group types:

#### **Single Select Groups**
- **Assigning to a new Single Select group**: Automatically removes device from any other Single Select groups
- **Multi Select groups are preserved**: Device keeps all Multi Select group memberships
- **Button shows "Move"**: Indicates the device will be moved from current Single Select group

#### **Multi Select Groups**
- **Always additive**: Adding to Multi Select groups never removes existing memberships
- **Preserves all existing groups**: Both Single Select and Multi Select memberships are kept
- **Button shows "Add"**: Indicates the group will be added to existing memberships

### **Example Assignment Flow**
**Current State:** Device is in "Work Network" (Single Select) + "VPN Access" (Multi Select)

**Scenario 1:** Assign to "Guest Network" (Single Select)
- ✅ **Result**: Device moves to "Guest Network" + "VPN Access"
- 🔄 **Action**: Removed from "Work Network", kept "VPN Access"

**Scenario 2:** Assign to "Printer Access" (Multi Select)
- ✅ **Result**: Device has "Work Network" + "VPN Access" + "Printer Access"
- ➕ **Action**: Added "Printer Access", kept all existing groups

## 👥 **User Experience**

### **Self-Service Users**
- **Limited Multi Select Access**: Administrators can choose whether self-service users see Multi Select groups
- **Simplified Interface**: When Multi Select is disabled for self-service, users only see Single Select groups
- **Clear Visual Feedback**: Button text changes to indicate the action ("Assign", "Move", or "Add")

### **Authenticated Users (Device Management)**
- **Full Access**: All authenticated users with device permissions see all group types
- **Complete Functionality**: Can use both Single Select and Multi Select groups regardless of self-service settings
- **Advanced Controls**: Access to all group assignment features

### **Group Design Recommendations**

#### **Use Single Select For:**
- **Mutually exclusive policies**: Network access levels that shouldn't overlap
- **Location-based access**: "Office Network" vs "Home Network" vs "Guest Network"
- **Security levels**: "High Security" vs "Standard Access" vs "Limited Access"
- **User categories**: "Employee" vs "Contractor" vs "Guest"

#### **Use Multi Select For:**
- **Service access**: "VPN Access", "Printer Access", "File Server Access"
- **Quality of Service**: "Gaming Priority", "Streaming Priority", "Business Priority"
- **Feature toggles**: "Beta Features", "Advanced Tools", "Monitoring Access"
- **Compliance requirements**: "HIPAA Compliant", "PCI Compliant", "SOX Compliant"

#### **Naming Conventions**
- **Be descriptive**: Use clear, business-friendly names
- **Avoid technical jargon**: "Guest Network" instead of "VLAN_100"
- **Indicate purpose**: "Printer Access" instead of just "Printers"
- **Use consistent patterns**: All QoS groups end with "Priority"

### **Implementation Tips**

#### **Start Simple**
1. **Begin with Group Types disabled** to maintain current behavior
2. **Plan your group structure** before enabling Group Types
3. **Test with a few groups** before rolling out organization-wide
4. **Train users** on the new assignment behaviors

#### **Gradual Rollout**
1. **Enable Group Types** but keep Self-Service Multi Select disabled initially
2. **Configure group types** for your network groups
3. **Test with administrative users** using Device Management interface
4. **Enable Self-Service Multi Select** once users are comfortable

#### **User Training**
- **Explain the visual indicators**: What the dots mean
- **Demonstrate assignment behavior**: Show how "Move" vs "Add" works
- **Provide examples**: Use scenarios relevant to your organization
- **Create documentation**: Organization-specific group usage guidelines

## 🔧 **Troubleshooting**

### **Common Issues**

#### **Groups Not Showing Type Indicators**
- ✅ **Check**: Group Types are enabled in Global Settings
- ✅ **Verify**: Individual groups have been configured with types
- ✅ **Refresh**: Browser cache may need clearing

#### **Self-Service Users Can't See Multi Select Groups**
- ✅ **Check**: "Enable Self-Service Multi-Select" is turned on
- ✅ **Verify**: Groups are configured as Multi Select type
- ✅ **Confirm**: User has appropriate permissions

#### **Assignment Behavior Not Working as Expected**
- ✅ **Verify**: Group Types are enabled globally
- ✅ **Check**: Groups are configured with correct types (Single vs Multi Select)
- ✅ **Test**: Try with Device Management interface first

### **Getting Help**

If you encounter issues with Group Types:

1. **Check Global Settings**: Ensure Group Types are properly configured
2. **Verify Group Configuration**: Confirm individual groups have correct types assigned
3. **Test Different Interfaces**: Try both Self-Service and Device Management interfaces
4. **Review User Permissions**: Ensure users have appropriate group memberships for device access

## Section Navigation

### Features Documentation
- [📋 Features Overview](./) - Section index and overview
- [🔐 Two-Factor Authentication Guide](./TWO_FACTOR_AUTHENTICATION_GUIDE.md) - 2FA setup and usage
- [📊 Account Activity Dashboard](./ACCOUNT_ACTIVITY_DASHBOARD.md) - User activity monitoring
- [📱 MAC Address Tracking](./MAC_ADDRESS_TRACKING.md) - Device tracking and management
- [🔓 MAC Randomization Guide](./MAC_RANDOMIZATION_GUIDE.md) - Privacy MAC detection and handling
- [🔧 Password Management](./PASSWORD_MANAGEMENT.md) - Password policies and management
- [🔗 Network Group Validation](./NETWORK_GROUP_VALIDATION.md) - Network group safety checks
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

The Group Types feature is designed to provide flexible network group management while maintaining backward compatibility with existing configurations.
