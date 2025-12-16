# Utility Endpoints

[⬆️ Back to API Index](API_Index.md) | [📚 Back to Documentation Home](../../DOCUMENTATION_INDEX.md)


This section covers utility and testing API endpoints for system diagnostics, rate limiting tests, and validation.

## Role-Based Access Control

**Authentication Required:** Yes

**Role Requirements:**
- **USER**: ✅ Can access utility endpoints
- **ADMIN**: ✅ Can access utility endpoints
- **SUPER_ADMIN**: ✅ Can access utility endpoints

**Role Access:**
- **USER**: ✅ Can test rate limits and access utility functions
- **ADMIN**: ✅ Can test rate limits and access utility functions
- **SUPER_ADMIN**: ✅ Can test rate limits and access utility functions

**Example Responses:**

**All Roles Success:**
```json
{
  "message": "Rate limit test successful",
  "user": {
    "id": "user-uuid-1",
    "email": "user@example.com",
    "role": "USER"
  },
  "authMethod": "apiKey",
  "apiKeyId": "key-uuid-1",
  "apiKeyName": "Test API Key",
  "rateLimitInfo": {
    "remaining": 99,
    "reset": "2024-01-01T13:00:00Z"
  }
}
```

## Rate Limit Testing

### GET /api/test-rate-limit

**Description**: Test rate limiting functionality and view current rate limit status.

**Authentication**: Required (session or API key)

**Role Access:**
- **USER**: ✅ Can test rate limits
- **ADMIN**: ✅ Can test rate limits
- **SUPER_ADMIN**: ✅ Can test rate limits

#### Usage Case 1: API Key Rate Limit Test

**Scenario**: Testing API key rate limits and viewing current status

**Example Request**:
```bash
curl -X GET "https://instrada-ogm.example.com/api/test-rate-limit" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json"
```

**Success Response** (API Key Authentication):
```json
{
  "message": "Rate limit test successful",
  "user": {
    "id": "user-uuid-1",
    "email": "user@example.com",
    "role": "USER"
  },
  "authMethod": "apiKey",
  "apiKeyId": "key-uuid-1",
  "apiKeyName": "Test API Key",
  "rateLimitInfo": {
    "allowed": true,
    "limit": 100,
    "remaining": 99,
    "resetTime": 1640995200000,
    "windowType": "hourly"
  }
}
```

#### Usage Case 2: Session Authentication Test

**Scenario**: Testing with session authentication (browser-based)

**Example Request**:
```bash
curl -X GET "https://instrada-ogm.example.com/api/test-rate-limit" \
  -H "Cookie: next-auth.session-token=your-session-token" \
  -H "Content-Type: application/json"
```

**Success Response** (Session Authentication):
```json
{
  "message": "Rate limit test successful",
  "user": {
    "id": "user-uuid-1",
    "email": "user@example.com",
    "role": "ADMIN"
  },
  "authMethod": "session"
}
```

#### Usage Case 3: Rate Limit Exceeded

**Scenario**: API key has exceeded its rate limit

**Error Response**:
```json
{
  "message": "Rate limit exceeded",
  "rateLimitInfo": {
    "allowed": false,
    "limit": 100,
    "remaining": 0,
    "resetTime": 1640995200000,
    "windowType": "hourly"
  }
}
```

**Response Fields**:
- `message`: Success or error message
- `user`: User information (id, email, role)
- `authMethod`: Authentication method used (`session`, `apiKey`)
- `apiKeyId`: API key ID (only present for API key authentication)
- `apiKeyName`: API key name (only present for API key authentication)
- `rateLimitInfo`: Current rate limit status (only present for API key authentication)
  - `allowed`: Whether the request was allowed
  - `limit`: Maximum requests allowed in the window
  - `remaining`: Remaining requests in the current window
  - `resetTime`: Unix timestamp when the window resets
  - `windowType`: Type of rate limit window (`burst`, `hourly`, `daily`, `monthly`)

## Error Responses

### 401 Unauthorized

**Not Authenticated**:
```json
{
  "message": "Not authenticated"
}
```

**Invalid API Key**:
```json
{
  "message": "Invalid API key"
}
```

**Account Not Active**:
```json
{
  "message": "User account is not active"
}
```

### 429 Too Many Requests

**Rate Limit Exceeded**:
```json
{
  "message": "Rate limit exceeded",
  "rateLimitInfo": {
    "allowed": false,
    "limit": 100,
    "remaining": 0,
    "resetTime": 1640995200000,
    "windowType": "hourly"
  }
}
```

### 500 Internal Server Error

**Unexpected Authentication Error**:
```json
{
  "message": "Unexpected authentication error"
}
```

**General Server Error**:
```json
{
  "error": "Rate limit test failed"
}
```

## Notes

### Rate Limiting Behavior

1. **API Key Rate Limits**: API keys have configurable rate limits (burst, hourly, daily, monthly)
2. **Session Authentication**: Session-based requests are not subject to rate limiting
3. **Window Types**: Different rate limit windows apply based on API key configuration
4. **Reset Times**: Rate limits reset at specific intervals based on the window type

### Authentication Methods

1. **API Key Authentication**: Uses Bearer token or X-API-Key header
2. **Session Authentication**: Uses browser session cookies
3. **Rate Limit Information**: Only provided for API key authentication
4. **Audit Logging**: Rate limit violations are logged for security monitoring

### Testing and Monitoring

1. **Rate Limit Testing**: Useful for testing API key rate limit configurations
2. **Status Monitoring**: Can monitor current rate limit status during development
3. **Authentication Validation**: Verifies both session and API key authentication
4. **Error Simulation**: Can be used to test rate limit exceeded scenarios

### Response Variations

1. **API Key Responses**: Include rate limit information and API key details
2. **Session Responses**: Simpler response without rate limit data
3. **Error Responses**: Consistent error format with appropriate HTTP status codes
4. **Audit Trail**: All requests are logged for security and monitoring purposes

## Rate Limiting

**Rate Limit Strategy:** Mixed (User-based for authenticated, API Key-based for API keys)

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

### Rate Limit Testing Endpoints
- **GET /api/test-rate-limit**: 100 requests per hour per user
  - Moderate limit for rate limit testing to prevent abuse
  - Window: 1 hour sliding window

**Best Practices for Handling Rate Limits:**

1. **Monitor Headers**: Always check rate limit headers in API responses
   ```javascript
   const response = await fetch('/api/test-rate-limit', {
     headers: { 'Authorization': `Bearer ${apiKey}` }
   });
   
   const limit = response.headers.get('X-RateLimit-Limit');
   const remaining = response.headers.get('X-RateLimit-Remaining');
   const reset = response.headers.get('X-RateLimit-Reset');
   
   console.log(`Rate limit: ${remaining}/${limit} (resets at ${new Date(reset * 1000)}`);
   ```

2. **Implement Exponential Backoff**: Use exponential backoff when receiving 429 responses
   ```javascript
   async function testRateLimitWithRetry(maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       const response = await fetch('/api/test-rate-limit');
       
       if (response.status === 429) {
         const retryAfter = parseInt(response.headers.get('X-RateLimit-Retry-After'));
         const delay = Math.min(Math.pow(2, i) * 1000, retryAfter * 1000);
         
         await new Promise(resolve => setTimeout(resolve, delay));
         continue;
       }
       
       return response.json();
     }
     throw new Error('Max retries exceeded due to rate limiting');
   }
   ```

3. **Use for Development**: Leverage the test endpoint for development and testing
   ```javascript
   // Test rate limit behavior without affecting production quotas
   async function developmentRateLimitTest() {
     const testResults = [];
     
     // Make multiple requests to test rate limiting
     for (let i = 0; i < 10; i++) {
       const response = await fetch('/api/test-rate-limit');
       const data = await response.json();
       
       testResults.push({
         request: i + 1,
         status: response.status,
         rateLimitInfo: data.rateLimitInfo,
         timestamp: new Date().toISOString()
       });
       
       // Small delay between requests
       await new Promise(resolve => setTimeout(resolve, 100));
     }
     
     return testResults;
   }
   ```

4. **Rate Limit Monitoring**: Implement proactive rate limit monitoring
   ```javascript
   class UtilityRateLimitMonitor {
     constructor() {
       this.testResults = [];
       this.violations = [];
     }
     
     async runRateLimitTest() {
       const startTime = Date.now();
       let requestCount = 0;
       
       try {
         while (requestCount < 20) { // Test with 20 requests
           const response = await fetch('/api/test-rate-limit');
           const data = await response.json();
           
           this.testResults.push({
             requestNumber: ++requestCount,
             status: response.status,
             rateLimitInfo: data.rateLimitInfo,
             timestamp: new Date().toISOString(),
             elapsed: Date.now() - startTime
           });
           
           if (response.status === 429) {
             this.violations.push({
               requestNumber: requestCount,
               rateLimitInfo: data.rateLimitInfo,
               timestamp: new Date().toISOString()
             });
             break;
           }
           
           // Small delay between requests
           await new Promise(resolve => setTimeout(resolve, 200));
         }
       } catch (error) {
         console.error('Rate limit test error:', error);
       }
       
       return this.analyzeResults();
     }
     
     analyzeResults() {
       const totalRequests = this.testResults.length;
       const successfulRequests = this.testResults.filter(r => r.status === 200).length;
       const rateLimitHits = this.testResults.filter(r => r.status === 429).length;
       
       return {
         summary: {
           totalRequests,
           successfulRequests,
           rateLimitHits,
           successRate: ((successfulRequests / totalRequests) * 100).toFixed(2) + '%'
         },
         details: this.testResults,
         violations: this.violations
       };
     }
   }
   
   // Run comprehensive rate limit test
   const monitor = new UtilityRateLimitMonitor();
   const testResults = await monitor.runRateLimitTest();
   console.log('Rate Limit Test Results:', testResults);
   ```

5. **Integration Testing**: Use test endpoint to validate rate limit handling
   ```javascript
   async function validateRateLimitHandling() {
     const testScenarios = [
       { name: 'Normal Usage', requests: 5, delay: 1000 },
       { name: 'Burst Usage', requests: 10, delay: 100 },
       { name: 'Heavy Usage', requests: 50, delay: 50 }
     ];
     
     const results = {};
     
     for (const scenario of testScenarios) {
       console.log(`Testing scenario: ${scenario.name}`);
       
       const scenarioResults = [];
       let rateLimitHit = false;
       
       for (let i = 0; i < scenario.requests; i++) {
         const response = await fetch('/api/test-rate-limit');
         const data = await response.json();
         
         scenarioResults.push({
           request: i + 1,
           status: response.status,
           remaining: data.rateLimitInfo?.remaining || 0
         });
         
         if (response.status === 429) {
           rateLimitHit = true;
           break;
         }
         
         await new Promise(resolve => setTimeout(resolve, scenario.delay));
       }
       
       results[scenario.name] = {
         requestsMade: scenarioResults.length,
         rateLimitHit,
         finalRemaining: scenarioResults[scenarioResults.length - 1]?.remaining || 0
       };
     }
     
     return results;
   }
   ```

6. **Performance Monitoring**: Use test endpoint for performance monitoring
   ```javascript
   class RateLimitPerformanceMonitor {
     constructor(interval = 60000) { // 1 minute default
       this.interval = interval;
       this.metrics = [];
       this.isRunning = false;
     }
     
     start() {
       if (this.isRunning) return;
       
       this.isRunning = true;
       this.monitor();
     }
     
     stop() {
       this.isRunning = false;
     }
     
     async monitor() {
       if (!this.isRunning) return;
       
       try {
         const startTime = performance.now();
         const response = await fetch('/api/test-rate-limit');
         const endTime = performance.now();
         const data = await response.json();
         
         this.metrics.push({
           timestamp: new Date().toISOString(),
           responseTime: endTime - startTime,
           status: response.status,
           rateLimitInfo: data.rateLimitInfo
         });
         
         // Keep only last 100 metrics
         if (this.metrics.length > 100) {
           this.metrics.shift();
         }
       } catch (error) {
         console.error('Performance monitoring error:', error);
       }
       
       setTimeout(() => this.monitor(), this.interval);
     }
     
     getMetrics() {
       return this.metrics;
     }
     
     getAverageResponseTime() {
       if (this.metrics.length === 0) return 0;
       
       const totalTime = this.metrics.reduce((sum, m) => sum + m.responseTime, 0);
       return totalTime / this.metrics.length;
     }
     
     getRateLimitHitRate() {
       if (this.metrics.length === 0) return 0;
       
       const hits = this.metrics.filter(m => m.status === 429).length;
       return (hits / this.metrics.length) * 100;
     }
   }
   
   // Start performance monitoring
   const perfMonitor = new RateLimitPerformanceMonitor(30000); // 30 seconds
   perfMonitor.start();
   ```

7. **Error Handling**: Implement comprehensive error handling for rate limit testing
   ```javascript
   async function safeRateLimitTest(options = {}) {
     const {
       maxRequests = 10,
       requestDelay = 1000,
       timeout = 5000
     } = options;
     
     const results = [];
     let consecutiveFailures = 0;
     const maxConsecutiveFailures = 3;
     
     for (let i = 0; i < maxRequests; i++) {
       try {
         const controller = new AbortController();
         const timeoutId = setTimeout(() => controller.abort(), timeout);
         
         const response = await fetch('/api/test-rate-limit', {
           signal: controller.signal
         });
         
         clearTimeout(timeoutId);
         
         if (response.ok) {
           const data = await response.json();
           results.push({
             request: i + 1,
             success: true,
             status: response.status,
             rateLimitInfo: data.rateLimitInfo
           });
           consecutiveFailures = 0;
         } else {
           results.push({
             request: i + 1,
             success: false,
             status: response.status,
             error: await response.text()
           });
           
           if (response.status === 429) {
             break; // Stop on rate limit hit
           }
           
           consecutiveFailures++;
         }
       } catch (error) {
         results.push({
           request: i + 1,
           success: false,
           error: error.message
         });
         
         consecutiveFailures++;
       }
       
       // Stop if too many consecutive failures
       if (consecutiveFailures >= maxConsecutiveFailures) {
         break;
       }
       
       // Wait before next request
       if (i < maxRequests - 1) {
         await new Promise(resolve => setTimeout(resolve, requestDelay));
       }
     }
     
     return results;
   }
   ```

8. **Rate Limit Analysis**: Analyze rate limit patterns and trends
   ```javascript
   class RateLimitAnalyzer {
     constructor() {
       this.history = [];
     }
     
     addTestResult(testResult) {
       this.history.push({
         ...testResult,
         timestamp: Date.now()
       });
       
       // Keep only last 1000 test results
       if (this.history.length > 1000) {
         this.history.shift();
       }
     }
     
     analyzePatterns() {
       if (this.history.length < 10) {
         return { error: 'Insufficient data for analysis' };
       }
       
       const recentTests = this.history.slice(-100); // Last 100 tests
       const rateLimitHits = recentTests.filter(t => t.status === 429);
       const hitRate = (rateLimitHits.length / recentTests.length) * 100;
       
       // Analyze time patterns
       const hourlyHits = {};
       rateLimitHits.forEach(hit => {
         const hour = new Date(hit.timestamp).getHours();
         hourlyHits[hour] = (hourlyHits[hour] || 0) + 1;
       });
       
       const peakHour = Object.keys(hourlyHits).reduce((a, b) =>
         hourlyHits[a] > hourlyHits[b] ? a : b
       );
       
       return {
         hitRate: hitRate.toFixed(2) + '%',
         totalTests: recentTests.length,
         rateLimitHits: rateLimitHits.length,
         peakHour: parseInt(peakHour),
         peakHourHits: hourlyHits[peakHour],
         recommendations: this.getRecommendations(hitRate, peakHour)
       };
     }
     
     getRecommendations(hitRate, peakHour) {
       const recommendations = [];
       
       if (hitRate > 20) {
         recommendations.push('Consider reducing request frequency to avoid rate limits');
       }
       
       if (hitRate > 50) {
         recommendations.push('Implement proper caching to reduce API calls');
       }
       
       if (peakHour >= 9 && peakHour <= 17) {
         recommendations.push('Consider batching operations during business hours');
       }
       
       return recommendations;
     }
   }
   ```

**Rate Limit Reset Behavior:**

1. **Sliding Windows**: Rate limits use sliding windows for better user experience
2. **Independent Counters**: Each endpoint type has independent rate limit counters
3. **User-Based Limits**: Rate limits are applied per user, not per IP
4. **Immediate Reset**: Counters reset immediately when window expires
5. **Test Isolation**: Test endpoint has separate rate limit from production endpoints

**Testing and Monitoring Use Cases:**

1. **Development Testing**: Test rate limit behavior during development
2. **Performance Monitoring**: Monitor API performance and rate limit hit rates
3. **Load Testing**: Safely test application behavior under load
4. **Integration Testing**: Validate rate limit handling in client applications
5. **Production Monitoring**: Monitor rate limit status in production applications

**Security Considerations:**

1. **Authentication Required**: All utility endpoints require authentication
2. **Audit Logging**: All rate limit test requests are logged
3. **Abuse Prevention**: Rate limits prevent excessive testing
4. **Data Isolation**: Test endpoint doesn't expose sensitive data
5. **Monitoring Integration**: Test results can integrate with monitoring systems

**Advanced Rate Limit Testing:**

For comprehensive rate limit testing, consider these scenarios:

1. **Burst Testing**: Rapid requests to test burst limits
2. **Sustained Testing**: Continuous requests over time to test hourly limits
3. **Concurrent Testing**: Multiple simultaneous requests
4. **Recovery Testing**: Behavior after rate limit reset
5. **Authentication Testing**: Different behavior for session vs API key auth

Use the test endpoint responsibly and only for legitimate testing and monitoring purposes.

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