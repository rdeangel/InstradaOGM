# 📚 InstradaOGM Documentation Center

[⬆️ Back to Main README](../README.md)

<div align="center">

**Welcome to the InstradaOGM Documentation Center** - Your comprehensive guide to installation, configuration, features, and API usage.

[🚀 **Quick Start Guide**](SETUP/INSTALLATION_GUIDE.md) | [🔧 **API Reference**](api/api_docs/API_Index.md) | [🆘 **Get Help**](#getting-help)

</div>

---

## 🧭 How to Use This Documentation

### 📖 **Navigation Guide**
This documentation is organized to help you find information quickly based on your needs:

1. **New Users** → Start with [Getting Started](#getting-started) section
2. **Quick Reference** → Use [Quick Navigation](#-quick-navigation) for direct access
3. **Specific Tasks** → Jump to [Use Case Based Navigation](#-use-case-based-navigation)
4. **Search & Find** → Use [Search & Find](#-search--find) for targeted information
5. **Document Authors** → See [Navigation Templates](NAVIGATION_TEMPLATES.md) for documentation standards

### 🔍 **Finding Information**
- **Search Within Pages**: Use `Ctrl+F` (or `Cmd+F`) to search within any document
- **Follow Related Links**: Each document includes navigation to related topics
- **Use the API Index**: [API_Index.md](api/api_docs/API_Index.md) lists all endpoints in one place
- **Check the Structure**: See [Documentation Structure](#-documentation-structure) for an overview

---

## 🎯 Quick Navigation

### 🚀 **Getting Started**
- [📋 Installation Guide](SETUP/INSTALLATION_GUIDE.md) - Complete setup instructions
- [⚙️ Environment Configuration](SETUP/ENVIRONMENT_SETUP_GUIDE.md) - Configure your environment
- [🐳 Docker Setup](SETUP/DOCKER_VERSIONING.md) - Containerized deployment
- [🗄️ Database Configuration](SETUP/DATABASE_CONFIGURATION_GUIDE.md) - Database setup guide

### 🔧 **API Documentation**
- [🔍 API Index](api/api_docs/API_Index.md) - All endpoints in one place
- [🔑 Authentication Guide](api/api_docs/02_authentication_endpoints.md) - Authentication methods
- [📊 Analytics API](api/api_docs/11_analytics_endpoints.md) - Usage analytics

### ⚙️ **Configuration**
- [📋 Configuration Index](CONFIGURATION/CONFIGURATION_INDEX.md) - Complete configuration documentation
- [🌐 Proxy Setup](CONFIGURATION/) - Nginx, Caddy, Traefik configurations
- [🔐 SSO Integration](CONFIGURATION/SSO_PROVIDER_CONFIG.md) - Authentik, Keycloak, Microsoft Entra ID
- [🛡️ Security Settings](CONFIGURATION/) - Security configuration guides
- [🗄️ Database Schema](CONFIGURATION/DATABASE_SCHEMA_REFERENCE.md) - Database schema reference
- [📊 Database Migration](CONFIGURATION/PRISMA_MIGRATION_GUIDE.md) - Database migrations
- [🌐 Traefik Setup](../traefik/README.md) - Reverse proxy configuration
- [🔧 DNS Providers](../traefik/DNS_PROVIDERS_QUICK_REFERENCE.md) - DNS provider configuration

### 🎯 **Features**
- [📋 Features Index](FEATURES/FEATURES_INDEX.md) - Complete feature documentation
- [📈 Activity Dashboard](FEATURES/ACCOUNT_ACTIVITY_DASHBOARD.md) - User activity monitoring
- [🔐 Two-Factor Auth](FEATURES/TWO_FACTOR_AUTHENTICATION_GUIDE.md) - 2FA setup and usage
- [📱 MAC Address Tracking](FEATURES/MAC_ADDRESS_TRACKING.md) - Device tracking
- [💾 Backup Management](FEATURES/BACKUP_MANAGEMENT.md) - Backup creation and management
- [👥 Group Management](FEATURES/) - User and group features

### 🛠️ **Setup & Deployment**
- [📋 Setup Index](SETUP/SETUP_INDEX.md) - Complete setup and deployment documentation
- [🏗️ Installation](SETUP/) - Installation and setup guides
- [🐳 Docker Deployment](SETUP/DOCKER_VERSIONING.md) - Container deployment
- [🔄 Multi-Platform Builds](SETUP/MULTI_PLATFORM_BUILDS.md) - Cross-platform deployment

### 🔍 **Troubleshooting**
- [📋 Troubleshooting Index](TROUBLESHOOTING/TROUBLESHOOTING_INDEX.md) - Complete troubleshooting documentation
- [📊 Analytics Overview](TROUBLESHOOTING/ANALYTICS_OVERVIEW.md) - Analytics troubleshooting
- [🧹 Logs & Cleanup](TROUBLESHOOTING/LOGS_ANALYTICS_CLEANUP.md) - Log management
- [🔐 Permissions & Caching](TROUBLESHOOTING/PERMISSIONS_CACHING_OPTIMIZATION.md) - Permission issues
- [🚫 Self-Service Issues](TROUBLESHOOTING/SELF_SERVICE_ACCESS_CONTROL_CACHING.md) - Self-service troubleshooting

---

## 🚀 Getting Started

### 👋 **New to InstradaOGM?**
Welcome! Follow this step-by-step path to get up and running quickly:

1. **📋 [Install InstradaOGM](SETUP/INSTALLATION_GUIDE.md)** - Complete installation guide
2. **⚙️ [Configure Your Environment](SETUP/ENVIRONMENT_SETUP_GUIDE.md)** - Set up your environment
3. **🔐 [Set Up Authentication](FEATURES/TWO_FACTOR_AUTHENTICATION_GUIDE.md)** - Secure your system
4. **👥 [Manage Users](api/api_docs/04_admin_endpoints.md)** - Add and manage users
5. **📊 [Monitor Activity](FEATURES/ACCOUNT_ACTIVITY_DASHBOARD.md)** - Track system usage

### 🎯 **Quick Start Checklist**
- [ ] System requirements met
- [ ] InstradaOGM installed
- [ ] Database configured
- [ ] Authentication set up
- [ ] First user account created
- [ ] Basic configuration completed

### 📚 **Essential Reading**
- [📋 Setup Index](SETUP/SETUP_INDEX.md) - Complete setup and deployment documentation
- [📖 Installation Guide](SETUP/INSTALLATION_GUIDE.md) - Must-read for all new installations
- [📋 Configuration Index](CONFIGURATION/CONFIGURATION_INDEX.md) - Complete configuration documentation
- [🔐 Security Configuration](CONFIGURATION/) - Important for production deployments
- [📋 Features Index](FEATURES/FEATURES_INDEX.md) - Complete feature documentation
- [🔧 API Overview](api/api_docs/API_Index.md) - Understanding the API structure
- [📋 Troubleshooting Index](TROUBLESHOOTING/TROUBLESHOOTING_INDEX.md) - Complete troubleshooting documentation
- [🆘 Troubleshooting Guide](TROUBLESHOOTING/) - Common issues and solutions

---

## 🔍 Search & Find

### 🔍 **Search by Topic**
- **Installation Issues** → [Setup Guides](SETUP/) + [Troubleshooting](TROUBLESHOOTING/)
- **API Problems** → [API Documentation](api/api_docs/) + [Authentication Guide](api/api_docs/02_authentication_endpoints.md)
- **Configuration** → [Configuration Guides](CONFIGURATION/) + [Environment Setup](SETUP/ENVIRONMENT_SETUP_GUIDE.md)
- **Feature Usage** → [Feature Documentation](FEATURES/) + [Account Dashboard](FEATURES/ACCOUNT_ACTIVITY_DASHBOARD.md)
- **Performance Issues** → [Analytics Overview](TROUBLESHOOTING/ANALYTICS_OVERVIEW.md) + [Performance Analytics](api/api_docs/19_admin_analytics_endpoints.md)

### 📋 **Quick Reference**
- **Environment Variables** → [Environment Setup](SETUP/ENVIRONMENT_SETUP_GUIDE.md#environment-variables)
- **API Endpoints** → [API Index](api/api_docs/API_Index.md) | [API Overview](api/api_docs/API_Index.md)
- **Docker Commands** → [Docker Setup](SETUP/DOCKER_VERSIONING.md#docker-commands)
- **Database Operations** → [Database Guide](SETUP/DATABASE_CONFIGURATION_GUIDE.md)

---

## 🎯 Use Case Based Navigation

### 👤 **For Users**
- [🚀 Get Started](SETUP/INSTALLATION_GUIDE.md) - Install and configure InstradaOGM
- [📱 Manage Account](FEATURES/ACCOUNT_ACTIVITY_DASHBOARD.md) - Track your activity
- [🔐 Set Up 2FA](FEATURES/TWO_FACTOR_AUTHENTICATION_GUIDE.md) - Secure your account
- [📊 View Analytics](FEATURES/ACCOUNT_ACTIVITY_DASHBOARD.md) - Monitor your usage

### 👨‍💼 **For Administrators**
- [🏗️ System Setup](SETUP/INSTALLATION_GUIDE.md) - Complete installation
- [⚙️ Configuration](CONFIGURATION/) - System configuration
- [👥 User Management](api/api_docs/04_admin_endpoints.md) - Manage users and permissions
- [📊 System Analytics](TROUBLESHOOTING/ANALYTICS_OVERVIEW.md) - Monitor system health

### 👨‍💻 **For Developers**
- [🔧 API Reference](api/api_docs/API_Index.md) - Complete API documentation
- [🔑 Authentication](api/api_docs/02_authentication_endpoints.md) - API authentication
- [📊 Analytics API](api/api_docs/11_analytics_endpoints.md) - Usage analytics
- [🧪 Testing Guide](api/api_docs/09_utility_endpoints.md) - API testing utilities

---

## 📚 Documentation Structure

```
docs/
├── 📄 DOCUMENTATION_INDEX.md          # ← You are here
├── 📖 NAVIGATION_TEMPLATES.md         # Navigation templates for authors
├── 📋 NAVIGATION_IMPLEMENTATION_GUIDE.md # Navigation implementation guide
├── 🚀 SETUP/                        # Installation and setup
│   ├── 📋 SETUP_INDEX.md            # Setup section index
│   ├── 📋 INSTALLATION_GUIDE.md
│   ├── ⚙️ ENVIRONMENT_SETUP_GUIDE.md
│   ├── 🐳 DOCKER_VERSIONING.md
│   ├── 🗄️ DATABASE_CONFIGURATION_GUIDE.md
│   └── 🔄 MULTI_PLATFORM_BUILDS.md
├── ⚙️ CONFIGURATION/                 # System configuration
│   ├── 📋 CONFIGURATION_INDEX.md    # Configuration section index
│   ├── 🗄️ DATABASE_SCHEMA_REFERENCE.md # Database schema reference
│   ├── 🌐 CADDY-PROXY-SETTINGS.md
│   ├── 🌐 NGINX-PROXY-SETTINGS.md
│   ├── 🌐 TRAEFIK-PROXY-SETTINGS.md
│   ├── 🔐 SSO_PROVIDER_CONFIG.md
│   ├── 🛡️ ALLOW_HTTP_COMPREHENSIVE_GUIDE.md
│   ├── 📊 PRISMA_MIGRATION_GUIDE.md
│   └── 📋 SAMPLE_DATABASE_QUERIES.md
├── 🎯 FEATURES/                      # Feature documentation
│   ├── 📋 FEATURES_INDEX.md         # Features section index
│   ├── 📈 ACCOUNT_ACTIVITY_DASHBOARD.md
│   ├── 🔐 TWO_FACTOR_AUTHENTICATION_GUIDE.md
│   ├── 📱 MAC_ADDRESS_TRACKING.md
│   ├── 📱 MAC_RANDOMIZATION_GUIDE.md
│   ├── 🌐 NETWORK_GROUP_VALIDATION.md
│   ├── 🔐 PASSWORD_MANAGEMENT.md
│   ├── 📊 SINGLE_SELECT_MULTI_SELECT_FEATURE.md
│   └── 👥 UNMANAGED_GROUPS_FEATURE.md
├── 🔧 api/api_docs/                  # API documentation
│   ├── 📖 README.md                  # API overview
│   ├── 🔍 API_Index.md               # Complete API index
│   ├── 🌐 01_public_endpoints.md
│   ├── 🔑 02_authentication_endpoints.md
│   ├── ⚙️ 03_settings_endpoints.md
│   ├── 👨‍💼 04_admin_endpoints.md
│   ├── 👤 05_account_endpoints.md
│   ├── 👥 06_user_endpoints.md
│   ├── 🔥 07_opnsense_endpoints.md
│   ├── 🏠 08_host_group_management_endpoints.md
│   ├── 🧪 09_utility_endpoints.md
│   ├── 🔐 10_vpn_endpoints.md
│   ├── 📊 11_analytics_endpoints.md
│   └── ... (30+ endpoint files)
├── 🔍 TROUBLESHOOTING/              # Troubleshooting guides
│   ├── 📋 TROUBLESHOOTING_INDEX.md # Troubleshooting section index
│   ├── 📊 ANALYTICS_OVERVIEW.md
│   ├── 🧹 LOGS_ANALYTICS_CLEANUP.md
│   ├── 🔐 PERMISSIONS_CACHING_OPTIMIZATION.md
│   └── 🚫 SELF_SERVICE_ACCESS_CONTROL_CACHING.md
└── 📄 AUTHENTIK_APPLICATION_SETUP_GUIDE.md  # SSO setup
```

---

## 🆘 Getting Help

### 📋 **Common Issues**
- [🚫 Installation Problems](SETUP/INSTALLATION_GUIDE.md#troubleshooting)
- [🔐 Authentication Issues](api/api_docs/02_authentication_endpoints.md#troubleshooting)
- [⚙️ Configuration Problems](CONFIGURATION/)
- [📊 Analytics Issues](TROUBLESHOOTING/ANALYTICS_OVERVIEW.md#troubleshooting)

### 🌐 **Community & Support**
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - GitHub Issues
- [💬 Discussions](https://github.com/rdeangel/InstradaOGM/discussions) - GitHub Discussions
- [📖 Documentation Updates](https://github.com/rdeangel/InstradaOGM/blob/main/docs/) - Contribute to docs

### 📚 **Additional Resources**
- [🏠 Main Project README](../README.md) - Project overview
- [🔄 Changelog](../CHANGELOG.md) - Version history
- [🐳 Docker Hub](https://hub.docker.com/) - Official Docker images
- [🌐 Traefik Documentation](../traefik/) - Complete Traefik setup guides
- [🔧 Host Alias Scripts](../scripts/host-alias-scripts/) - Bulk host management scripts

---

## 📝 For Documentation Authors

### 📋 **Navigation Standards**
When creating or updating documentation, please follow our established navigation patterns:

- [📖 Navigation Templates](NAVIGATION_TEMPLATES.md) - Standardized templates for all document types
- [🔧 Navigation Implementation Guide](NAVIGATION_IMPLEMENTATION_GUIDE.md) - **Comprehensive implementation guide with step-by-step instructions**
- [✅ Best Practices](NAVIGATION_TEMPLATES.md#navigation-best-practices) - Guidelines for consistent navigation

### 🎯 **Getting Started with Documentation**
1. **Read the Implementation Guide** - Start with [NAVIGATION_IMPLEMENTATION_GUIDE.md](NAVIGATION_IMPLEMENTATION_GUIDE.md) for complete instructions
2. **Choose Your Template** - Select the appropriate template from [NAVIGATION_TEMPLATES.md](NAVIGATION_TEMPLATES.md)
3. **Follow the Checklist** - Use the implementation checklist to ensure completeness
4. **Test Your Navigation** - Verify all links work correctly before submitting

### 🎯 **Key Requirements**
1. **Consistent Navigation** - Use the appropriate template for your document level
2. **Back Links** - Always include "Back to Documentation Home" links
3. **Related Documentation** - Link to relevant topics and sections
4. **Mobile-Friendly** - Ensure navigation works on all devices
5. **Accessibility** - Follow accessibility guidelines for navigation elements

---

## 📖 Navigation Tips

### 🔍 **How to Find Information**
1. **Start Here** → Use this page as your main entry point
2. **Use Search** → Press `Ctrl+F` (or `Cmd+F`) to search within any page
3. **Follow Links** → Click related topics in section navigation
4. **Check Index** → Use [API Index](api/api_docs/API_Index.md) for complete endpoint list

### 📱 **Mobile Navigation**
- **Table of Contents** → Use headers to jump to sections
- **Back to Top** → Use "⬆️ Back to Documentation Home" links
- **Quick Links** → Navigation bars work on mobile devices

### 🖥️ **Desktop Navigation**
- **Multiple Tabs** → Open related documentation in separate tabs
- **Quick Reference** → Keep this index open while reading other docs
- **Keyboard Shortcuts** → Use browser search for quick navigation

---

<div align="center">

**📖 Tip**: Use **Ctrl+F** (or **Cmd+F**) to search within any documentation page.

**🔄 Last Updated**: 2025-12-07 | **📋 Version**: 1.0.0

</div>