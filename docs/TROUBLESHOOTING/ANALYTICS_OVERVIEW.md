# Analytics & Monitoring Overview

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Troubleshooting](./)

---

## Introduction
The InstradaOGM provides comprehensive analytics and monitoring capabilities that give users and administrators deep insights into system usage, performance, and activity patterns. This document provides a high-level overview of all analytics features.

---

## 🎯 Key Features

### 📊 **API Key Usage Analytics**
Track and analyze API key consumption patterns with detailed statistics and trends.

**User Features:**
- Individual API key usage statistics
- Historical trends (up to 90 days)
- Rate limit monitoring with visual indicators
- Top endpoints analysis
- Usage summary across all API keys

**Admin Features:**
- System-wide usage overview
- Top users by API consumption
- Most active API keys
- Popular endpoints analysis
- Usage trends and forecasting

### ⚡ **Real-time Monitoring**
Live system monitoring with 5-second updates showing current activity and performance.

**Capabilities:**
- Active user tracking
- Requests per second monitoring
- Real-time response time metrics
- Live error rate tracking
- Recent activity feed
- System health indicators

### 📈 **Performance Analytics**
Comprehensive performance analysis with advanced metrics and historical data.

**Metrics:**
- Average, P95, and P99 response times
- Throughput analysis
- Error rate tracking
- Endpoint performance comparison
- Time series data for trend analysis
- Performance bottleneck identification

### 🔍 **Session Analytics**
Track and analyze web UI usage patterns and user session behavior.

**Capabilities:**
- Page view tracking and analysis
- UI interaction monitoring (clicks, form submissions)
- Session duration and activity patterns
- User engagement metrics
- Cross-session activity correlation
- Personal and system-wide session insights

### 📊 **Audit Log Analytics**
Advanced analytics for system operations and security events.

**Features:**
- **Advanced Search**: OR logic support (`|` operator), multi-value field filtering
- **Group Change Analytics**: Track host alias assignments, unassignments, and moves
- **Host Alias Analytics**: Monitor host alias creation, modification, and deletion
- **Operation Success Rates**: Analyze success/failure patterns
- **User Activity Patterns**: Identify top users and activity trends
- **Batch Operation Tracking**: Monitor bulk operations and their impact
- **Data Export**: Export logs in CSV or JSON format with customizable scope
- **Quick Filters**: Exclude ATTEMPT actions, filter by specific fields

---

## 🔐 Access Control

### User Access
- **Authentication**: Valid session or API key required
- **Scope**: Users can only access their own analytics data
- **Features**: Personal API key statistics, usage trends, rate limit monitoring

### Admin Access
- **Authentication**: ADMIN or SUPER_ADMIN role required
- **Scope**: System-wide analytics and monitoring
- **Features**: All user features plus system overview, performance analytics, real-time monitoring

---

## 📱 User Interface

### Analytics Dashboard
Access analytics through the **Monitoring & Analytics** section with tabbed interface:

1. **Audit Logs** - System activity and security events
2. **API Key Usage** - Personal and system-wide usage statistics (SUPER_ADMIN only)
3. **Session Analytics** - Web UI usage tracking and session analytics (ADMIN+)
4. **Combined Analytics** - Unified API key and session analytics (ADMIN+)
5. **Performance Analytics** - System performance metrics (ADMIN+)
6. **Real-time Monitor** - Live system monitoring (ADMIN+)
7. **Audit Analytics** - Group and host alias change analytics (ADMIN+)
8. **Audit Log Management** - Log management tools (SUPER_ADMIN only)

### Key UI Features
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Interactive Charts**: Visual representation of trends and metrics
- **Real-time Updates**: Live data refresh for monitoring
- **Export Capabilities**: Data export for external analysis
- **Configurable Time Ranges**: Custom date ranges for historical analysis

---

## 🔌 API Integration

### REST API Endpoints
All analytics features are available through comprehensive REST APIs:

**User Endpoints (8 endpoints):**
- API key usage statistics
- Detailed analytics with daily breakdowns
- Usage summaries and trends
- Personal session analytics

**Admin Endpoints (12 endpoints):**
- System-wide usage overview
- Performance analytics
- Real-time monitoring data
- User-specific analytics
- Usage trends analysis
- System-wide session analytics
- Combined API key + session analytics
- Group change analytics
- Host alias change analytics

### Authentication Methods
- **Session-based**: Web browser authentication
- **API Key**: Programmatic access with usage tracking
- **Bearer Token**: JWT token authentication

---

## 📊 Data Types & Metrics

### Usage Statistics
- **Request Counts**: Total, successful, failed requests
- **Rate Limits**: Current usage vs. limits across time windows
- **Violations**: Rate limit violation tracking
- **Endpoints**: Most popular endpoints with usage percentages
- **Trends**: Historical usage patterns and growth

### Performance Metrics
- **Response Times**: Average, P95, P99 percentiles
- **Throughput**: Requests per second
- **Error Rates**: Percentage of failed requests
- **Availability**: System uptime and health
- **Bottlenecks**: Slowest endpoints and performance issues

### Real-time Data
- **Active Users**: Currently active system users
- **Live Metrics**: Current throughput and response times
- **Recent Activity**: Latest API requests and system events
- **System Status**: Real-time health indicators

---

## 🛠️ Technical Implementation

### Data Storage
- **Usage Events**: Detailed event tracking in `ApiKeyUsageEvent` table
- **Daily Aggregation**: Summarized statistics in `ApiKeyUsageStats` table
- **Audit Logs**: Comprehensive activity logging in `AuditLog` table
- **Real-time Cache**: In-memory storage for live monitoring data

### Performance Optimization
- **Efficient Queries**: Optimized database queries with proper indexing
- **Data Aggregation**: Pre-computed daily statistics for fast retrieval
- **Caching**: Strategic caching for frequently accessed data
- **Pagination**: Efficient data pagination for large datasets

### Security & Privacy
- **Role-based Access**: Strict permission controls
- **Data Isolation**: Users can only access their own data
- **Audit Logging**: All analytics operations are logged
- **Rate Limiting**: Protection against abuse

---

## 📈 Use Cases

### For Individual Users
- **Monitor API Usage**: Track personal API key consumption
- **Optimize Applications**: Identify high-usage endpoints
- **Rate Limit Management**: Stay within usage limits
- **Troubleshooting**: Analyze failed requests and errors

### For Administrators
- **System Monitoring**: Track overall system health and performance
- **Capacity Planning**: Analyze usage trends for scaling decisions
- **User Management**: Identify heavy users and usage patterns
- **Performance Optimization**: Find and fix performance bottlenecks
- **Security Monitoring**: Track suspicious activity and errors

### For Developers
- **API Integration**: Programmatic access to analytics data
- **Custom Dashboards**: Build custom monitoring solutions
- **Automated Alerts**: Set up usage and performance alerts
- **Data Export**: Extract data for external analysis tools

---

## 🚀 Getting Started

### For Users
1. **Access Analytics**: Navigate to "Monitoring & Analytics" in the main menu
2. **View Usage**: Check "API Key Usage" tab for personal statistics
3. **Monitor Trends**: Enable trends to see historical patterns
4. **Set Alerts**: Monitor rate limit usage to avoid violations

### For Administrators
1. **Enable Admin Features**: Ensure ADMIN or SUPER_ADMIN role
2. **System Overview**: Check system-wide usage in "API Key Usage" tab
3. **Performance Monitoring**: Use "Performance Analytics" for system health
4. **Real-time Monitoring**: Enable "Real-time Monitor" for live tracking

### For Developers
1. **API Documentation**: Review [Analytics API Documentation](../api/api_docs/11_analytics_endpoints.md)
2. **Authentication**: Set up API keys or session authentication
3. **Integration**: Implement analytics API calls in your applications
4. **Testing**: Use provided curl examples to test endpoints

---

## 📚 Related Documentation

### Comprehensive Guides
- **[Analytics & Monitoring API Documentation](../api/api_docs/11_analytics_endpoints.md)** - Complete API reference
- **[Analytics API Endpoints](../api/api_docs/11_analytics_endpoints.md)** - Detailed endpoint documentation
- **[API Documentation Overview](../api/api_docs/API_Index.md)** - Complete API documentation index

### Feature Documentation
- **[API Key Management](../api/api_docs/API_Index.md)** - API key creation and management
- **[Audit Logging](../api/api_docs/API_Index.md)** - Audit log features
- **[Rate Limiting](../api/api_docs/API_Index.md)** - Rate limiting implementation

### Setup Guides
- **[Installation Guide](../SETUP/INSTALLATION_GUIDE.md)** - System setup and configuration
- **[Database Configuration](../CONFIGURATION/PRISMA_MIGRATION_GUIDE.md)** - Database setup

---

## 🔧 Configuration

### Analytics Settings
Analytics features are enabled by default but can be configured:

- **Enable/Disable**: Toggling "Advanced Analytics" in Global Settings completely starts or stops the background `UsageAggregationService`. When disabled, the service consumes zero CPU resources and skips all tracking logic.
- **Data Retention**: Configure how long usage data is retained (1-365 days, default: 90 days)
- **Automated Cleanup**: Daily cleanup at 2:00 AM removes old logs and analytics data
- **Rate Limits**: Set rate limits for analytics API endpoints
- **Real-time Updates**: Configure update frequency for live monitoring
- **Export Options**: Enable/disable data export capabilities

### Performance Tuning
- **Database Indexing**: Ensure proper indexes for analytics queries
- **Caching Strategy**: Configure caching for frequently accessed data
- **Aggregation Schedule**: Set up automated daily aggregation jobs
- **Automated Cleanup**: Built-in cleanup service runs daily at 2:00 AM
  - Removes audit logs, API key usage events/stats, session usage events/stats
  - Configurable retention period (1-365 days) via Global Settings
  - Independent of analytics enable/disable state
  - Transaction-safe operations with comprehensive logging

---

## 🆘 Troubleshooting

### Common Issues
- **No Data Available**: Ensure API keys have been used recently
- **Performance Issues**: Check database indexes and query optimization
- **Access Denied**: Verify user roles and permissions
- **Real-time Not Updating**: Check browser console and network connectivity

### Support Resources
- **Documentation**: Comprehensive guides and API references
- **GitHub Issues**: Report bugs and request features
- **Community**: Join discussions and get help from other users

---

## 🔮 Future Enhancements

### Planned Features
- **Session-based Analytics**: Track web UI usage and session activity
- **Advanced Alerting**: Configurable alerts for usage and performance thresholds
- **Custom Dashboards**: User-configurable analytics dashboards
- **Data Export**: Enhanced export capabilities with multiple formats
- **Machine Learning**: Predictive analytics and anomaly detection

### Integration Opportunities
- **External Monitoring**: Integration with Prometheus, Grafana, etc.
- **Notification Systems**: Slack, email, webhook notifications
- **Business Intelligence**: Integration with BI tools and data warehouses
- **Mobile Apps**: Dedicated mobile analytics applications

This comprehensive analytics system provides the foundation for data-driven decision making and system optimization in the InstradaOGM.

---

## 📚 Related Documentation

- **[Logs and Analytics Cleanup](./LOGS_ANALYTICS_CLEANUP.md)**: Detailed information about automated data retention and cleanup
- **[MAC Address Tracking](../FEATURES/MAC_ADDRESS_TRACKING.md)**: Network device tracking with its own cleanup system
- **[API Documentation](../api/api_docs/03_settings_endpoints.md)**: Settings endpoints for configuring retention policies

---

## 📋 Section Navigation

### Troubleshooting Guides
- [📊 Analytics Overview](./ANALYTICS_OVERVIEW.md) *(Current)*
- [🧹 Logs Analytics Cleanup](./LOGS_ANALYTICS_CLEANUP.md)
- [⚡ Permissions Caching Optimization](./PERMISSIONS_CACHING_OPTIMIZATION.md)
- [🔐 Self Service Access Control Caching](./SELF_SERVICE_ACCESS_CONTROL_CACHING.md)
- [📋 Troubleshooting Index](./TROUBLESHOOTING_INDEX.md)

### Related Documentation
- [📚 Documentation Home](../DOCUMENTATION_INDEX.md)
- [🚀 Setup Guides](../SETUP/)
- [🔧 Configuration](../CONFIGURATION/)
- [🚀 Features Overview](../FEATURES/)
- [🔍 API Reference](../api/api_docs/)

---

## 🆘 Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📋 Troubleshooting Index](./TROUBLESHOOTING_INDEX.md) - All troubleshooting guides
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report problems not covered in guides
- [💬 Discussions](https://github.com/rdeangel/InstradaOGM/discussions) - Community troubleshooting help

---

**Last Updated**: 2025-11-06 | **Section**: Troubleshooting | **Category**: Analytics & Monitoring
