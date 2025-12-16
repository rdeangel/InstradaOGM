# 2FA Management Endpoints

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
curl -X GET "${SERVER_URL}/api/auth/2fa/backup-codes" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers 2FA (Two-Factor Authentication) management endpoints for backup codes, password change requirements, and password change verification.

## GET /api/auth/2fa/backup-codes

**Description**: Get backup codes status for the authenticated user. Returns information about the availability and count of backup codes, including warnings when codes are running low.

**Authentication**: Required (session or API key)

**HTTP Methods Supported**: GET

### Usage Case 1: Check Backup Codes Status

**Scenario**: User checks remaining backup codes

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/2fa/backup-codes" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response (200)**:
```json
{
  "count": 7,
  "hasBackupCodes": true,
  "lowCodesWarning": false
}
```

### Usage Case 2: Low Backup Codes Warning

**Scenario**: User has 2 or fewer backup codes remaining

**Success Response (200)**:
```json
{
  "count": 2,
  "hasBackupCodes": true,
  "lowCodesWarning": true
}
```

### Usage Case 3: No Backup Codes

**Scenario**: User has no backup codes configured

**Success Response (200)**:
```json
{
  "count": 0,
  "hasBackupCodes": false,
  "lowCodesWarning": false
}
```

### Usage Case 4: Unauthenticated Request

**Scenario**: Request without valid authentication

**Error Response (401)**:
```json
{
  "error": "Unauthorized: Authentication required"
}
```

### Usage Case 5: User Not Found

**Scenario**: Authenticated but user record missing

**Error Response (404)**:
```json
{
  "error": "User not found"
}
```

**Response Fields**:
- `count` (number): Number of backup codes remaining
- `hasBackupCodes` (boolean): Whether user has any backup codes
- `lowCodesWarning` (boolean): Whether user should regenerate codes (≤2 remaining)

**Request Parameters**: None

**Request Validation**: None required beyond valid authentication

## POST /api/auth/2fa/backup-codes

**Description**: Regenerate backup codes for the authenticated user. Replaces all existing backup codes with a new set of 10 secure backup codes. Invalidates all previously generated backup codes.

**Authentication**: Required (session or API key)

**HTTP Methods Supported**: POST

### Usage Case 1: Successful Backup Codes Regeneration

**Scenario**: User regenerates new backup codes

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/auth/2fa/backup-codes" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response (200)**:
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

### Usage Case 2: Unauthenticated Request

**Scenario**: Request without valid authentication

**Error Response (401)**:
```json
{
  "error": "Unauthorized: Authentication required"
}
```

### Usage Case 3: User Not Found

**Scenario**: Authenticated but user record missing

**Error Response (404)**:
```json
{
  "error": "User not found"
}
```

### Usage Case 4: 2FA Not Enabled

**Scenario**: User attempts to generate backup codes without 2FA enabled

**Error Response (400)**:
```json
{
  "error": "2FA must be enabled before generating backup codes"
}
```

**Request Parameters**: None

**Request Validation**: None required beyond valid authentication and 2FA being enabled

**Response Fields**:
- `success` (boolean): Whether regeneration was successful
- `message` (string): Status message
- `backupCodes` (array): Array of 10 new backup codes (8-character alphanumeric strings)

**Security Considerations**:
- All existing backup codes are invalidated when new codes are generated
- Backup codes are securely hashed before storage in the database
- Each backup code is single-use and cannot be reused
- Backup codes are generated using cryptographically secure random generation
- Audit logging for all backup code regeneration attempts

## GET /api/auth/change-password-required

**Description**: Check if the authenticated user is required to change their password. This endpoint is used to determine if a user has the `mustChangePassword` flag set by an administrator and sets up the necessary session for password change.

**Authentication**: Required (session or API key)

**HTTP Methods Supported**: GET

### Usage Case 1: Password Change Required

**Scenario**: User has `mustChangePassword: true` flag set

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/change-password-required" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response (200)**:
```json
{
  "mustChangePassword": true,
  "message": "Password change required",
  "email": "user@example.com"
}
```

**Response Headers**:
```
Set-Cookie: password_change_email=user@example.com; Path=/; HttpOnly; Secure; SameSite=Strict
```

### Usage Case 2: Password Change Not Required

**Scenario**: User does not have password change requirement

**Success Response (200)**:
```json
{
  "mustChangePassword": false,
  "message": "Password change not required"
}
```

### Usage Case 3: Unauthenticated Request

**Scenario**: Request without valid authentication

**Error Response (401)**:
```json
{
  "error": "Unauthorized: Authentication required"
}
```

### Usage Case 4: User Not Found

**Scenario**: Authenticated but user record missing

**Error Response (404)**:
```json
{
  "error": "User not found"
}
```

**Request Parameters**: None

**Request Validation**: None required beyond valid authentication

**Response Fields**:
- `mustChangePassword` (boolean): Whether user must change password
- `message` (string): Status message
- `email` (string): User's email (only included when password change is required)

**Security Considerations**:
- Sets secure HTTP-only cookie for password change session management
- Cookie is marked with Secure, HttpOnly, and SameSite=Strict flags
- Email is only exposed when password change is required
- Session cookie expires after 1 hour for security
- Audit logging for all password change requirement checks

## GET /api/auth/check-password-change

**Description**: Verify the password change session and validate that the user has proper authorization to change their password. This endpoint validates the session cookie set by `/api/auth/change-password-required` and ensures the user can proceed with password change.

**Authentication**: Not required (uses cookie-based session management with `password_change_email` cookie)

**HTTP Methods Supported**: GET

### Usage Case 1: Valid Password Change Session

**Scenario**: User has valid password change session cookie

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/auth/check-password-change" \
  -H "Content-Type: application/json" \
  -H "Cookie: password_change_email=user@example.com"
```

**Success Response (200)**:
```json
{
  "valid": true,
  "email": "user@example.com",
  "message": "Password change session valid"
}
```

### Usage Case 2: Invalid or Missing Session

**Scenario**: User lacks valid password change session cookie

**Error Response (401)**:
```json
{
  "valid": false,
  "message": "Invalid or expired password change session"
}
```

### Usage Case 3: User Not Found

**Scenario**: Session cookie references non-existent user

**Error Response (404)**:
```json
{
  "valid": false,
  "message": "User not found"
}
```

### Usage Case 4: Password Change Not Required

**Scenario**: User exists but doesn't have `mustChangePassword` flag

**Error Response (403)**:
```json
{
  "valid": false,
  "message": "Password change not required for this user"
}
```

**Request Parameters**: None

**Request Validation**: 
- Requires valid `password_change_email` cookie
- Cookie must contain valid email address
- User must exist in database
- User must have `mustChangePassword: true` flag

**Response Fields**:
- `valid` (boolean): Whether the password change session is valid
- `email` (string): User's email (only included when session is valid)
- `message` (string): Status message

**Security Considerations**:
- Validates session cookie integrity and authenticity
- Prevents unauthorized password changes without proper session
- Automatically invalidates sessions when `mustChangePassword` flag is cleared
- Uses secure cookie validation with cryptographic signature
- Audit logging for all password change session validations
- Sessions expire after 1 hour of inactivity

## Role-Based Access Control

**Authentication Required:** Yes (all endpoints require authentication)

**Role Requirements:**
- **USER**: ✅ Can access all 2FA management endpoints for own account
- **ADMIN**: ✅ Can access all 2FA management endpoints for own account
- **SUPER_ADMIN**: ✅ Can access all 2FA management endpoints for own account

**Role Access:**
- **USER**: ✅ Can manage 2FA backup codes and password change requirements for own account
- **ADMIN**: ✅ Can manage 2FA backup codes and password change requirements for own account
- **SUPER_ADMIN**: ✅ Can manage 2FA backup codes and password change requirements for own account

**Example Responses:**

**All Roles Success (Backup Codes Status)**:
```json
{
  "count": 7,
  "hasBackupCodes": true,
  "lowCodesWarning": false
}
```

**All Roles Success (Backup Codes Regeneration)**:
```json
{
  "success": true,
  "message": "Backup codes regenerated successfully",
  "backupCodes": ["X1Y2Z3A4", "B5C6D7E8", ...]
}
```

**All Roles Success (Password Change Required Check)**:
```json
{
  "mustChangePassword": true,
  "message": "Password change required",
  "email": "user@example.com"
}
```

**Unauthenticated Failure (All Endpoints)**:
```json
{
  "error": "Unauthorized: Authentication required"
}
```

## Rate Limiting

**Rate Limit Strategy:** User-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (all endpoints require authentication)
- **Authenticated Endpoints**: 1000 requests per hour per user
- **API Key Endpoints**: Configurable per key (default: 1000/hour)

**Rate Limit Identification:**
- **Authenticated Endpoints**: Identified by user ID
- **API Key Endpoints**: Identified by API key ID

**Rate Limit Headers:**
All rate limited responses include the following headers:
- `X-RateLimit-Limit`: Maximum requests allowed in the current window
- `X-RateLimit-Remaining`: Remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp when the rate limit window resets
- `X-RateLimit-Retry-After`: Seconds until client can retry (only on 429 responses)

**Rate Limit Exceeded Response (429)**:
```json
{
  "error": "Rate limit exceeded",
  "rateLimitInfo": {
    "limit": 1000,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

**Endpoint-Specific Rate Limits:**

### GET /api/auth/2fa/backup-codes
- **Rate Limit**: 10 requests per hour per user
- **Purpose**: Prevent backup code enumeration attacks
- **Window**: 1 hour sliding window

### POST /api/auth/2fa/backup-codes
- **Rate Limit**: 5 requests per hour per user
- **Purpose**: Prevent backup code regeneration abuse
- **Window**: 1 hour sliding window

### GET /api/auth/change-password-required
- **Rate Limit**: 20 requests per hour per user
- **Purpose**: Prevent password change requirement checking abuse
- **Window**: 1 hour sliding window

### GET /api/auth/check-password-change
- **Rate Limit**: 30 requests per hour per user
- **Purpose**: Prevent password change session validation abuse
- **Window**: 1 hour sliding window

**Best Practices for Handling Rate Limits:**

1. **Monitor Headers**: Always check rate limit headers in API responses
   ```bash
   curl -I -X GET "https://example.com/api/auth/2fa/backup-codes" \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

2. **Exponential Backoff**: Implement exponential backoff when receiving 429 responses
   ```javascript
   async function makeRequestWithRetry(url, options, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       const response = await fetch(url, options);
       
       if (response.status === 429) {
         const retryAfter = response.headers.get('X-RateLimit-Retry-After');
         const delay = Math.pow(2, i) * 1000;
         
         await new Promise(resolve => setTimeout(resolve, delay));
         continue;
       }
       
       return response;
     }
     throw new Error('Max retries exceeded');
   }
   ```

3. **Cache Responses**: Cache backup codes status to reduce API calls
   - Cache backup codes count for short periods (5 minutes)
   - Cache password change requirement status during session
   - Avoid repeated calls to same endpoints

4. **User Feedback**: Provide clear feedback about rate limits
   ```javascript
   if (response.status === 429) {
     const rateLimitInfo = await response.json();
     const resetTime = new Date(rateLimitInfo.rateLimitInfo.resetTime * 1000);
     
     showNotification(`Rate limit exceeded. Please try again after ${resetTime.toLocaleString()}`);
   }
   ```

## Security Considerations

### Backup Codes Security
1. **Secure Generation**: Backup codes are generated using cryptographically secure random number generation
2. **Hashed Storage**: Backup codes are hashed using bcrypt before database storage
3. **Single-Use**: Each backup code can only be used once and is immediately invalidated after use
4. **Code Format**: Backup codes are 8-character alphanumeric strings for easy manual entry
5. **Regeneration**: All existing codes are invalidated when new codes are generated
6. **Low Code Warning**: System warns users when 2 or fewer backup codes remain

### Password Change Security
1. **Session Management**: Password change uses secure HTTP-only cookies for session management
2. **Cookie Security**: Cookies are marked with Secure, HttpOnly, and SameSite=Strict flags
3. **Session Expiration**: Password change sessions expire after 1 hour for security
4. **Email Validation**: Password change sessions are tied to specific user email addresses
5. **Audit Logging**: All password change attempts are logged for security monitoring
6. **Flag Management**: `mustChangePassword` flag is automatically cleared after successful change

### Authentication Security
1. **Required Authentication**: All endpoints require valid authentication (session or API key)
2. **User Validation**: User existence and account status are validated on every request
3. **Account Status**: Suspended or inactive accounts cannot access 2FA management
4. **API Key Support**: Both session-based and API key authentication are supported
5. **Rate Limiting**: Comprehensive rate limiting prevents abuse and brute force attacks

### Data Protection
1. **Minimal Exposure**: Sensitive information is only exposed when necessary
2. **Secure Headers**: All responses include appropriate security headers
3. **Input Validation**: All inputs are validated and sanitized
4. **Error Handling**: Error messages are designed to prevent information disclosure
5. **Audit Trails**: Comprehensive audit logging for all security-relevant operations

## Error Responses

### 400 Bad Request

**2FA Not Enabled**:
```json
{
  "error": "2FA must be enabled before generating backup codes"
}
```

**Invalid Session**:
```json
{
  "valid": false,
  "message": "Invalid or expired password change session"
}
```

**Password Change Not Required**:
```json
{
  "valid": false,
  "message": "Password change not required for this user"
}
```

### 401 Unauthorized

**Missing Authentication**:
```json
{
  "error": "Unauthorized: Authentication required"
}
```

**Invalid API Key**:
```json
{
  "error": "Invalid API key"
}
```

**Expired Session**:
```json
{
  "error": "Session expired. Please authenticate again."
}
```

### 403 Forbidden

**Account Not Active**:
```json
{
  "error": "Account is not active. Please contact administrator."
}
```

### 404 Not Found

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
    "limit": 10,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

### 500 Internal Server Error

**Database Error**:
```json
{
  "error": "Internal server error. Please try again later."
}
```

**Backup Code Generation Error**:
```json
{
  "error": "Failed to generate backup codes. Please try again."
}
```

## Integration Examples

### JavaScript/TypeScript Example

```typescript
// Check backup codes status
async function checkBackupCodesStatus() {
  try {
    const response = await fetch('/api/auth/2fa/backup-codes', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.lowCodesWarning) {
      showWarning('You have 2 or fewer backup codes remaining. Consider regenerating them.');
    }
    
    return data;
  } catch (error) {
    console.error('Error checking backup codes status:', error);
    throw error;
  }
}

// Regenerate backup codes
async function regenerateBackupCodes() {
  try {
    const response = await fetch('/api/auth/2fa/backup-codes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Store backup codes securely
    if (data.success && data.backupCodes) {
      storeBackupCodesSecurely(data.backupCodes);
      showSuccess('New backup codes generated. Store them safely!');
    }
    
    return data;
  } catch (error) {
    console.error('Error regenerating backup codes:', error);
    throw error;
  }
}

// Check if password change is required
async function checkPasswordChangeRequired() {
  try {
    const response = await fetch('/api/auth/change-password-required', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.mustChangePassword) {
      redirectToPasswordChange();
    }
    
    return data;
  } catch (error) {
    console.error('Error checking password change requirement:', error);
    throw error;
  }
}
```

### Python Example

```python
import requests
from typing import Dict, List, Optional

class TwoFactorAuthManager:
    def __init__(self, server_url: str, api_key: str):
        self.server_url = server_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
    
    def check_backup_codes_status(self) -> Dict:
        """Check the status of backup codes."""
        response = requests.get(
            f'{self.server_url}/api/auth/2fa/backup-codes',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def regenerate_backup_codes(self) -> Dict:
        """Regenerate backup codes."""
        response = requests.post(
            f'{self.server_url}/api/auth/2fa/backup-codes',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def check_password_change_required(self) -> Dict:
        """Check if password change is required."""
        response = requests.get(
            f'{self.server_url}/api/auth/change-password-required',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def validate_password_change_session(self, cookies: Dict) -> Dict:
        """Validate password change session."""
        response = requests.get(
            f'{self.server_url}/api/auth/check-password-change',
            headers={'Content-Type': 'application/json'},
            cookies=cookies
        )
        response.raise_for_status()
        return response.json()

# Usage example
if __name__ == "__main__":
    tfam = TwoFactorAuthManager("https://your-server.com", "your-api-key")
    
    # Check backup codes status
    status = tfam.check_backup_codes_status()
    print(f"Backup codes remaining: {status['count']}")
    
    if status['lowCodesWarning']:
        print("Warning: Low backup codes remaining!")
        
        # Regenerate backup codes
        new_codes = tfam.regenerate_backup_codes()
        print(f"Generated {len(new_codes['backupCodes'])} new backup codes")
```

## Testing

### Testing Backup Codes Endpoints

```bash
# Test backup codes status
curl -X GET "https://your-server.com/api/auth/2fa/backup-codes" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Test backup codes regeneration
curl -X POST "https://your-server.com/api/auth/2fa/backup-codes" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Testing Password Change Endpoints

```bash
# Test password change requirement check
curl -X GET "https://your-server.com/api/auth/change-password-required" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Test password change session validation
curl -X GET "https://your-server.com/api/auth/check-password-change" \
  -H "Content-Type: application/json" \
  -H "Cookie: password_change_email=user@example.com"
```

### Testing Rate Limits

```bash
# Test rate limit status
curl -X GET "https://your-server.com/api/test-rate-limit" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Troubleshooting

### Common Issues

1. **Backup Codes Not Working**
   - Ensure 2FA is enabled before generating backup codes
   - Check that backup codes haven't been used already
   - Verify backup codes are entered correctly (case-insensitive)

2. **Password Change Session Issues**
   - Ensure the `password_change_email` cookie is set correctly
   - Check that the session hasn't expired (1-hour timeout)
   - Verify the user has the `mustChangePassword` flag set

3. **Rate Limit Issues**
   - Monitor rate limit headers in API responses
   - Implement exponential backoff for retry logic
   - Cache responses where appropriate to reduce API calls

4. **Authentication Issues**
   - Verify API key is valid and active
   - Check that user account is active and not suspended
   - Ensure proper authorization header format

### Debug Information

Enable debug mode to get more detailed error information:

```bash
curl -X GET "https://your-server.com/api/auth/2fa/backup-codes" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Debug: true"
```

This will include additional debug information in response headers and error messages for troubleshooting purposes.

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [🔐 Security Features](02_authentication_endpoints.md) - Authentication and security
- [📊 Analytics Endpoints](11_analytics_endpoints.md) - Analytics and reporting

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

**Last Updated**: 2025-11-06 | **API Version**: v1.0 | **Category**: API Documentation