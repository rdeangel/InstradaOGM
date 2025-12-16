# Password Management Guide

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](./)

## Overview

InstradaOGM provides comprehensive password management features that allow administrators to enforce password security policies and require users to change their passwords when needed. This guide covers password change requirements, password policies, and best practices.

## 🔐 Password Change Requirements

### For Administrators

Administrators can require users to change their passwords on next login. This is useful for:

- **New user accounts** with temporary passwords
- **Security incidents** requiring password resets
- **Compromised credentials** that need immediate change
- **Onboarding processes** where users should set their own passwords

### How to Require Password Change

#### When Creating a New User

1. **Navigate** to Admin → User Management
2. **Click** "Add User" button
3. **Fill in** user details (name, email, username, password, role)
4. **Check** the "Require password change on next login" checkbox
5. **Click** "Add User" to create the account

The user will be forced to change their password when they first log in.

#### When Editing an Existing User

1. **Navigate** to Admin → User Management
2. **Click** the edit icon (pencil) next to the user you want to modify
3. **Check** or **uncheck** the "Require password change on next login" checkbox
4. **Click** "Save Changes"

The user will be required to change their password on their next login attempt.

### User Table Columns

The User Management table displays two password-related columns:

#### Password Change Required Column

Shows whether a user must change their password on next login:

- **Yes** (Red badge) - User must change password on next login
- **No** (Gray badge) - No password change required
- **-** (Dash) - Not applicable (SSO users who authenticate through external providers)

#### Password Changed Column

Shows when the user last changed their password:

- **Timestamp** - Date and time of last password change (e.g., "Jan 15, 2025, 2:30 PM")
- **-** (Dash) - Password has never been changed or password change is required

## 👤 For Users: Changing Your Password

### When Password Change is Required

If an administrator has required you to change your password, you will be automatically redirected to the password change page when you try to log in.

#### Step-by-Step Process

1. **Enter** your username/email and current password on the login page
2. **You will be automatically redirected** to the "Password Change Required" page
3. **Enter** your current password (the one you just used to log in)
4. **Enter** your new password (must meet minimum length requirements)
5. **Confirm** your new password by entering it again
6. **Click** "Change Password"
7. **You will be redirected** to the login page
8. **Log in** with your new password

### Password Requirements

- **Minimum Length**: Passwords must be at least 8 characters (or as configured by your administrator)
- **Confirmation**: New password must match the confirmation field
- **Current Password**: You must provide your current password to change it
- **Different Password**: New password must be different from your current password (password reuse is not allowed)

### Important Notes

- ✅ **One-time process**: After changing your password, you won't be prompted again unless an administrator requires it
- ✅ **Immediate effect**: Your new password is active immediately after changing it
- ✅ **Secure process**: Your current password is verified before allowing the change
- ❌ **Cannot skip**: You cannot log in without changing your password if it's required

## 🔒 SSO Users and Password Management

### What are SSO Users?

SSO (Single Sign-On) users authenticate through external identity providers like:

- Authentik
- Keycloak
- Azure AD / Entra ID
- Other OIDC/OAuth providers

### Password Management for SSO Users

**SSO users do not have local passwords** and manage their passwords through their identity provider.

#### Key Differences

- **No password change checkbox**: The "Require password change on next login" option is not available for SSO users
- **Table shows "-"**: The "Password Change Required" column shows "-" (not applicable) for SSO users
- **No password field**: SSO users cannot set or change passwords in InstradaOGM
- **External management**: Password policies are managed by the SSO provider

#### How SSO Users Change Passwords

SSO users must change their passwords through their identity provider:

1. **Log in** to your organization's identity provider (e.g., Authentik, Keycloak)
2. **Navigate** to your account settings or profile
3. **Change** your password according to your organization's policies
4. **The new password** will automatically work for InstradaOGM on your next login

## 🛡️ Security Best Practices

### For Administrators

1. **Require password changes** for new users with temporary passwords
2. **Monitor** the "Password Changed" column to identify users who haven't updated passwords recently
3. **Use strong temporary passwords** when creating accounts
4. **Communicate** with users when requiring password changes
5. **Consider** implementing regular password rotation policies

### For Users

1. **Use strong, unique passwords** that are difficult to guess
2. **Don't reuse passwords** from other services
3. **Use a password manager** to generate and store complex passwords
4. **Change your password immediately** if you suspect it's been compromised
5. **Enable Two-Factor Authentication (2FA)** for additional security (see [2FA Guide](./TWO_FACTOR_AUTHENTICATION_GUIDE.md))

## 📊 Monitoring Password Security

### For Administrators

The User Management table provides visibility into password security:

#### Identifying Users Who Need Attention

- **Users with "Yes" badge**: Have been flagged to change passwords - ensure they complete the process
- **Users with "-" in Password Changed**: Have never changed their password or are pending password change
- **Recent password changes**: Check the "Password Changed" column to see when users last updated passwords

#### Bulk Operations

While the UI doesn't currently support bulk password change requirements, administrators can:

1. **Edit users individually** to require password changes
2. **Monitor compliance** through the user table
3. **Follow up** with users who haven't changed passwords

## 🔧 Troubleshooting

### User Cannot Change Password

**Problem**: User sees "Session expired. Please try logging in again" error

**Solution**:
1. **Clear browser cookies** and try again
2. **Use a different browser** or incognito/private mode
3. **Contact your administrator** if the issue persists

**Problem**: User sees "Current password is incorrect" error

**Solution**:
1. **Verify** you're entering the correct current password
2. **Check** for caps lock or keyboard layout issues
3. **Use password reset** if you've forgotten your current password

**Problem**: User sees "New password must be different from your current password" error

**Solution**:
1. **Choose a different password** - you cannot reuse your current password
2. **Create a unique password** that you haven't used before
3. **Use a password manager** to generate a strong, unique password

### Administrator Cannot Set Password Change Requirement

**Problem**: Checkbox is not visible when editing a user

**Solution**:
- **Check if the user is an SSO user** - SSO users cannot have password change requirements
- **Verify** you have ADMIN or SUPER_ADMIN role permissions

**Problem**: API returns error when trying to set password change requirement

**Solution**:
- **Ensure the user is not an SSO user** - the system prevents setting password requirements for SSO users
- **Check** that you have appropriate permissions

## 📝 Related Documentation

- **[Two-Factor Authentication Guide](./TWO_FACTOR_AUTHENTICATION_GUIDE.md)** - Add an extra layer of security to your account
- **[API Documentation](../api/api_docs/04_admin_endpoints.md)** - Technical details for user management APIs
- **[SSO Provider Configuration](../CONFIGURATION/SSO_PROVIDER_CONFIG.md)** - Setting up external authentication providers

## 🆘 Getting Help

If you encounter issues with password management:

1. **Check this guide** for common solutions
2. **Review** the troubleshooting section above
3. **Contact your system administrator** for assistance
4. **Check audit logs** (for administrators) to see password change attempts and failures

