# MAC Address Randomization & DHCP Reservations

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](./)

## Overview

InstradaOGM automatically detects when your device is using MAC address randomization (also called "Private Wi-Fi Address" or "Privacy MAC") and provides helpful warnings when creating DHCP reservations.

## What is MAC Randomization?

MAC address randomization is a privacy feature used by modern devices (iOS, Android, Windows, macOS) to prevent tracking across networks. Instead of using your device's real hardware MAC address, your device generates a random MAC address that may change periodically.

### Why This Matters for DHCP Reservations

When you create a DHCP reservation, it ties a specific IP address to your device's MAC address. If your device is using MAC randomization:

- ⚠️ **The MAC address may change** periodically (daily, weekly, or when reconnecting)
- 🔄 **Your DHCP reservation may stop working** when the MAC changes
- 📱 **Your device may get a different IP address** after the MAC changes
- 🔧 **You may need to recreate the DHCP reservation** with the new MAC address

## How to Identify Randomized MAC Addresses

The system automatically detects randomized MAC addresses by looking at the second character:

**Randomized MACs** (will show warnings):
- `02:11:22:33:44:55` - Common iOS/Android privacy MAC
- `06:aa:bb:cc:dd:ee` - Generic randomized MAC  
- `0a:12:34:56:78:90` - Locally administered MAC
- `0e:ff:ff:ff:ff:ff` - Privacy protection MAC

**Normal MACs** (no warnings):
- `00:11:22:33:44:55` - Manufacturer assigned
- `08:00:27:12:34:56` - VirtualBox MAC
- `bc:24:11:aa:91:97` - Real device MAC

## What You'll See in the Interface

### Warning Dialog
When creating a DHCP reservation with a randomized MAC, you'll see:

```
⚠️ Privacy MAC Address Detected

The MAC address 0a:11:22:33:44:55 appears to be randomized for privacy protection.

DHCP reservations may fail because the device may change its MAC address periodically.

Recommended: Change your device's network settings to use the real hardware MAC 
address instead of a randomized one for this network.
```

### Success Notification with Warning
After successfully creating a DHCP reservation:

```
⚠️ DHCP Reserved with Privacy MAC Warning
Successfully created DHCP reservation. However, this device appears to use MAC 
randomization for privacy. The DHCP reservation will stop working if the MAC address changes.
```

## How to Disable MAC Randomization

If you want reliable DHCP reservations, you can disable MAC randomization for your network:

### iOS/iPhone
1. Go to **Settings** → **Wi-Fi**
2. Tap the **(i)** icon next to your network name
3. Turn off **Private Wi-Fi Address**
4. Reconnect to the network

### Android
1. Go to **Settings** → **Wi-Fi**
2. Tap your network name
3. Tap **Privacy** or **Advanced**
4. Select **Use device MAC** (instead of randomized MAC)
5. Reconnect to the network

### Windows 10/11
1. Go to **Settings** → **Network & Internet** → **Wi-Fi**
2. Click on your network name
3. Under **Properties**, turn off **Random hardware addresses**
4. Reconnect to the network

### macOS
1. Go to **System Preferences** → **Network**
2. Select **Wi-Fi** → **Advanced**
3. Uncheck **Use private Wi-Fi address**
4. Click **OK** and reconnect to the network

## Alternative Solutions

If you prefer to keep MAC randomization enabled for privacy:

### 1. Use Static IP Configuration
Instead of DHCP reservations, configure a static IP directly on your device:
- Choose an IP outside your DHCP range
- Configure it manually in your device's network settings
- This bypasses DHCP entirely

### 2. Accept Periodic Updates
- Keep MAC randomization enabled
- Be prepared to update your DHCP reservation when the MAC changes
- Monitor for connectivity issues and recreate reservations as needed

### 3. Use Network Group Assignment
- Instead of relying on specific IP addresses, use network group assignments
- Network groups work regardless of IP address changes
- More flexible for devices with changing MAC addresses

## Benefits of MAC Randomization Detection

### For Users
- **Proactive Education**: Learn about potential issues before they occur
- **Clear Guidance**: Device-specific instructions for resolution
- **Informed Decisions**: Understand the trade-offs between privacy and network stability

### For Network Reliability
- **Prevent Failed Reservations**: Get warned before creating reservations that might fail
- **Better User Experience**: Reduce confusion about "broken" DHCP reservations
- **Alternative Solutions**: Guidance toward static IP or disabled randomization

## Frequently Asked Questions

### Q: Should I disable MAC randomization?
**A:** It depends on your priorities:
- **Disable** if you need reliable DHCP reservations and don't mind reduced privacy
- **Keep enabled** if privacy is more important and you're okay with occasional network updates

### Q: Will this affect my internet connection?
**A:** MAC randomization itself doesn't affect internet connectivity, but it can cause:
- DHCP reservations to stop working when MAC changes
- Your device to get different IP addresses over time
- Need to update network configurations periodically

### Q: How often do MAC addresses change?
**A:** This varies by device and settings:
- **iOS**: Typically every 24-48 hours or when reconnecting
- **Android**: Varies by manufacturer and Android version
- **Windows/macOS**: Usually when reconnecting to the network

### Q: Can I see my real MAC address?
**A:** Yes, you can find your device's real hardware MAC address in:
- **iOS**: Settings → General → About → Wi-Fi Address
- **Android**: Settings → About Phone → Status → Wi-Fi MAC Address
- **Windows**: Command Prompt → `ipconfig /all`
- **macOS**: System Preferences → Network → Wi-Fi → Advanced → Hardware

## Need Help?

If you're experiencing issues with DHCP reservations or MAC randomization:

1. **Check the warnings** in the interface when creating reservations
2. **Try disabling MAC randomization** for your network following the guides above
3. **Consider alternative solutions** like static IP configuration
4. **Contact your network administrator** if you need assistance with network policies

The system is designed to help you make informed decisions about balancing privacy and network functionality.

---

## Section Navigation

### Features Documentation
- [📋 Features Overview](./) - Section index and overview
- [🔐 Two-Factor Authentication Guide](./TWO_FACTOR_AUTHENTICATION_GUIDE.md) - 2FA setup and usage
- [📊 Account Activity Dashboard](./ACCOUNT_ACTIVITY_DASHBOARD.md) - User activity monitoring
- [📱 MAC Address Tracking](./MAC_ADDRESS_TRACKING.md) - Device tracking and management
- [🔓 MAC Randomization Guide](./) - Current document
- [🔧 Password Management](./PASSWORD_MANAGEMENT.md) - Password policies and management
- [🔗 Network Group Validation](./NETWORK_GROUP_VALIDATION.md) - Network group safety checks
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

**Last Updated**: 2025-11-06 | **Section**: Features | **Category**: User Guide
