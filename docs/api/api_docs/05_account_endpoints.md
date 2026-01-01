# Account Endpoints

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
curl -X GET "${SERVER_URL}/api/account/api-keys" \
  -H "Authorization: Bearer ${API_KEY}"
```

This section covers all account-related API endpoints for managing user accounts, API keys, and account settings.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ✅ Can access own account endpoints
- **ADMIN**: ✅ Can access own account endpoints
- **SUPER_ADMIN**: ✅ Can access own account endpoints

**Role Access:**
- **USER**: ✅ Can access and modify own account information, API keys, and profile settings
- **ADMIN**: ✅ Can access and modify own account information, API keys, and profile settings
- **SUPER_ADMIN**: ✅ Can access and modify own account information, API keys, and profile settings

**Example Responses:**

**All Roles Success:**
```json
{
  "id": "user-uuid-1",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "USER"
}
```

**Unauthenticated Access Failure:**
```json
{
  "message": "Unauthorized"
}
```

## API Key Management

### GET /api/account/api-keys

**Description**: Retrieve all API keys for the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own API keys
- **ADMIN**: ✅ Can access own API keys
- **SUPER_ADMIN**: ✅ Can access own API keys

#### Usage Case 1: Successful API Key Retrieval

**Scenario**: Authenticated user retrieves their API keys

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
[
  {
    "id": "key-uuid-1",
    "name": "Production API Key",
    "createdAt": "2024-01-01T12:00:00Z",
    "lastUsed": "2024-01-01T13:00:00Z",
    "expiresAt": "2024-12-31T23:59:59Z",
    "hourlyLimit": 1000,
    "dailyLimit": 10000,
    "monthlyLimit": 100000,
    "burstLimit": 100,
    "enabled": true
  },
  {
    "id": "key-uuid-2",
    "name": "Development API Key",
    "createdAt": "2024-01-01T10:00:00Z",
    "lastUsed": null,
    "expiresAt": null,
    "hourlyLimit": 100,
    "dailyLimit": 1000,
    "monthlyLimit": 10000,
    "burstLimit": 50,
    "enabled": false
  }
]
```

#### Usage Case 2: No API Keys Found

**Scenario**: User has no API keys created

**Success Response**:
```json
[]
```

#### Usage Case 3: Unauthenticated Access

**Scenario**: Request without valid authentication

**Error Response**:
```json
{
  "message": "Unauthorized"
}
```

#### Usage Case 4: Server Error

**Scenario**: Database error during API key retrieval

**Error Response**:
```json
{
  "message": "Failed to list API keys"
}
```

**Response Fields**:
- `id`: Unique API key identifier
- `name`: API key name
- `key`: API key value (full key)
- `createdAt`: Creation timestamp
- `lastUsed`: Last usage timestamp
- `enabled`: Whether key is enabled
- `hourlyLimit`: Hourly request limit
- `dailyLimit`: Daily request limit
- `monthlyLimit`: Monthly request limit

### POST /api/account/api-keys

**Description**: Create a new API key for the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can create API keys
- **ADMIN**: ✅ Can create API keys
- **SUPER_ADMIN**: ✅ Can create API keys

#### Usage Case 1: Successful API Key Creation

**Scenario**: User creates a new API key with custom limits

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/account/api-keys" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New API Key",
    "hourlyLimit": 500,
    "dailyLimit": 5000,
    "monthlyLimit": 50000,
    "burstLimit": 50,
    "expiresAt": "2024-12-31T23:59:59Z"
  }'
```

**Success Response**:
```json
{
  "id": "key-uuid-3",
  "name": "New API Key",
  "apiKey": "new123key456def789ghi012jkl345mno678pqr901stu234vwx567yz",
  "createdAt": "2024-01-01T14:00:00Z",
  "expiresAt": "2024-12-31T23:59:59Z",
  "hourlyLimit": 500,
  "dailyLimit": 5000,
  "monthlyLimit": 50000,
  "burstLimit": 50,
  "enabled": true
}
```

#### Usage Case 2: API Key Creation with Default Limits

**Scenario**: User creates API key with minimal configuration

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/account/api-keys" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Simple API Key"
  }'
```

**Success Response**:
```json
{
  "id": "key-uuid-4",
  "name": "Simple API Key",
  "apiKey": "simple123key456def789ghi012jkl345mno678pqr901stu234vwx567yz",
  "createdAt": "2024-01-01T14:00:00Z",
  "expiresAt": null,
  "hourlyLimit": 1000,
  "dailyLimit": 10000,
  "monthlyLimit": 100000,
  "burstLimit": 100,
  "enabled": true
}
```

#### Usage Case 3: Invalid API Key Name

**Scenario**: User provides invalid or empty name

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/account/api-keys" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": ""
  }'
```

**Error Response**:
```json
{
  "message": "Valid name is required"
}
```

#### Usage Case 4: Duplicate API Key Name

**Scenario**: User tries to create API key with existing name

**Error Response**:
```json
{
  "message": "API key with this name already exists"
}
```

#### Usage Case 5: Server Error

**Scenario**: Database error during API key creation

**Error Response**:
```json
{
  "message": "Failed to create API key"
}
```

**Required Fields**:
- `name`: API key name

**Optional Fields**:
- `hourlyLimit`: Hourly request limit (default: 1000)
- `dailyLimit`: Daily request limit (default: 10000)
- `monthlyLimit`: Monthly request limit (default: 100000)

### GET /api/account/api-keys/[id]

**Description**: Retrieve a specific API key by ID.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own API keys
- **ADMIN**: ✅ Can access own API keys
- **SUPER_ADMIN**: ✅ Can access own API keys

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/key-uuid-1" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "id": "key-uuid-1",
  "name": "Production API Key",
  "key": "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
  "createdAt": "2024-01-01T12:00:00Z",
  "lastUsed": "2024-01-01T13:00:00Z",
  "enabled": true,
  "hourlyLimit": 1000,
  "dailyLimit": 10000,
  "monthlyLimit": 100000,
  "usage": {
    "currentHour": 45,
    "currentDay": 234,
    "currentMonth": 1542
  }
}
```

**Response Fields**:
- `id`: Unique API key identifier
- `name`: API key name
- `key`: API key value (full key)
- `createdAt`: Creation timestamp
- `lastUsed`: Last usage timestamp
- `enabled`: Whether key is enabled
- `hourlyLimit`: Hourly request limit
- `dailyLimit`: Daily request limit
- `monthlyLimit`: Monthly request limit
- `usage`: Current usage statistics
  - `currentHour`: Requests in current hour
  - `currentDay`: Requests in current day
  - `currentMonth`: Requests in current month

## API Key Usage Statistics

### GET /api/account/api-keys/[id]/usage

**Description**: Get detailed usage statistics for a specific API key.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own API key usage statistics
- **ADMIN**: ✅ Can access own API key usage statistics
- **SUPER_ADMIN**: ✅ Can access own API key usage statistics

**Query Parameters:**
- `includeTrends` (optional): Set to `true` to include usage trends data
- `trendDays` (optional): Number of days for trends (default: 30, max: 90)

#### Usage Case 1: Basic Usage Statistics

**Scenario**: User retrieves usage statistics for their API key

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/key-uuid-1/usage" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "apiKeyId": "key-uuid-1",
    "apiKeyName": "Production API Key",
    "totalRequests": 15420,
    "successfulRequests": 15200,
    "rateLimitHits": 12,
    "usageByPeriod": {
      "hourly": 45,
      "daily": 234,
      "monthly": 1542,
      "burst": 2
    },
    "currentLimits": {
      "hourly": 1000,
      "daily": 10000,
      "monthly": 100000,
      "burst": 100
    },
    "topEndpoints": [
      {
        "endpoint": "/api/vpn/status",
        "count": 8500,
        "percentage": 55.1
      },
      {
        "endpoint": "/api/opnsense/aliases",
        "count": 3200,
        "percentage": 20.8
      },
      {
        "endpoint": "/api/admin/users",
        "count": 2100,
        "percentage": 13.6
      }
    ],
    "lastUsed": "2024-01-15T14:30:00.000Z",
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

#### Usage Case 2: Usage Statistics with Trends

**Scenario**: User retrieves usage statistics with 7-day trends

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/key-uuid-1/usage?includeTrends=true&trendDays=7" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "apiKeyId": "key-uuid-1",
    "apiKeyName": "Production API Key",
    "totalRequests": 15420,
    "successfulRequests": 15200,
    "rateLimitHits": 12,
    "usageByPeriod": {
      "hourly": 45,
      "daily": 234,
      "monthly": 1542,
      "burst": 2
    },
    "currentLimits": {
      "hourly": 1000,
      "daily": 10000,
      "monthly": 100000,
      "burst": 100
    },
    "topEndpoints": [
      {
        "endpoint": "/api/vpn/status",
        "count": 8500,
        "percentage": 55.1
      }
    ],
    "trends": [
      {
        "date": "2024-01-09",
        "requests": 180
      },
      {
        "date": "2024-01-10",
        "requests": 220
      },
      {
        "date": "2024-01-11",
        "requests": 195
      },
      {
        "date": "2024-01-12",
        "requests": 240
      },
      {
        "date": "2024-01-13",
        "requests": 210
      },
      {
        "date": "2024-01-14",
        "requests": 185
      },
      {
        "date": "2024-01-15",
        "requests": 234
      }
    ],
    "lastUsed": "2024-01-15T14:30:00.000Z",
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

#### Usage Case 3: API Key Not Found

**Scenario**: User attempts to access usage statistics for non-existent or unauthorized API key

**Error Response**:
```json
{
  "success": false,
  "message": "API key not found or access denied"
}
```

**Response Fields**:
- `apiKeyId`: Unique API key identifier
- `apiKeyName`: API key name
- `totalRequests`: Total number of requests made with this API key
- `successfulRequests`: Number of successful requests (non-rate-limited)
- `rateLimitHits`: Number of times rate limits were exceeded
- `usageByPeriod`: Current usage in different time windows
  - `hourly`: Requests in current hour
  - `daily`: Requests in current day
  - `monthly`: Requests in current month
  - `burst`: Requests in current minute
- `currentLimits`: Configured rate limits for each time window
- `topEndpoints`: Most frequently accessed endpoints with usage counts and percentages
- `trends` (optional): Daily usage trends when `includeTrends=true`
- `lastUsed`: Timestamp of last API key usage
- `createdAt`: API key creation timestamp

### GET /api/account/api-keys/usage/summary

**Description**: Get usage summary for all API keys belonging to the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own API key usage summary
- **ADMIN**: ✅ Can access own API key usage summary
- **SUPER_ADMIN**: ✅ Can access own API key usage summary

**Query Parameters:**
- `includeDetailedStats` (optional): Set to `true` to include detailed statistics for each API key

#### Usage Case 1: Basic Usage Summary

**Scenario**: User retrieves summary of all their API key usage

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/usage/summary" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalApiKeys": 3,
      "activeApiKeys": 2,
      "totalRequests": 25680,
      "rateLimitViolations": 15,
      "topApiKeys": [
        {
          "id": "key-uuid-1",
          "name": "Production API Key",
          "requests": 15420,
          "lastUsed": "2024-01-15T14:30:00.000Z"
        },
        {
          "id": "key-uuid-2",
          "name": "Development API Key",
          "requests": 8960,
          "lastUsed": "2024-01-15T12:15:00.000Z"
        },
        {
          "id": "key-uuid-3",
          "name": "Testing API Key",
          "requests": 1300,
          "lastUsed": "2024-01-14T16:45:00.000Z"
        }
      ],
      "usageByPeriod": {
        "last24Hours": 450,
        "last7Days": 2100,
        "last30Days": 8500
      }
    }
  }
}
```

#### Usage Case 2: Detailed Usage Summary

**Scenario**: User retrieves detailed summary including statistics for each API key

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/api-keys/usage/summary?includeDetailedStats=true" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalApiKeys": 3,
      "activeApiKeys": 2,
      "totalRequests": 25680,
      "rateLimitViolations": 15,
      "topApiKeys": [
        {
          "id": "key-uuid-1",
          "name": "Production API Key",
          "requests": 15420,
          "lastUsed": "2024-01-15T14:30:00.000Z"
        }
      ],
      "usageByPeriod": {
        "last24Hours": 450,
        "last7Days": 2100,
        "last30Days": 8500
      }
    },
    "detailedStats": [
      {
        "apiKeyId": "key-uuid-1",
        "apiKeyName": "Production API Key",
        "totalRequests": 15420,
        "successfulRequests": 15200,
        "rateLimitHits": 12,
        "usageByPeriod": {
          "hourly": 45,
          "daily": 234,
          "monthly": 1542,
          "burst": 2
        },
        "currentLimits": {
          "hourly": 1000,
          "daily": 10000,
          "monthly": 100000,
          "burst": 100
        },
        "topEndpoints": [
          {
            "endpoint": "/api/vpn/status",
            "count": 8500,
            "percentage": 55.1
          }
        ],
        "lastUsed": "2024-01-15T14:30:00.000Z",
        "createdAt": "2024-01-01T12:00:00.000Z"
      }
    ]
  }
}
```

**Response Fields**:
- `summary`: Overall usage summary
  - `totalApiKeys`: Total number of API keys for the user
  - `activeApiKeys`: Number of enabled API keys
  - `totalRequests`: Combined requests across all API keys
  - `rateLimitViolations`: Total rate limit violations across all keys
  - `topApiKeys`: Top API keys by usage
  - `usageByPeriod`: Usage breakdown by time periods
- `detailedStats` (optional): Detailed statistics for each API key when `includeDetailedStats=true`

### DELETE /api/account/api-keys/[id]

**Description**: Delete an API key.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can delete own API keys
- **ADMIN**: ✅ Can delete own API keys
- **SUPER_ADMIN**: ✅ Can delete own API keys

**Example Request**:
```bash
curl -X DELETE "{{SERVER_URL}}/api/account/api-keys/key-uuid-1" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "success": true,
  "message": "API key deleted successfully"
}
```

## Profile Management

### GET /api/user/profile

**Description**: Retrieve the authenticated user's profile information.

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
  ],
  "preferences": {
    "theme": "dark",
    "notifications": true,
    "language": "en"
  }
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
- `preferences`: User preferences

### PUT /api/user/profile

**Description**: Update the authenticated user's profile information.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can update own profile
- **ADMIN**: ✅ Can update own profile
- **SUPER_ADMIN**: ✅ Can update own profile

#### Usage Case 1: Successful Profile Update

**Scenario**: User updates their profile information

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/user/profile" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "username": "johnsmith",
    "email": "johnsmith@example.com"
  }'
```

**Success Response**:
```json
{
  "id": "user-uuid-1",
  "name": "John Smith",
  "username": "johnsmith",
  "email": "johnsmith@example.com",
  "role": "USER",
  "emailVerified": "2024-01-01T12:00:00Z",
  "createdAt": "2024-01-01T12:00:00Z",
  "lastActive": "2024-01-01T13:00:00Z",
  "is2FAEnabled": false
}
```

#### Usage Case 2: Password Change

**Scenario**: User updates their password

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/user/profile" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "newSecurePassword123"
  }'
```

**Success Response**:
```json
{
  "id": "user-uuid-1",
  "name": "John Smith",
  "username": "johnsmith",
  "email": "johnsmith@example.com",
  "role": "USER",
  "emailVerified": "2024-01-01T12:00:00Z",
  "createdAt": "2024-01-01T12:00:00Z",
  "lastActive": "2024-01-01T13:00:00Z",
  "is2FAEnabled": false
}
```

#### Usage Case 3: External Account Restriction

**Scenario**: External (OIDC) user attempts to update profile

**Error Response**:
```json
{
  "message": "Profile updates are only available for local accounts."
}
```

#### Usage Case 4: Password Too Short

**Scenario**: User provides password shorter than minimum length

**Error Response**:
```json
{
  "message": "Password must be at least 8 characters"
}
```

#### Usage Case 5: Same Password (Password Reuse Prevention)

**Scenario**: User tries to change password to their current password

**Error Response**:
```json
{
  "message": "New password must be different from your current password"
}
```

#### Usage Case 6: Invalid JSON

**Scenario**: Request with malformed JSON

**Error Response**:
```json
{
  "message": "Invalid JSON body"
}
```

#### Usage Case 7: Username Already Taken

**Scenario**: User tries to change to existing username

**Error Response**:
```json
{
  "message": "Username is already taken."
}
```

#### Usage Case 8: Email Already Taken

**Scenario**: User tries to change to existing email

**Error Response**:
```json
{
  "message": "Email address is already in use."
}
```

**Request Fields**:
- `name` (string, optional): User's display name
- `username` (string, optional): Username for login
- `email` (string, optional): User's email address
- `password` (string, optional): New password (must meet minimum length requirements and be different from current password)

**Security Features**:
- Only available for local users (not SSO users)
- Enforces minimum password length (default: 8 characters, configurable via `AUTH_PASSWORD_MIN_LENGTH`)
- **Password reuse prevention**: New password must be different from current password
- Validates username and email uniqueness
- Comprehensive audit logging
- Password hashed with bcrypt (10 salt rounds)

**Audit Events**:
- `USER_PASSWORD_CHANGED`: When password is successfully changed
- `USER_PROFILE_UPDATE_SUCCESS`: When profile fields are successfully updated
- `USER_PROFILE_UPDATE_FAILURE`: When profile update fails (with reason)

### PUT /api/account/update-profile

**Description**: Update the authenticated user's profile information and password. This endpoint validates input and prevents password reuse.

**Authentication**: Required (session or API key)

**Restrictions**:
- Only available for local users (users with passwords)
- SSO users cannot use this endpoint

**Role Access:**
- **USER**: ✅ Can update own profile
- **ADMIN**: ✅ Can update own profile
- **SUPER_ADMIN**: ✅ Can update own profile

**Request Body**:
```json
{
  "name": "John Smith",
  "username": "johnsmith",
  "email": "johnsmith@example.com",
  "password": "newSecurePassword123"
}
```

**Request Fields**:
- `name` (string, optional): User's display name
- `username` (string, optional): Username for login
- `email` (string, optional): User's email address
- `password` (string, optional): New password (must meet minimum length requirements and be different from current password)

**Example Request**:
```bash
curl -X PUT "{{SERVER_URL}}/api/account/update-profile" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "username": "johnsmith",
    "email": "johnsmith@example.com",
    "password": "newSecurePassword123"
  }'
```

**Success Response (200)**:
```json
{
  "id": "user-uuid-1",
  "name": "John Smith",
  "username": "johnsmith",
  "email": "johnsmith@example.com",
  "role": "USER",
  "emailVerified": "2024-01-01T12:00:00Z",
  "createdAt": "2024-01-01T12:00:00Z",
  "lastActive": "2024-01-01T13:00:00Z",
  "is2FAEnabled": false
}
```

**Error Responses**:

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

**400 - Invalid JSON Body**:
```json
{
  "message": "Invalid JSON body"
}
```

**400 - Username Already Taken**:
```json
{
  "message": "Username is already taken."
}
```

**400 - Email Already Taken**:
```json
{
  "message": "Email address is already in use."
}
```

**403 - SSO User**:
```json
{
  "message": "Profile updates are only available for local accounts."
}
```

**500 - Server Error**:
```json
{
  "message": "Failed to update profile"
}
```

**Security Features**:
- Enforces minimum password length (default: 8 characters, configurable via `AUTH_PASSWORD_MIN_LENGTH`)
- **Password reuse prevention**: New password must be different from current password
- Only works for local users (not SSO users)
- Validates username and email uniqueness
- Comprehensive audit logging
- Password hashed with bcrypt (10 salt rounds)

**Audit Events**:
- `USER_PASSWORD_CHANGED`: When password is successfully changed
- `USER_PROFILE_UPDATE_SUCCESS`: When profile fields are successfully updated
- `USER_PROFILE_UPDATE_FAILURE`: When profile update fails (with reason)

## Password Management

### POST /api/account/set-password

**Description**: Set a new password for the authenticated user. This endpoint validates the password meets minimum length requirements and prevents password reuse (new password must be different from current password).

**Authentication**: Required (session or API key)

**Restrictions**:
- Only available for local users (users with passwords)
- SSO users cannot use this endpoint

**Role Access:**
- **USER**: ✅ Can set own password
- **ADMIN**: ✅ Can set own password
- **SUPER_ADMIN**: ✅ Can set own password

**Request Body**:
```json
{
  "password": "newSecurePassword456!"
}
```

**Request Fields**:
- `password` (string, required): New password (must meet minimum length requirements and be different from current password)

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/account/set-password" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "newSecurePassword456!"
  }'
```

**Success Response (200)**:
```json
{
  "message": "Password updated successfully"
}
```

**Error Responses**:

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

**403 - SSO User**:
```json
{
  "message": "Only local users can set password."
}
```

**500 - Server Error**:
```json
{
  "message": "Internal Server Error"
}
```

**Security Features**:
- Enforces minimum password length (default: 8 characters, configurable via `AUTH_PASSWORD_MIN_LENGTH`)
- **Password reuse prevention**: New password must be different from current password
- Only works for local users (not SSO users)
- Comprehensive audit logging
- Password hashed with bcrypt (10 salt rounds)

**Audit Events**:
- `SET_PASSWORD_SUCCESS`: When password is successfully set
- `SET_PASSWORD_FAILURE`: When password set fails (with reason)

## 2FA Management

### POST /api/account/2fa/setup

**Description**: Set up 2FA for the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can set up 2FA
- **ADMIN**: ✅ Can set up 2FA
- **SUPER_ADMIN**: ✅ Can set up 2FA

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/account/2fa/setup" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "backupCodes": [
    "12345678",
    "87654321",
    "11223344",
    "44332211",
    "55667788"
  ]
}
```

**Response Fields**:
- `secret`: 2FA secret key
- `qrCode`: QR code for 2FA app setup
- `backupCodes`: Array of backup codes

### POST /api/account/2fa/verify

**Description**: Verify 2FA setup with a TOTP code.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can verify 2FA
- **ADMIN**: ✅ Can verify 2FA
- **SUPER_ADMIN**: ✅ Can verify 2FA

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/account/2fa/verify" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

**Example Response**:
```json
{
  "success": true,
  "message": "2FA enabled successfully"
}
```

**Required Fields**:
- `code`: TOTP verification code

### POST /api/account/2fa/disable

**Description**: Disable 2FA for the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can disable 2FA
- **ADMIN**: ✅ Can disable 2FA
- **SUPER_ADMIN**: ✅ Can disable 2FA

**Example Request**:
```bash
curl -X POST "{{SERVER_URL}}/api/account/2fa/disable" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

**Example Response**:
```json
{
  "success": true,
  "message": "2FA disabled successfully"
}
```

**Required Fields**:
- `code`: Current TOTP code or backup code

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid password format"
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Invalid 2FA code"
}
```

### 400 Bad Request

**Invalid API Key Name**:
```json
{
  "message": "Valid name is required"
}
```

**Duplicate API Key Name**:
```json
{
  "message": "API key with this name already exists"
}
```

**Password Too Short**:
```json
{
  "message": "Password must be at least 6 characters"
}
```

**Invalid JSON Body**:
```json
{
  "message": "Invalid JSON body"
}
```

**Username Already Taken**:
```json
{
  "message": "Username already taken"
}
```

**Email Already Taken**:
```json
{
  "message": "Email already taken"
}
```

**2FA Already Enabled**:
```json
{
  "error": "2FA is already enabled"
}
```

**Invalid Verification Code**:
```json
{
  "error": "Invalid verification code"
}
```

**Invalid API Key ID**:
```json
{
  "success": false,
  "message": "Valid API key ID parameter is missing"
}
```

### 401 Unauthorized

**Authentication Required**:
```json
{
  "message": "Unauthorized"
}
```

**Unexpected Authentication Error**:
```json
{
  "message": "Unexpected authentication error"
}
```

### 403 Forbidden

**External Account Restriction**:
```json
{
  "message": "Profile updates are only available for local accounts."
}
```

### 404 Not Found

**API Key Not Found**:
```json
{
  "error": "API key not found"
}
```

**API Key Not Owned**:
```json
{
  "success": false,
  "message": "API key not found or does not belong to user"
}
```

**User Not Found**:
```json
{
  "error": "User not found"
}
```

### 500 Internal Server Error

**Profile Update Error**:
```json
{
  "error": "Failed to update profile"
}
```

**API Key Creation Error**:
```json
{
  "message": "Failed to create API key"
}
```

**API Key List Error**:
```json
{
  "message": "Failed to list API keys"
}
```

**API Key Update Error**:
```json
{
  "success": false,
  "message": "Failed to update API key"
}
```

**API Key Deletion Error**:
```json
{
  "success": false,
  "message": "Failed to delete API key"
}
```

**2FA Setup Error**:
```json
{
  "error": "Failed to setup 2FA"
}
```

**2FA Disable Error**:
```json
{
  "error": "Failed to disable 2FA"
}
```

## User Activity Tracking

### GET /api/account/activity-statistics

**Description**: Get comprehensive activity statistics for the authenticated user.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own activity statistics
- **ADMIN**: ✅ Can access own activity statistics
- **SUPER_ADMIN**: ✅ Can access own activity statistics

**Query Parameters:**
- `period` (optional): Time period for statistics ('7', '30', 'all') - default: '30'

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/activity-statistics?period=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "totalActivities": 45,
    "groupAssignments": 12,
    "groupUnassignments": 8,
    "hostCreations": 5,
    "hostRenames": 3,
    "hostDeletions": 2,
    "profileUpdates": 4,
    "loginActivities": 11,
    "mostActiveGroups": [
      {
        "groupName": "Italy - Proton - OV",
        "count": 8
      },
      {
        "groupName": "Brazil Proton - OV",
        "count": 6
      }
    ],
    "period": "30",
    "periodLabel": "Last 30 Days"
  }
}
```

### GET /api/account/recent-activities

**Description**: Get recent activity history for the authenticated user with enhanced descriptions.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can access own recent activities
- **ADMIN**: ✅ Can access own recent activities
- **SUPER_ADMIN**: ✅ Can access own recent activities

**Query Parameters:**
- `limit` (optional): Number of activities to return (default: 20, max: 100)
- `offset` (optional): Number of activities to skip for pagination (default: 0)
- `period` (optional): Time period filter ('7', '30', 'all') - default: '30'

**Example Request**:
```bash
curl -X GET "{{SERVER_URL}}/api/account/recent-activities?limit=10&offset=0&period=30" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -H "Content-Type: application/json"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "activity-uuid-1",
        "action": "OPNSENSE_GROUP_IP_ASSIGN_SUCCESS",
        "details": {
          "hostAliasName": "HOST_192_168_1_61",
          "ipAddress": "192.168.1.61",
          "groupFriendlyName": "Italy - Proton - OV"
        },
        "timestamp": "2024-01-15T14:30:00.000Z",
        "ipAddress": "192.168.1.100",
        "description": "Assigned 192.168.1.61 to 'Italy - Proton - OV'"
      },
      {
        "id": "activity-uuid-2",
        "action": "OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS",
        "details": {
          "hostAliases": [
            {
              "hostAliasName": "HOST_192_168_1_61",
              "ipAddress": "192.168.1.61"
            }
          ],
          "groups": [
            {
              "groupFriendlyName": "Brazil Proton - OV"
            }
          ],
          "removedFromGroups": [
            {
              "groupFriendlyName": "Italy - Proton - OV"
            }
          ]
        },
        "timestamp": "2024-01-15T14:25:00.000Z",
        "ipAddress": "192.168.1.100",
        "description": "Moved 192.168.1.61 from 'Italy - Proton - OV' to 'Brazil Proton - OV'"
      },
      {
        "id": "activity-uuid-3",
        "action": "OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS",
        "details": {
          "hostAliasName": "HOST_192_168_1_61",
          "ipAddress": "192.168.1.61",
          "unassignedGroup": {
            "friendlyName": "Italy - VPS-Aruba - WG"
          }
        },
        "timestamp": "2024-01-15T14:20:00.000Z",
        "ipAddress": "192.168.1.100",
        "description": "Unassigned 192.168.1.61 from 'Italy - VPS-Aruba - WG'"
      }
    ],
    "totalCount": 45,
    "hasMore": true,
    "period": "30"
  }
}
```

**Response Fields**:
- `activities`: Array of activity objects with enhanced descriptions
- `totalCount`: Total number of activities for the user in the specified period
- `hasMore`: Boolean indicating if more activities are available for pagination
- `period`: The time period filter applied
- `description`: Human-readable description showing actual host IP addresses and group names

**Enhanced Activity Descriptions**:
- **Host Assignments**: Shows actual IP addresses instead of generic "1 hosts"
- **Batch Operations**: Displays specific hosts involved in the operation
- **Move Operations**: Shows source and destination groups with host details
- **Host Operations**: Includes specific host information for creations, renames, and deletions

## Notes

### Account Management

1. **Own Account Only**: Users can only access and modify their own account information
2. **Local vs External**: Profile updates are restricted to local accounts (not OIDC users)
3. **Password Security**: Passwords must be at least 6 characters long
4. **Audit Logging**: All account changes are logged for security monitoring

### Activity Tracking

1. **Enhanced Descriptions**: Activity descriptions now show actual host IP addresses and group names
2. **Responsive Layout**: Activity cards adapt to screen size with proper text wrapping
3. **Pagination Support**: Use limit/offset parameters for efficient data loading
4. **Time Period Filtering**: Filter activities by 7 days, 30 days, or all time
5. **Real-time Updates**: Activities appear immediately after user actions

### API Key Management

1. **API Key Security**: API keys are sensitive and should be kept secure
2. **One-Time Display**: API key values are only shown once during creation
3. **Rate Limiting**: API keys have configurable rate limits (burst, hourly, daily, monthly)
4. **Expiration**: API keys can have optional expiration dates
5. **Enable/Disable**: API keys can be temporarily disabled without deletion

### Two-Factor Authentication

1. **2FA Support**: TOTP-based two-factor authentication is available
2. **Setup Process**: 2FA requires verification before activation
3. **Backup Codes**: Backup codes are generated when 2FA is enabled
4. **Security**: 2FA provides additional account security

### Error Handling

1. **Consistent Format**: All errors follow standard JSON error response format
2. **Specific Messages**: Different error messages for different failure scenarios
3. **Status Codes**: Appropriate HTTP status codes for different error types
4. **Security Considerations**: Generic error messages to prevent information disclosure

### Authentication Methods

1. **Session Authentication**: Browser-based authentication using NextAuth.js sessions
2. **API Key Authentication**: Programmatic access using Bearer tokens
3. **Dual Support**: All endpoints support both authentication methods
4. **Rate Limiting**: API key requests are subject to configurable rate limits

## Rate Limiting

**Rate Limit Strategy:** API Key-based

**Default Rate Limits:**
- **Public Endpoints**: N/A (all endpoints require authentication)
- **Authenticated Endpoints**: 1000 requests per hour per user
- **API Key Endpoints**: Configurable per key (default: 1000/hour)

**Rate Limit Identification:**
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
    "limit": 1000,
    "remaining": 0,
    "resetTime": 1640995200,
    "windowType": "hourly",
    "retryAfter": 3600
  }
}
```

**Endpoint-Specific Rate Limits:**

### API Key Management Endpoints
- **GET /api/account/api-keys**: 100 requests per hour per user
  - Standard rate limit for API key listing
  - Window: 1 hour sliding window
  
- **POST /api/account/api-keys**: 20 requests per hour per user
  - Stricter limit for API key creation to prevent abuse
  - Window: 1 hour sliding window
  
- **GET /api/account/api-keys/[id]**: 500 requests per hour per user
  - Higher limit for individual API key retrieval
  - Window: 1 hour sliding window
  
- **DELETE /api/account/api-keys/[id]**: 50 requests per hour per user
  - Limited to prevent accidental or malicious API key deletion
  - Window: 1 hour sliding window

### API Key Usage Statistics Endpoints
- **GET /api/account/api-keys/[id]/usage**: 200 requests per hour per user
  - Moderate limit for usage statistics retrieval
  - Window: 1 hour sliding window
  
- **GET /api/account/api-keys/usage/summary**: 100 requests per hour per user
  - Stricter limit for comprehensive usage summaries
  - Window: 1 hour sliding window

### Profile Management Endpoints
- **GET /api/user/profile**: 1000 requests per hour per user
  - Standard rate limit for profile retrieval
  - Window: 1 hour sliding window
  
- **PUT /api/user/profile**: 100 requests per hour per user
  - Limited to prevent profile update abuse
  - Window: 1 hour sliding window
  
- **PUT /api/account/update-profile**: 100 requests per hour per user
  - Limited to prevent profile update abuse
  - Window: 1 hour sliding window
  
- **POST /api/account/set-password**: 20 requests per hour per user
  - Stricter limit for password changes
  - Window: 1 hour sliding window

### 2FA Management Endpoints
- **POST /api/account/2fa/setup**: 10 requests per hour per user
  - Limited to prevent 2FA setup abuse
  - Window: 1 hour sliding window
  
- **POST /api/account/2fa/verify**: 20 requests per minute per user
  - Higher limit for legitimate 2FA verification attempts
  - Window: 1 minute sliding window
  
- **POST /api/account/2fa/disable**: 10 requests per hour per user
  - Limited to prevent 2FA disable abuse
  - Window: 1 hour sliding window

### Activity Tracking Endpoints
- **GET /api/account/activity-statistics**: 200 requests per hour per user
  - Moderate limit for activity statistics
  - Window: 1 hour sliding window
  
- **GET /api/account/recent-activities**: 300 requests per hour per user
  - Higher limit for recent activity retrieval
  - Window: 1 hour sliding window

**API Key Rate Limit Configuration:**

When creating API keys, you can configure custom rate limits:

```json
{
  "name": "Production API Key",
  "hourlyLimit": 5000,
  "dailyLimit": 50000,
  "monthlyLimit": 1000000,
  "burstLimit": 200
}
```

**Rate Limit Tiers:**
- **Burst Limit**: Requests per minute (short-term spikes)
- **Hourly Limit**: Requests per hour (standard usage)
- **Daily Limit**: Requests per day (daily quota)
- **Monthly Limit**: Requests per month (monthly quota)

**Best Practices for Handling Rate Limits:**

1. **Monitor Headers**: Always check rate limit headers in API responses
   ```javascript
   const response = await fetch('/api/account/api-keys', {
     headers: { 'Authorization': `Bearer ${apiKey}` }
   });
   
   const limit = response.headers.get('X-RateLimit-Limit');
   const remaining = response.headers.get('X-RateLimit-Remaining');
   const reset = response.headers.get('X-RateLimit-Reset');
   
   console.log(`Rate limit: ${remaining}/${limit} (resets at ${new Date(reset * 1000)}`);
   ```

2. **Implement Exponential Backoff**: Use exponential backoff when receiving 429 responses
   ```javascript
   async function makeAPIRequestWithRetry(url, options, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       const response = await fetch(url, options);
       
       if (response.status === 429) {
         const retryAfter = parseInt(response.headers.get('X-RateLimit-Retry-After'));
         const delay = Math.min(Math.pow(2, i) * 1000, retryAfter * 1000);
         
         await new Promise(resolve => setTimeout(resolve, delay));
         continue;
       }
       
       return response;
     }
     throw new Error('Max retries exceeded due to rate limiting');
   }
   ```

3. **Cache API Key Information**: Cache API key data to reduce repeated calls
   ```javascript
   // Cache API keys for 5 minutes
   const cachedKeys = localStorage.getItem('apiKeys');
   const cacheAge = Date.now() - localStorage.getItem('apiKeysCacheTime');
   
   if (cachedKeys && cacheAge < 5 * 60 * 1000) {
     return JSON.parse(cachedKeys);
   }
   
   const response = await fetch('/api/account/api-keys');
   const keys = await response.json();
   
   localStorage.setItem('apiKeys', JSON.stringify(keys));
   localStorage.setItem('apiKeysCacheTime', Date.now());
   
   return keys;
   ```

4. **Batch Operations**: Combine multiple operations when possible
   ```javascript
   // Instead of multiple profile updates, batch them
   const profileUpdates = {
     name: "New Name",
     email: "new@example.com",
     preferences: { theme: "dark" }
   };
   
   await makeAPIRequest('/api/account/update-profile', {
     method: 'PUT',
     body: JSON.stringify(profileUpdates)
   });
   ```

5. **Use Appropriate API Keys**: Configure rate limits based on usage patterns
   ```javascript
   // High-frequency operations (monitoring, analytics)
   const monitoringKey = {
     name: "Monitoring Key",
     hourlyLimit: 10000,
     dailyLimit: 100000
   };
   
   // User operations (profile management)
   const userKey = {
     name: "User Operations Key",
     hourlyLimit: 100,
     dailyLimit: 1000
   };
   ```

6. **Rate Limit Monitoring**: Implement proactive rate limit monitoring
   ```javascript
   class RateLimitMonitor {
     constructor() {
       this.limits = new Map();
     }
     
     updateLimit(endpoint, headers) {
       const limit = headers.get('X-RateLimit-Limit');
       const remaining = headers.get('X-RateLimit-Remaining');
       const reset = headers.get('X-RateLimit-Reset');
       
       this.limits.set(endpoint, {
         limit: parseInt(limit),
         remaining: parseInt(remaining),
         reset: parseInt(reset),
         lastUpdate: Date.now()
       });
       
       // Warn when approaching limit
       if (remaining / limit < 0.2) {
         console.warn(`Rate limit warning for ${endpoint}: ${remaining}/${limit} remaining`);
       }
     }
     
     isNearLimit(endpoint, threshold = 0.2) {
       const limit = this.limits.get(endpoint);
       return limit && (limit.remaining / limit.limit) < threshold;
     }
   }
   ```

7. **Graceful Degradation**: Handle rate limits gracefully in UI
   ```javascript
   async function loadAPIKeys() {
     try {
       const keys = await fetchAPIKeys();
       displayAPIKeys(keys);
     } catch (error) {
       if (error.status === 429) {
         showRateLimitWarning(error.rateLimitInfo);
         // Show cached data if available
         const cachedKeys = getCachedAPIKeys();
         if (cachedKeys) {
           displayAPIKeys(cachedKeys, true); // true indicates cached data
         }
       } else {
         showGenericError(error);
       }
     }
   }
   ```

8. **Optimize API Key Usage**: Use multiple keys for different purposes
   ```javascript
   const apiKeys = {
     monitoring: 'key-for-high-frequency-operations',
     userManagement: 'key-for-user-operations',
     analytics: 'key-for-usage-statistics'
   };
   
   // Use appropriate key based on operation type
   function getAPIKey(operation) {
     return apiKeys[operation] || apiKeys.userManagement;
   }
   ```

**Rate Limit Reset Behavior:**

1. **Independent Counters**: Each API key has independent rate limit counters
2. **Sliding Windows**: Most endpoints use sliding windows for better user experience
3. **Multiple Windows**: Different rate limit types (burst, hourly, daily, monthly) apply simultaneously
4. **Immediate Reset**: Counters reset immediately when window expires
5. **Cumulative Limits**: Multiple rate limit types can apply to the same request

**Security Considerations:**

1. **API Key Isolation**: Each API key has independent rate limits
2. **Sensitive Operation Limits**: Stricter limits for operations like password changes and 2FA management
3. **Audit Logging**: All rate limit violations are logged for security monitoring
4. **Usage Tracking**: API key usage is tracked for security and metering purposes
5. **Key Revocation**: Rate limit violations may trigger API key review

**Testing Rate Limits:**

Use the `/api/test-rate-limit` endpoint to test current rate limit status:
```bash
curl -X GET "https://example.com/api/test-rate-limit" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

This will return current rate limit information without consuming significant quota from your actual API key limits.

---

## API Navigation

### API Documentation
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🔗 Public Endpoints](01_public_endpoints.md) - Public API endpoints
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [👨‍💼 Admin Functions](04_admin_endpoints.md) - Administrative APIs
- [🔧 Settings Endpoints](03_settings_endpoints.md) - Settings management APIs

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

**Last Updated**: 2025-11-06 | **API Version**: v1.0.0 | **Category**: API Documentation