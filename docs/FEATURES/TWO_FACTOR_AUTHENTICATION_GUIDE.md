# Two-Factor Authentication (2FA) Guide

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](../FEATURES/)

## Overview

InstradaOGM provides robust two-factor authentication (2FA) to secure your account. This guide covers everything you need to know about setting up, using, and managing 2FA, including backup codes for account recovery.

## 🔐 What is Two-Factor Authentication?

Two-factor authentication adds an extra layer of security to your account by requiring two forms of verification:

1. **Something you know**: Your username and password
2. **Something you have**: Your mobile device with an authenticator app or backup codes

Even if someone obtains your password, they cannot access your account without the second factor.

## 📱 Setting Up 2FA

### Step 1: Enable 2FA

1. **Log in** to your InstradaOGM account
2. **Navigate** to Account Settings → Two-Factor Authentication
3. **Click** "Enable 2FA" button
4. **Scan the QR code** with your authenticator app or manually enter the secret key

### Step 2: Verify Setup

1. **Enter the 6-digit code** from your authenticator app
2. **Click** "Verify and Enable 2FA"
3. **Save your backup codes** (displayed immediately after verification)

### Recommended Authenticator Apps

- **Google Authenticator** (iOS/Android)
- **Microsoft Authenticator** (iOS/Android)
- **Authy** (iOS/Android/Desktop)
- **1Password** (with TOTP support)
- **Bitwarden** (with TOTP support)

## 🔑 Backup Codes

### What are Backup Codes?

Backup codes are single-use recovery codes that allow you to access your account when you cannot use your authenticator app. Each account receives **10 backup codes** when 2FA is first enabled.

### When to Use Backup Codes

- **Lost or broken phone** with your authenticator app
- **Traveling without your device** that has the authenticator app
- **Authenticator app issues** or device problems
- **Emergency access** when TOTP is unavailable

### Important Backup Code Rules

- ✅ **Single Use**: Each backup code can only be used once
- ✅ **Case Insensitive**: Codes work in uppercase or lowercase
- ✅ **8 Characters**: Each code is exactly 8 alphanumeric characters
- ❌ **No Reuse**: Used codes are permanently invalidated
- ❌ **No Sharing**: Never share backup codes with others

## 🔓 Logging In with 2FA

### Using Your Authenticator App (Recommended)

1. **Enter** your username and password
2. **When prompted for 2FA**, enter the 6-digit code from your authenticator app
3. **Click** "Verify" to complete login

### Using Backup Codes

1. **Enter** your username and password
2. **Click** "Use backup code instead" on the 2FA prompt
3. **Enter** one of your backup codes (8 characters)
4. **Click** "Verify" to complete login

**Note**: The backup code will be consumed and cannot be used again.

## ⚙️ Managing Your 2FA Settings

### Viewing Backup Codes Status

1. **Go to** Account Settings → Two-Factor Authentication
2. **Check** the backup codes section to see:
   - Number of backup codes remaining
   - Low codes warning (when ≤2 codes remain)

### Regenerating Backup Codes

**When to Regenerate:**
- You have 2 or fewer backup codes remaining
- You suspect your backup codes may be compromised
- You want fresh codes for security reasons

**How to Regenerate:**
1. **Go to** Account Settings → Two-Factor Authentication
2. **Click** "Regenerate Codes" button
3. **Save the new codes** immediately (old codes are invalidated)
4. **Store securely** in your password manager or secure location

### Disabling 2FA

**⚠️ Warning**: Disabling 2FA reduces your account security.

1. **Go to** Account Settings → Two-Factor Authentication
2. **Click** "Disable 2FA" button
3. **Enter** a current TOTP code from your authenticator app
4. **Confirm** the action

## 🔒 Best Practices for Backup Codes

### Secure Storage

- **✅ Password Manager**: Store in your password manager (recommended)
- **✅ Encrypted File**: Save in an encrypted document
- **✅ Physical Copy**: Write down and store in a secure location
- **❌ Plain Text**: Never store in unencrypted files or emails
- **❌ Screenshots**: Avoid storing as images on your device

### Access Management

- **Keep Multiple Copies**: Store in 2-3 secure locations
- **Regular Review**: Check your backup codes periodically
- **Update After Use**: Regenerate codes when you have few remaining
- **Emergency Planning**: Ensure trusted family members know where codes are stored

## 🚨 Troubleshooting

### "Invalid Code" Errors

**For TOTP Codes:**
- Ensure your device's time is synchronized
- Try the next code if the current one expires
- Check that you're using the correct account in your authenticator app

**For Backup Codes:**
- Verify you're entering the code exactly as shown
- Ensure you haven't used this backup code before
- Try a different backup code if available

### Lost Access to Both TOTP and Backup Codes

If you lose access to both your authenticator app and backup codes:

1. **Contact your administrator** if you're in a managed environment
2. **Use account recovery options** if available
3. **Create a new account** as a last resort (you'll lose access to your current account)

### Low Backup Codes Warning

When you see the warning "You have 2 backup codes remaining":

1. **Regenerate codes immediately** to get 10 new codes
2. **Save the new codes** in multiple secure locations
3. **Test one code** to ensure they work (optional, but recommended)

## 🔧 Technical Details

### Code Format

- **TOTP Codes**: 6 digits (e.g., `123456`)
- **Backup Codes**: 8 alphanumeric characters (e.g., `A1B2C3D4`)

### Security Features

- **Automatic Detection**: System automatically identifies backup codes vs TOTP codes
- **One-Time Use**: Backup codes are immediately invalidated after use
- **Secure Storage**: Codes are encrypted in the database
- **Audit Logging**: All 2FA events are logged for security monitoring

### Rate Limiting

- **Failed Attempts**: Multiple failed 2FA attempts may temporarily lock your account
- **Backup Code Usage**: No special rate limiting for backup codes
- **TOTP Verification**: Standard rate limiting applies to TOTP attempts

## 📞 Getting Help

If you need assistance with 2FA:

1. **Check this guide** for common solutions
2. **Contact your administrator** for account-specific issues
3. **Review audit logs** if you have admin access
4. **Create a support ticket** for technical problems

Remember: **Never share your backup codes or TOTP secrets with anyone**. Legitimate support staff will never ask for these credentials.

---

## Section Navigation

### Features Documentation
- [📋 Features Overview](../FEATURES/) - Section index and overview
- [🔗 Related Document 1](../FEATURES/MAC_ADDRESS_TRACKING.md) - MAC address tracking and management
- [🔗 Related Document 2](../FEATURES/ACCOUNT_ACTIVITY_DASHBOARD.md) - Account activity monitoring

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

**Last Updated**: 2025-11-06 | **Section**: Features | **Category**: Security
