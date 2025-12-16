# Account Activity Dashboard User Guide

## Overview

The Account Activity Dashboard provides comprehensive insights into your personal activity within the InstradaOGM. Track your network group assignments, host operations, and system interactions with detailed statistics and activity history.

## 📊 Accessing Your Activity Dashboard

1. **Navigate to Account Page**: Click on your profile icon or navigate to `/account`
2. **Select Activity Tab**: Choose from the available dashboard tabs
3. **View Your Data**: Explore statistics and recent activities

## 🎯 Dashboard Tabs

### Overview Tab
**Purpose**: High-level summary of your account activity

**Features**:
- Total activity count for selected time period
- Breakdown by activity type (assignments, unassignments, host operations)
- Quick statistics cards with visual indicators
- Time period selector (7 days, 30 days, all time)

**Activity Types Tracked**:
- **Group Assignments**: When you assign devices to network groups
- **Group Unassignments**: When you remove devices from network groups  
- **Host Creations**: When you create new host aliases
- **Host Renames**: When you rename existing host aliases
- **Host Deletions**: When you delete host aliases
- **Profile Updates**: When you modify your account settings
- **Login Activities**: Your authentication events

### Activity Trends Tab
**Purpose**: Visual representation of your activity patterns over time

**Features**:
- **Total Activity Trend**: Line chart showing your overall activity volume over the selected period
- **Activity Breakdown by Type**: Stacked area chart displaying the composition of different activity types (assignments, moves, unassignments, host operations)
- **Individual Type Trends**: Separate line charts for each activity type to analyze specific operation patterns
- **Interactive Charts**: Hover over data points to see exact values and dates
- **Period-Aware Formatting**: Time-based periods show hourly data, while longer periods show daily data
- **Admin-Only Insights**: Host operations chart visible only to admin users
- **Empty State Handling**: Helpful message when no data is available for the selected period

**Chart Types**:
1. **Total Activity Over Time** - Shows cumulative activity volume
2. **Activity Breakdown by Type** - Stacked visualization of all activity types
3. **Assignments & Moves** - Comparison of group assignment and move operations
4. **Unassignments** - Dedicated view of unassignment trends
5. **Host Operations** - Admin-only chart for host alias and DHCP operations

### Group Activity Tab
**Purpose**: Detailed breakdown of your network group interactions

**Features**:
- **Most Assigned Groups**: Groups you assign devices to most frequently
- **Activity Count**: Number of assignment/move operations per group
- **Group Usage Patterns**: Insights into your network group preferences

### User Activities Tab
**Purpose**: Detailed chronological list of your recent activities

**Features**:
- **Enhanced Descriptions**: See actual IP addresses and group names
- **Responsive Design**: Optimized for both desktop and mobile viewing
- **Load More**: Pagination support for browsing historical activities
- **Search Functionality**: Find specific activities quickly
- **Time Filtering**: Filter by different time periods

## ⏱️ Time Period Selection

The **"All Time"** dropdown at the top of the dashboard allows you to filter all statistics and charts by different time periods:

**Available Periods**:
- **1 Hour**: Last 60 minutes - Shows hourly granularity in charts
- **6 Hours**: Last 6 hours - Shows hourly granularity in charts
- **12 Hours**: Last 12 hours - Shows hourly granularity in charts
- **1 Day**: Last 24 hours - Shows hourly granularity in charts
- **7 Days**: Last 7 days - Shows daily granularity in charts
- **30 Days**: Last 30 days - Shows daily granularity in charts
- **All Time**: Complete history - Shows daily granularity in charts

**How It Affects the Dashboard**:
- **Overview Tab**: All statistics cards update to show data for the selected period
- **Activity Trends Tab**: Charts automatically update with data for the selected period
- **Group Activity Tab**: Top groups are recalculated based on the selected period
- **User Activities Tab**: Recent activities are filtered by the selected period

**Chart Formatting**:
- **Short Periods (1h-1d)**: X-axis shows time (HH:mm) for precise hourly tracking
- **Longer Periods (7d+)**: X-axis shows dates (MMM dd) for daily overview
- **Most Active Day**: Only displayed for periods longer than 1 day

## 📱 Responsive Design Features

### Desktop Experience
- **Compact List View**: Efficient use of screen space
- **Scrollable Activity List**: Fixed height container with smooth scrolling
- **Hover Effects**: Visual feedback when interacting with activities
- **Side-by-side Layout**: Statistics and activities displayed together

### Mobile Experience  
- **Card-based Layout**: Activities displayed as individual cards
- **Natural Text Wrapping**: Long descriptions wrap without truncation
- **Touch-friendly Interface**: Optimized for touch interactions
- **Vertical Stacking**: Elements stack vertically for better mobile viewing

## 🔍 Enhanced Activity Descriptions

### Before and After Examples

**Old Generic Descriptions**:
- "Batch assigned 1 hosts"
- "Unassigned from group"
- "Host operation completed"

**New Detailed Descriptions**:
- "Assigned 192.168.1.61 to 'Italy - Proton - OV'"
- "Moved 192.168.1.61 from 'Brazil Proton - OV' to 'Italy - Proton - OV'"
- "Unassigned 192.168.1.61 from 'Italy - VPS-Aruba - WG'"
- "Created host alias for 192.168.1.75"
- "Renamed host alias from 'old-name' to 'new-name'"

### Activity Types and Descriptions

**Single Host Assignments**:
- Shows the specific IP address being assigned
- Displays the target group name
- Indicates if it was a move operation with source group

**Batch Operations**:
- Lists specific hosts involved in the operation
- Shows target group for assignments
- Displays both source and destination for moves

**Host Management**:
- Creation: Shows the IP address of the new host
- Rename: Shows old and new names
- Deletion: Shows which host was removed

## 🔄 Using the Activity Features

### Viewing Recent Activities

1. **Navigate to User Activities Tab**: Click on the "User Activities" tab
2. **Browse Activities**: Scroll through your recent activities
3. **Load More**: Click "Load More" to see older activities
4. **Search Activities**: Use the search bar to find specific activities

### Filtering by Time Period

1. **Select Time Period**: Choose from 7 days, 30 days, or all time
2. **View Updated Statistics**: Statistics automatically update for the selected period
3. **Browse Filtered Activities**: Activity list updates to match the time filter

### Understanding Activity Icons

- **🔗 Assignment Icon**: Group assignments and moves
- **🔓 Unassignment Icon**: Group unassignments  
- **🏠 Host Icon**: Host creation, rename, and deletion operations
- **👤 Profile Icon**: Account and profile updates
- **🔑 Login Icon**: Authentication and session activities

## 📊 Activity Statistics

### Statistics Cards

**Total Activities**: Overall count of your activities in the selected time period

**Group Operations**: 
- **Assignments**: Number of times you assigned devices to groups
- **Unassignments**: Number of times you removed devices from groups

**Host Operations**:
- **Creations**: New host aliases you created
- **Renames**: Host aliases you renamed  
- **Deletions**: Host aliases you deleted

**Account Operations**:
- **Profile Updates**: Changes to your account settings
- **Login Activities**: Your authentication events

### Most Assigned Groups

**Purpose**: Shows which network groups you assign devices to most frequently

**Information Displayed**:
- Group name with proper formatting
- Assignment/move operation count for the selected time period
- Visual representation of relative activity levels

**Note**: This metric tracks assignment and move operations to groups, not general group activity. When you move a device from Group A to Group B, only Group B (the destination) receives credit for the activity.

## 🔧 Tips and Best Practices

### Monitoring Your Activity

1. **Regular Review**: Check your activity dashboard regularly to understand your usage patterns
2. **Time Period Analysis**: Use different time periods to identify trends
3. **Group Usage**: Monitor which groups you use most to optimize your workflow
4. **Activity Verification**: Review recent activities to ensure all operations were intentional

### Mobile Usage

1. **Portrait Orientation**: Best experience in portrait mode on mobile devices
2. **Touch Navigation**: Tap cards to see hover effects and interactions
3. **Scroll Smoothly**: Use smooth scrolling to browse through activities
4. **Search Efficiently**: Use the search feature to quickly find specific activities

### Troubleshooting

**Activities Not Showing**:
- Check your time period filter
- Ensure you have performed activities in the selected timeframe
- Try refreshing the page

**Text Cut Off on Mobile**:
- The new responsive design should prevent this
- If you still see issues, try refreshing or rotating your device

**Slow Loading**:
- Large activity histories may take time to load
- Use the Load More feature instead of loading all activities at once
- Consider filtering by shorter time periods

## 🔒 Privacy and Security

### Data Access
- **Personal Data Only**: You can only view your own activity data
- **Secure Authentication**: All activity data requires proper authentication
- **Audit Trail**: Your activity viewing is also logged for security

### Data Retention
- **Activity History**: Activities are retained according to system policies
- **Statistics**: Aggregated statistics are calculated in real-time
- **Privacy Compliance**: All data handling follows privacy regulations

## 📞 Support and Feedback

### Getting Help
- **Documentation**: Refer to this guide for common questions
- **Administrator**: Contact your system administrator for account-specific issues
- **Technical Support**: Report bugs or technical issues through proper channels

### Providing Feedback
- **Feature Requests**: Suggest improvements to the activity dashboard
- **Usability Issues**: Report any user experience problems
- **Mobile Experience**: Share feedback about mobile device usage

---

## Section Navigation

### Features Documentation
- [📋 Features Overview](../FEATURES/) - Section index and overview
- [🔐 Related Document 1](../FEATURES/TWO_FACTOR_AUTHENTICATION_GUIDE.md) - Two-factor authentication setup and management
- [🔗 Related Document 2](../FEATURES/MAC_ADDRESS_TRACKING.md) - MAC address tracking and management

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

**Last Updated**: 2025-11-06 | **Section**: Features | **Category**: User Interface

# Account Activity Dashboard User Guide

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to Features](../FEATURES/)

## Overview

The Account Activity Dashboard provides comprehensive insights into your personal activity within InstradaOGM. Track your network group assignments, host operations, and system interactions with detailed statistics and activity history.
