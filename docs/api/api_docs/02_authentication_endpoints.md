# Authentication Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)

## Variables

Replace the following variables in the examples below:

- `{{SERVER_URL}}` - Your server URL (e.g., `https://instrada-ogm.example.com`)
- `{{API_KEY}}` - Your API key for authentication

**Example:**
```bash
# Set variables
SERVER_URL="https://instrada-ogm.example.com"
API_KEY="your-api-key-here"

# Use in curl commands
curl -X GET "${SERVER_URL}/api/auth/check-status" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all authentication-related API endpoints for managing user registration, sessions, password reset, email verification, 2FA, and authentication status.

## User Registration

### POST /api/auth/register

**Description**: Register a new user account with email and password. This endpoint creates a new user account and conditionally sends a verification email based on the `AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL` environment variable.

**Authentication**: Not required (public endpoint)

**Role Access:**
- **Unauthenticated**: ✅ Can register new account

**Configuration:**
- Behavior controlled by `AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL` environment variable
- When `true`: User created with `PENDING` role, verification email sent
- When `false`: User created with `USER` role, no verification required

#### Usage Case 1: Registration with Email Verification Required

**Scenario**: New user registers when `AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL=true`

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecurePassword123",
    "name": "John Doe",
    "username": "johndoe"
  }'
```

**Success Response**:
```json
{
  "id": "user-uuid-123",
  "email": "newuser@example.com",
  "name": "John Doe",
  "username": "johndoe",
  "role": "PENDING",
  "emailVerified": null,
  "createdAt": "2024-01-01T12:00:00Z",
  "requiresVerification": true
}
```

**Notes:**
- User role is `PENDING` until email is verified
- Verification email is sent automatically
- User cannot login until email is verified
- `requiresVerification: true` indicates verification is required

#### Usage Case 2: Registration with Email Verification Disabled

**Scenario**: New user registers when `AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL=false`

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecurePassword123",
    "name": "John Doe",
    "username": "johndoe"
  }'
```

**Success Response**:
```json
{
  "id": "user-uuid-123",
  "email": "newuser@example.com",
  "name": "John Doe",
  "username": "johndoe",
  "role": "USER",
  "emailVerified": "2024-01-01T12:00:00Z",
  "createdAt": "2024-01-01T12:00:00Z",
  "requiresVerification": false
}
```

**Notes:**
- User role is `USER` (active immediately)
- `emailVerified` is set to current timestamp
- No verification email is sent
- User can login immediately
- `requiresVerification: false` indicates no verification needed

#### Usage Case 3: Invalid Email Format

**Error Response** (400 Bad Request):
```json
{
  "message": "Email and password are required"
}
```

#### Usage Case 4: Weak Password

**Error Response** (400 Bad Request):
```json
{
  "message": "Password must be at least 8 characters"
}
```

#### Usage Case 5: Email Already Exists

**Error Response** (409 Conflict):
```json
{
  "message": "User already exists with this email"
}
```

#### Usage Case 6: Username Already Exists

**Error Response** (409 Conflict):
```json
{
  "message": "User already exists with this username"
}
```

#### Usage Case 7: Registration Disabled

**Scenario**: Local registration is disabled via global settings

**Error Response** (403 Forbidden):
```json
{
  "message": "Local user registration is currently disabled"
}
```

**Request Fields**:
- `email` (string, required): User's email address
- `password` (string, required): User's password (minimum length from `AUTH_PASSWORD_MIN_LENGTH`, default: 8)
- `name` (string, required): User's display name
- `username` (string, required): Unique username for login

**Response Fields**:
- `id`: User's unique identifier
- `email`: User's email address
- `name`: User's display name
- `username`: User's username
- `role`: User's role (`PENDING` if verification required, `USER` if not, `SUPER_ADMIN` for first user)
- `emailVerified`: Timestamp when email was verified (null if pending, current date if verification disabled)
- `createdAt`: Account creation timestamp
- `requiresVerification`: Boolean indicating if email verification is required
- Additional user fields (excluding sensitive data like password, totpSecret, backupCodes)

**Security Considerations**:
- Passwords are hashed using bcrypt with 10 salt rounds
- Rate limiting applies to prevent abuse
- Email verification behavior controlled by `AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL` environment variable
- First user automatically receives `SUPER_ADMIN` role
- Subsequent users receive `PENDING` role (if verification required) or `USER` role (if not)
- Username must be unique across all users
- Audit logging for all registration attempts

## Password Reset

### POST /api/auth/password-reset/request

**Description**: Request a password reset for a user account. Sends a password reset email with a secure token to the user's email address.

**Authentication**: Not required (public endpoint)

**Role Access:**
- **Unauthenticated**: ✅ Can request password reset

#### Usage Case 1: Successful Password Reset Request

**Scenario**: User requests password reset for existing email

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/password-reset/request" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

**Success Response**:
```json
{
  "message": "Password reset email sent. Please check your inbox."
}
```

#### Usage Case 2: Email Not Found

**Scenario**: Password reset requested for non-existent email (security: returns same response)

**Success Response**:
```json
{
  "message": "Password reset email sent. Please check your inbox."
}
```

#### Usage Case 3: Invalid Email Format

**Error Response**:
```json
{
  "error": "Invalid email format"
}
```

#### Usage Case 4: Missing Email

**Error Response**:
```json
{
  "error": "Email is required"
}
```

**Request Fields**:
- `email` (string, required): User's email address

**Response Fields**:
- `message`: Status message

**Security Considerations**:
- Always returns success response to prevent email enumeration attacks
- Reset tokens expire after 1 hour
- Rate limiting applies to prevent spam
- Tokens are securely generated and hashed in database

### POST /api/auth/password-reset/confirm

**Description**: Confirm password reset using a valid token and set a new password.

**Authentication**: Not required (public endpoint)

**Role Access:**
- **Unauthenticated**: ✅ Can reset password with valid token

#### Usage Case 1: Successful Password Reset

**Scenario**: User resets password with valid token

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/password-reset/confirm" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "reset-token-12345",
    "newPassword": "NewSecurePassword123"
  }'
```

**Success Response**:
```json
{
  "message": "Password reset successfully"
}
```

#### Usage Case 2: Invalid Token

**Error Response**:
```json
{
  "error": "Invalid or expired password reset token"
}
```

#### Usage Case 3: Weak New Password

**Error Response**:
```json
{
  "error": "Password must be at least 8 characters long"
}
```

#### Usage Case 4: Missing Required Fields

**Error Response**:
```json
{
  "error": "Token and new password are required"
}
```

**Request Fields**:
- `token` (string, required): Password reset token from email
- `newPassword` (string, required): New password (minimum 8 characters)

**Response Fields**:
- `message`: Status message

**Security Considerations**:
- Tokens are single-use and invalidated after use
- Tokens expire after 1 hour
- New passwords are hashed using bcrypt
- Audit logging for all password reset attempts

## Email Verification

### GET /api/auth/verify-email/[token]

**Description**: Verify a user's email address using a verification token sent during registration.

**Authentication**: Not required (public endpoint)

**Role Access:**
- **Unauthenticated**: ✅ Can verify email with valid token

#### Usage Case 1: Successful Email Verification

**Scenario**: User clicks verification link from email

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/verify-email/verification-token-12345"
```

**Success Response**:
```json
{
  "message": "Email verified successfully"
}
```

#### Usage Case 2: Invalid Token

**Error Response**:
```json
{
  "error": "Invalid or expired verification token"
}
```

#### Usage Case 3: Already Verified

**Success Response**:
```json
{
  "message": "Email already verified"
}
```

**Path Parameters**:
- `token` (string, required): Email verification token

**Response Fields**:
- `message`: Status message

**Security Considerations**:
- Tokens expire after 24 hours
- Tokens are single-use
- Verification updates emailVerified timestamp
- Audit logging for all verification attempts

### POST /api/auth/resend-verification

**Description**: Resend email verification for a user account. Sends a new verification email to the user's email address.

**Authentication**: Not required (public endpoint)

**Role Access:**
- **Unauthenticated**: ✅ Can request verification resend

#### Usage Case 1: Successful Verification Resend

**Scenario**: User requests new verification email

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/resend-verification" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

**Success Response**:
```json
{
  "message": "Verification email sent. Please check your inbox."
}
```

#### Usage Case 2: Email Already Verified

**Success Response**:
```json
{
  "message": "Email is already verified"
}
```

#### Usage Case 3: Email Not Found

**Scenario**: Verification requested for non-existent email (security: returns same response)

**Success Response**:
```json
{
  "message": "If the email exists in our system, a verification email has been sent."
}
```

#### Usage Case 4: Invalid Email Format

**Error Response**:
```json
{
  "error": "Invalid email format"
}
```

**Request Fields**:
- `email` (string, required): User's email address

**Response Fields**:
- `message`: Status message

**Security Considerations**:
- Always returns similar response to prevent email enumeration
- Rate limiting applies to prevent spam
- New verification tokens invalidate old ones
- Audit logging for all resend requests

## Role-Based Access Control

**Authentication Required:** Mixed (varies by endpoint)

**Role Requirements:**
- **Unauthenticated**: ✅ Can access registration, password reset, and email verification endpoints
- **USER**: ✅ Can access authentication endpoints
- **ADMIN**: ✅ Can access authentication endpoints
- **SUPER_ADMIN**: ✅ Can access authentication endpoints

**Example Responses:**

**All Roles Success:**
```json
{
  "status": "USER"
}
```

## Authentication Status

### GET /api/auth/check-status

**Description**: Check the authentication status of the current user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can check status
- **ADMIN**: ✅ Can check status
- **SUPER_ADMIN**: ✅ Can check status

#### Usage Case 1: Successful Authentication Check

**Scenario**: Authenticated user checks their status

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/check-status" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "status": "USER"
}
```

**Possible Status Values**:
- `USER`: Regular user role
- `ADMIN`: Administrator role
- `SUPER_ADMIN`: Super administrator role

#### Usage Case 2: Unauthenticated Request

**Scenario**: Request without valid authentication

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/check-status" \
  -H "Content-Type: application/json"
```

**Error Response**:
```json
{
  "status": "UNAUTHENTICATED",
  "error": "Not authenticated"
}
```

#### Usage Case 3: Invalid User Account

**Scenario**: Valid authentication but user not found in database

**Error Response**:
```json
{
  "status": "INVALID_USER"
}
```

#### Usage Case 4: Suspended/Inactive Account

**Scenario**: User account is suspended or pending

**Error Response**:
```json
{
  "status": "UNAUTHENTICATED",
  "error": "User account is not active"
}
```

**Response Fields**:
- `status`: User's role or authentication status
- `error`: Error message (when authentication fails)

## 2FA Status

### GET /api/auth/2fa-status

**Description**: Get the 2FA status for the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can check 2FA status
- **ADMIN**: ✅ Can check 2FA status
- **SUPER_ADMIN**: ✅ Can check 2FA status

#### Usage Case 1: 2FA Enabled User

**Scenario**: User with 2FA fully configured

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/2fa-status" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "is2FAEnabled": true,
  "hasSecret": true,
  "hasBackupCodes": true,
  "backupCodesCount": 10
}
```

#### Usage Case 2: 2FA Disabled User

**Scenario**: User without 2FA configured

**Success Response**:
```json
{
  "is2FAEnabled": false,
  "hasSecret": false,
  "hasBackupCodes": false,
  "backupCodesCount": 0
}
```

#### Usage Case 3: Unauthenticated Request

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "error": "Unauthorized"
}
```

#### Usage Case 4: User Not Found

**Scenario**: Authenticated but user record missing

**Error Response**:
```json
{
  "error": "User not found"
}
```

**Response Fields**:
- `is2FAEnabled`: Whether 2FA is enabled
- `hasSecret`: Whether 2FA secret exists
- `hasBackupCodes`: Whether backup codes exist
- `backupCodesCount`: Number of backup codes remaining

## 2FA Management

### GET /api/auth/2fa

**Description**: Get comprehensive 2FA information for the authenticated user, including status, setup information, and available recovery options.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access 2FA information
- **ADMIN**: ✅ Can access 2FA information
- **SUPER_ADMIN**: ✅ Can access 2FA information

#### Usage Case 1: 2FA Fully Configured

**Scenario**: User with complete 2FA setup

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/2fa" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "isEnabled": true,
  "hasSecret": true,
  "hasBackupCodes": true,
  "backupCodesCount": 8,
  "canSetupBackupCodes": true,
  "lastUsed": "2024-01-01T12:00:00Z",
  "setupDate": "2024-01-01T10:00:00Z"
}
```

#### Usage Case 2: 2FA Not Configured

**Scenario**: User without 2FA setup

**Success Response**:
```json
{
  "isEnabled": false,
  "hasSecret": false,
  "hasBackupCodes": false,
  "backupCodesCount": 0,
  "canSetupBackupCodes": false,
  "lastUsed": null,
  "setupDate": null
}
```

#### Usage Case 3: 2FA Partially Configured

**Scenario**: User with 2FA secret but no backup codes

**Success Response**:
```json
{
  "isEnabled": true,
  "hasSecret": true,
  "hasBackupCodes": false,
  "backupCodesCount": 0,
  "canSetupBackupCodes": true,
  "lastUsed": "2024-01-01T12:00:00Z",
  "setupDate": "2024-01-01T10:00:00Z"
}
```

**Response Fields**:
- `isEnabled`: Whether 2FA is enabled
- `hasSecret`: Whether 2FA secret exists
- `hasBackupCodes`: Whether backup codes exist
- `backupCodesCount`: Number of backup codes remaining
- `canSetupBackupCodes`: Whether user can setup backup codes
- `lastUsed`: Last 2FA verification timestamp
- `setupDate`: When 2FA was initially setup

## 2FA Setup and Management

### POST /api/auth/2fa/setup

**Description**: Initialize 2FA setup by generating a TOTP secret and QR code for the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can setup 2FA
- **ADMIN**: ✅ Can setup 2FA
- **SUPER_ADMIN**: ✅ Can setup 2FA

#### Usage Case 1: Successful 2FA Setup Initialization

**Scenario**: User starts 2FA setup process

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/2fa/setup" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCodeDataURL": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Response Fields**:
- `secret`: TOTP secret for manual entry
- `qrCodeDataURL`: QR code image data URL for authenticator apps

### POST /api/auth/2fa/verify

**Description**: Verify TOTP code and complete 2FA setup. Returns backup codes on successful initial setup.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can verify 2FA setup
- **ADMIN**: ✅ Can verify 2FA setup
- **SUPER_ADMIN**: ✅ Can verify 2FA setup

#### Usage Case 1: Successful Initial 2FA Verification

**Scenario**: User completes 2FA setup with valid TOTP code

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/2fa/verify" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

**Success Response (Initial Setup)**:
```json
{
  "success": true,
  "message": "2FA verification successful",
  "backupCodes": [
    "A1B2C3D4",
    "E5F6G7H8",
    "I9J0K1L2",
    "M3N4O5P6",
    "Q7R8S9T0",
    "U1V2W3X4",
    "Y5Z6A7B8",
    "C9D0E1F2",
    "G3H4I5J6",
    "K7L8M9N0"
  ]
}
```

#### Usage Case 2: Backup Code Verification

**Scenario**: User verifies using a backup code instead of TOTP

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/2fa/verify" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "A1B2C3D4",
    "isBackupCode": true
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "2FA verification successful"
}
```

**Response Fields**:
- `success`: Whether verification was successful
- `message`: Status message
- `backupCodes`: Array of backup codes (only returned during initial setup)

### GET /api/auth/2fa/backup-codes

**Description**: Get backup codes status for the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can check backup codes status
- **ADMIN**: ✅ Can check backup codes status
- **SUPER_ADMIN**: ✅ Can check backup codes status

#### Usage Case 1: Check Backup Codes Status

**Scenario**: User checks remaining backup codes

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/2fa/backup-codes" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "count": 7,
  "hasBackupCodes": true,
  "lowCodesWarning": false
}
```

#### Usage Case 2: Low Backup Codes Warning

**Scenario**: User has 2 or fewer backup codes remaining

**Success Response**:
```json
{
  "count": 2,
  "hasBackupCodes": true,
  "lowCodesWarning": true
}
```

**Response Fields**:
- `count`: Number of backup codes remaining
- `hasBackupCodes`: Whether user has any backup codes
- `lowCodesWarning`: Whether user should regenerate codes (≤2 remaining)

### POST /api/auth/2fa/backup-codes

**Description**: Regenerate backup codes for the authenticated user. Replaces all existing backup codes.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can regenerate backup codes
- **ADMIN**: ✅ Can regenerate backup codes
- **SUPER_ADMIN**: ✅ Can regenerate backup codes

#### Usage Case 1: Successful Backup Codes Regeneration

**Scenario**: User regenerates new backup codes

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/2fa/backup-codes" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "message": "Backup codes regenerated successfully",
  "backupCodes": [
    "X1Y2Z3A4",
    "B5C6D7E8",
    "F9G0H1I2",
    "J3K4L5M6",
    "N7O8P9Q0",
    "R1S2T3U4",
    "V5W6X7Y8",
    "Z9A0B1C2",
    "D3E4F5G6",
    "H7I8J9K0"
  ]
}
```

**Response Fields**:
- `success`: Whether regeneration was successful
- `message`: Status message
- `backupCodes`: Array of new backup codes

### POST /api/auth/2fa/disable

**Description**: Disable 2FA for the authenticated user. Requires TOTP verification.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can disable 2FA
- **ADMIN**: ✅ Can disable 2FA
- **SUPER_ADMIN**: ✅ Can disable 2FA

#### Usage Case 1: Successful 2FA Disable

**Scenario**: User disables 2FA with valid TOTP code

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/2fa/disable" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

**Success Response**:
```json
{
  "success": true,
  "message": "2FA has been disabled successfully"
}
```

**Response Fields**:
- `success`: Whether disable was successful
- `message`: Status message

## Password Change Required

### POST /api/auth/change-password-required

**Description**: Change password for users who are required to change their password. This endpoint is used when a user has `mustChangePassword: true` flag set by an administrator. The user must provide their current password and a new password. The endpoint validates credentials, enforces password policies, and prevents password reuse.

**Authentication**: Not required (uses cookie-based session management with `password_change_email` cookie set by `/api/auth/check-password-change`)

**Request Body**:
```json
{
  "currentPassword": "current-password",
  "newPassword": "new-secure-password"
}
```

**Request Fields**:
- `currentPassword` (string, required): User's current password
- `newPassword` (string, required): New password (must meet minimum length requirements and be different from current password)

**Example Request**:
```bash
curl -X POST "${SERVER_URL}/api/auth/change-password-required" \
  -H "Content-Type: application/json" \
  -H "Cookie: password_change_email=user@example.com" \
  -d '{
    "currentPassword": "oldPassword123",
    "newPassword": "MyNewSecurePassword123"
  }'
```

**Success Response (200)**:
```json
{
  "message": "Password changed successfully"
}
```

**Error Responses**:

**400 - Missing Required Fields**:
```json
{
  "message": "Current password and new password are required"
}
```

**400 - Password Too Short**:
```json
{
  "message": "Password must be at least 8 characters"
}
```

**400 - Same Password (Password Reuse Prevention)**:
```json
{
  "message": "New password must be different from your current password"
}
```

**400 - Invalid Current Password**:
```json
{
  "message": "Current password is incorrect"
}
```

**400 - No Session Cookie**:
```json
{
  "message": "Session expired. Please try logging in again."
}
```

**404 - User Not Found**:
```json
{
  "message": "User not found"
}
```

**500 - Server Error**:
```json
{
  "message": "Failed to change password"
}
```

**Response Fields**:
- `message`: Status message indicating success or failure reason

**Security Features**:
- Cookie-based session management (prevents unauthorized password changes)
- Validates current password before allowing change
- Enforces minimum password length requirements (default: 8 characters, configurable via `AUTH_PASSWORD_MIN_LENGTH`)
- **Password reuse prevention**: New password must be different from current password
- Comprehensive audit logging for all attempts (success and failure)
- Automatically clears `mustChangePassword` flag on successful change
- Updates `passwordChangedAt` timestamp
- Clears session cookie after successful password change

**Database Updates on Success**:
- `password`: Updated to new hashed password (bcrypt with 10 salt rounds)
- `mustChangePassword`: Set to `false`
- `passwordChangedAt`: Set to current timestamp

**Related Flow**:
1. User attempts to login with valid credentials
2. System detects `mustChangePassword: true` flag
3. `/api/auth/check-password-change` endpoint sets `password_change_email` cookie
4. User is redirected to `/auth/change-password-required` page
5. User submits current and new password via this endpoint
6. System validates credentials and password policies
7. Password is updated and user can login with new credentials

**Audit Events**:
- `PASSWORD_CHANGE_ATTEMPT`: When password change is initiated
- `PASSWORD_CHANGE_SUCCESS`: When password is successfully changed
- `PASSWORD_CHANGE_FAILURE`: When password change fails (with reason)

## Authentication Configuration

### GET /api/admin/auth-config

**Description**: Get authentication configuration information for administrative purposes.

**Authentication**: Required (session or API key with ADMIN or SUPER_ADMIN role)

**Role Access:**
- **USER**: ❌ Unauthorized
- **ADMIN**: ✅ Can access config
- **SUPER_ADMIN**: ✅ Can access config

#### Usage Case 1: Successful Admin Access

**Scenario**: Admin user retrieves authentication configuration

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/admin/auth-config" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "providers": {
    "credentials": {
      "id": "credentials",
      "name": "Credentials",
      "type": "credentials",
      "signinUrl": "/auth/signin",
      "callbackUrl": "/auth/signin"
    },
    "authentik": {
      "id": "authentik",
      "name": "Authentik",
      "type": "oauth",
      "signinUrl": "/auth/signin/authentik",
      "callbackUrl": "/auth/callback/authentik"
    }
  },
  "pages": {
    "signIn": "/auth/signin",
    "signOut": "/auth/signout",
    "error": "/auth/error",
    "verifyRequest": "/auth/verify-request"
  },
  "callbacks": {
    "signIn": "/auth/signin",
    "signOut": "/auth/signout"
  }
}
```

#### Usage Case 2: Unauthorized Access (USER)

**Scenario**: USER role attempts to access auth configuration

**Error Response**:
```json
{
  "error": "Forbidden"
}
```

#### Usage Case 3: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "error": "Unauthorized: Authentication required to access auth configuration"
}
```



**Example Response**:
```json
{
  "providers": {
    "credentials": {
      "id": "credentials",
      "name": "Credentials",
      "type": "credentials"
    },
    "authentik": {
      "id": "authentik",
      "name": "Authentik",
      "type": "oauth"
    }
  },
  "isLocalLoginAllowed": true,
  "showRegistrationLink": false
}
```

**Response Fields**:
- `providers`: Available authentication providers
- `isLocalLoginAllowed`: Whether local login is enabled
- `showRegistrationLink`: Whether registration link is shown

## User Profile (Authentication Context)

### GET /api/user/profile

**Description**: Get the authenticated user's profile information.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own profile
- **ADMIN**: ✅ Can access own profile
- **SUPER_ADMIN**: ✅ Can access own profile

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/user/profile" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "id": "user-uuid-1",
  "name": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "USER",
  "emailVerified": "2024-01-01T12:00:00Z",
  "createdAt": "2024-01-01T12:00:00Z",
  "updatedAt": "2024-01-01T12:00:00Z",
  "lastActive": "2024-01-01T13:00:00Z",
  "is2FAEnabled": false,
  "groups": [
    {
      "id": "group-uuid-1",
      "name": "User Group",
      "description": "Regular users"
    }
  ]
}
```

**Response Fields**:
- `id`: Unique user identifier
- `name`: User's display name
- `username`: Username for login
- `email`: User's email address
- `role`: User role (`USER`, `ADMIN`, `SUPER_ADMIN`)
- `emailVerified`: Email verification timestamp
- `createdAt`: Account creation timestamp
- `updatedAt`: Last update timestamp
- `lastActive`: Last activity timestamp
- `is2FAEnabled`: Whether 2FA is enabled
- `groups`: User's group memberships

## Error Responses

### 400 Bad Request

**Missing Required Fields**:
```json
{
  "error": "Email is required"
}
```

**Invalid Token**:
```json
{
  "error": "Token and new password are required"
}
```

**Expired Token**:
```json
{
  "error": "Invalid or expired password reset token"
}
```

**2FA Setup Errors**:
```json
{
  "error": "Token is required"
}
```

**Invalid TOTP Code**:
```json
{
  "error": "Invalid token"
}
```

**Invalid Backup Code**:
```json
{
  "error": "Invalid backup code"
}
```

**2FA Not Enabled**:
```json
{
  "error": "2FA is not enabled"
}
```

**No Backup Codes Available**:
```json
{
  "error": "No backup codes available"
}
```

### 401 Unauthorized

**Not Authenticated**:
```json
{
  "status": "UNAUTHENTICATED",
  "error": "Not authenticated"
}
```

**General Unauthorized**:
```json
{
  "error": "Unauthorized"
}
```

**Invalid API Key**:
```json
{
  "error": "Invalid API key"
}
```

**Account Not Active**:
```json
{
  "status": "UNAUTHENTICATED",
  "error": "User account is not active"
}
```

### 403 Forbidden

**Admin Privileges Required**:
```json
{
  "error": "Forbidden"
}
```

### 404 Not Found

**Invalid User**:
```json
{
  "status": "INVALID_USER"
}
```

**User Not Found**:
```json
{
  "error": "User not found"
}
```

### 429 Too Many Requests

**Rate Limit Exceeded**:
```json
{
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 100,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

### 500 Internal Server Error

**General Server Error**:
```json
{
  "status": "ERROR",
  "message": "Failed to fetch status"
}
```

**2FA Status Check Error**:
```json
{
  "error": "Failed to check 2FA status"
}
```

**Password Reset Error**:
```json
{
  "error": "An error occurred while processing your request."
}
```

## Notes

### Authentication Methods

1. **Session Authentication**: Browser-based authentication using NextAuth.js sessions
2. **API Key Authentication**: Programmatic access using Bearer tokens or X-API-Key headers
3. **Dual Support**: All endpoints support both authentication methods seamlessly

### Security Features

1. **Rate Limiting**: API key requests are subject to configurable rate limits
2. **Account Status Validation**: Suspended and pending accounts are blocked from access
3. **Audit Logging**: All authentication events are logged for security monitoring
4. **2FA Integration**: Two-factor authentication status affects authentication flow
5. **Backup Codes**: Secure backup codes for 2FA recovery when TOTP is unavailable

### 2FA and Backup Codes

1. **TOTP Support**: Time-based One-Time Password authentication using standard authenticator apps
2. **Backup Codes**: 10 single-use backup codes generated during initial 2FA setup
3. **Automatic Detection**: System automatically detects backup codes vs TOTP codes during login
4. **One-Time Use**: Backup codes are consumed after use and cannot be reused
5. **Regeneration**: Users can regenerate all backup codes when needed (invalidates old codes)
6. **Low Codes Warning**: System warns when 2 or fewer backup codes remain
7. **Secure Storage**: Backup codes are securely hashed and stored in the database

### Error Handling

1. **Consistent Format**: All errors follow standard JSON error response format
2. **Security Considerations**: Some endpoints return generic messages to prevent information disclosure
3. **Status Codes**: Appropriate HTTP status codes for different error scenarios
4. **Rate Limit Headers**: Rate limit information included in all responses for monitoring

### Account States

1. **Active**: Normal user accounts with full access
2. **Suspended**: Accounts blocked from access (returns "User account is not active")
3. **Pending**: New accounts awaiting activation (returns "User account is not active")
4. **Invalid**: Authenticated sessions for non-existent users (returns "INVALID_USER")

## Rate Limiting

**Rate Limit Strategy:** Mixed (IP-based for public, User-based for authenticated)

**Default Rate Limits:**
- **Public Endpoints**:
  - Registration: 5 requests per minute per IP
  - Password Reset Request: 3 requests per minute per IP
  - Password Reset Confirm: 5 requests per hour per IP
  - Email Verification: 10 requests per minute per IP
  - Verification Resend: 3 requests per minute per IP
- **Authenticated Endpoints**: 1000 requests per hour per user
- **API Key Endpoints**: Configurable per key (default: 1000/hour)

**Rate Limit Identification:**
- **Public Endpoints**: Identified by IP address
- **Authenticated Endpoints**: Identified by user ID
- **API Key Endpoints**: Identified by API key ID

**Rate Limit Headers:**
All rate limited responses include the following headers:
- `X-RateLimit-Limit`: Maximum requests allowed in current window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when rate limit window resets
- `X-RateLimit-Retry-After`: Seconds until client can retry (only on 429 responses)

**Rate Limit Exceeded Response (429):**
```json
{
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 5,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "minute",
    "retryAfter": 60
  }
}
```

**Endpoint-Specific Rate Limits:**

### Public Endpoints
- **POST /api/auth/register**: 5 requests per minute per IP
  - Prevents automated account creation attacks
  - Window: 1 minute sliding window
  
- **POST /api/auth/password-reset/request**: 3 requests per minute per IP
  - Prevents password reset spam and email enumeration
  - Window: 1 minute sliding window
  
- **POST /api/auth/password-reset/confirm**: 5 requests per hour per IP
  - Prevents brute force password reset attempts
  - Window: 1 hour fixed window
  
- **GET /api/auth/verify-email/[token]**: 10 requests per minute per IP
  - Prevents verification token abuse
  - Window: 1 minute sliding window
  
- **POST /api/auth/resend-verification**: 3 requests per minute per IP
  - Prevents verification email spam
  - Window: 1 minute sliding window

### Authenticated Endpoints
- **GET /api/auth/check-status**: 1000 requests per hour per user
  - Standard authenticated endpoint rate limit
  - Window: 1 hour sliding window
  
- **GET /api/auth/2fa-status**: 1000 requests per hour per user
  - Standard authenticated endpoint rate limit
  - Window: 1 hour sliding window
  
- **GET /api/auth/2fa**: 1000 requests per hour per user
  - Standard authenticated endpoint rate limit
  - Window: 1 hour sliding window
  
- **POST /api/auth/2fa/setup**: 10 requests per hour per user
  - Limited to prevent 2FA setup abuse
  - Window: 1 hour sliding window
  
- **POST /api/auth/2fa/verify**: 20 requests per minute per user
  - Higher limit for legitimate 2FA verification attempts
  - Window: 1 minute sliding window
  
- **GET /api/auth/2fa/backup-codes**: 10 requests per hour per user
  - Limited to prevent backup code enumeration
  - Window: 1 hour sliding window
  
- **POST /api/auth/2fa/backup-codes**: 5 requests per hour per user
  - Limited to prevent backup code regeneration abuse
  - Window: 1 hour sliding window
  
- **POST /api/auth/2fa/disable**: 10 requests per hour per user
  - Limited to prevent 2FA disable abuse
  - Window: 1 hour sliding window

### Admin Endpoints
- **GET /api/admin/auth-config**: 100 requests per hour per user
  - Admin endpoint with stricter rate limit
  - Window: 1 hour sliding window
  - Requires ADMIN or SUPER_ADMIN role

**Best Practices for Handling Rate Limits:**

1. **Monitor Headers**: Always check rate limit headers in API responses
   ```bash
   curl -I -X POST "https://example.com/api/auth/register" \
     -H "Content-Type: application/json"
   ```
   Look for: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

2. **Exponential Backoff**: Implement exponential backoff when receiving 429 responses
   ```javascript
   async function makeRequestWithRetry(url, options, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       const response = await fetch(url, options);
       
       if (response.status === 429) {
         const retryAfter = response.headers.get('X-RateLimit-Retry-After');
         const delay = Math.pow(2, i) * 1000; // Exponential backoff
         
         await new Promise(resolve => setTimeout(resolve, delay));
         continue;
       }
       
       return response;
     }
     throw new Error('Max retries exceeded');
   }
   ```

3. **Respect Retry-After**: Use the `Retry-After` header to determine when to retry
   ```javascript
   const retryAfter = parseInt(response.headers.get('X-RateLimit-Retry-After'));
   setTimeout(() => makeRequest(), retryAfter * 1000);
   ```

4. **Cache Responses**: Cache non-sensitive responses to reduce API calls
   - Cache successful authentication status for short periods
   - Cache 2FA status during user sessions
   - Avoid repeated calls to the same endpoints

5. **Batch Operations**: Use batch endpoints when available to reduce request count
   - While authentication endpoints don't have batch operations, consider combining related operations
   - For example, check 2FA status only once per session

6. **User Feedback**: Provide clear feedback to users about rate limits
   ```javascript
   if (response.status === 429) {
     const rateLimitInfo = await response.json();
     const resetTime = new Date(rateLimitInfo.rateLimitInfo.resetTime * 1000);
     
     showNotification(`Rate limit exceeded. Please try again after ${resetTime.toLocaleString()}`);
   }
   ```

7. **Progressive Delays**: For operations that might hit limits (like 2FA verification)
   ```javascript
   async function verify2FACode(code) {
     // Add small delay before verification to avoid hitting rate limits
     await new Promise(resolve => setTimeout(resolve, 500));
     return makeRequest('/api/auth/2fa/verify', { code });
   }
   ```

8. **Error Handling**: Differentiate between rate limit errors and other errors
   ```javascript
   if (response.status === 429) {
     // Handle rate limit specifically
     handleRateLimitError(response);
   } else if (response.status >= 400) {
     // Handle other API errors
     handleAPIError(response);
   }
   ```

**Security Considerations:**

1. **Public Endpoint Protection**: Stricter limits on public endpoints to prevent abuse
2. **Authentication Bypass Prevention**: Rate limits apply regardless of authentication method
3. **Brute Force Protection**: Lower limits for sensitive operations like password reset
4. **Enumeration Prevention**: Generic error messages combined with rate limiting
5. **Audit Logging**: All rate limit violations are logged for security monitoring

**Rate Limit Reset Behavior:**

1. **Sliding Windows**: Most endpoints use sliding windows for better user experience
2. **Fixed Windows**: Some sensitive operations use fixed windows (password reset)
3. **Independent Counters**: Different endpoint types have independent rate limit counters
4. **Immediate Reset**: Counters reset immediately when window expires
5. **Cumulative Limits**: Multiple rate limit types can apply simultaneously

**Testing Rate Limits:**

Use the `/api/test-rate-limit` endpoint to test current rate limit status:
```bash
curl -X GET "https://example.com/api/test-rate-limit" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

This will return current rate limit information without consuming significant quota.

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🌐 Public Endpoints](01_public_endpoints.md) - Unauthenticated access points
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [👨‍💼 Admin Functions](04_admin_endpoints.md) - Administrative APIs
- [🔒 VPN Management](10_vpn_endpoints.md) - VPN service control
- [📊 Analytics](11_analytics_endpoints.md) - Usage analytics and reporting

---

## Related Documentation

- [📚 Documentation Home](../../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 Configuration](../../CONFIGURATION/) - System configuration

---

## Getting Help

- [📋 Documentation Index](../../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [🔍 API Index](API_Index.md) - Complete API reference
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report API issues

---

**Last Updated**: 2025-11-06 | **API Version**: 1.0 | **Category**: API Documentation