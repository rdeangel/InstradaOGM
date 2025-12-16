# Navigation Templates for Documentation

This file provides standardized navigation components for different documentation file levels. Use these templates to ensure consistent navigation across all documentation files.

## Template Usage

1. Copy the appropriate template for your file level
2. Replace placeholder text with your specific content
3. Update links to match your file location
4. Maintain consistent formatting across all documentation

---

## 1. Root-Level Documentation Template

**Use for**: Files directly in the `docs/` directory (e.g., `INSTALLATION_GUIDE.md`, `CONFIGURATION_GUIDE.md`)

```markdown
# [Document Title]

[⬆️ Back to Documentation Home](DOCUMENTATION_INDEX.md)

## Overview

[Brief description of what this document covers and its purpose]

---

## Content Sections

[Your document content goes here]

---

## Related Documentation

- [📚 Documentation Home](DOCUMENTATION_INDEX.md) - Main documentation index
- [🔧 Related Section](RELATED_SECTION.md) - Related documentation
- [🚀 Getting Started](SETUP/INSTALLATION_GUIDE.md) - Installation and setup

---

## Getting Help

- [📋 Documentation Index](DOCUMENTATION_INDEX.md) - Complete documentation overview
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report bugs or request features
- [💬 Discussions](https://github.com/rdeangel/InstradaOGM/discussions) - Community discussions

---

**Last Updated**: [Date] | **Category**: [Category]
```

---

## 2. Section-Level Documentation Template

**Use for**: Files in subdirectories like `docs/SETUP/`, `docs/FEATURES/`, `docs/CONFIGURATION/`, etc.

```markdown
# [Document Title]

[⬆️ Back to Documentation Home](../DOCUMENTATION_INDEX.md) | [📁 Back to [Section Name]](../[SECTION_DIR]/)

## Overview

[Brief description of what this document covers and its purpose]

---

## Content Sections

[Your document content goes here]

---

## Section Navigation

### [Section Name] Documentation
- [📋 Section Overview](../[SECTION_DIR]/) - Section index and overview
- [🔗 Related Document 1](../[SECTION_DIR]/RELATED_FILE_1.md) - Related topic
- [🔗 Related Document 2](../[SECTION_DIR]/RELATED_FILE_2.md) - Related topic

---

## Related Documentation

- [📚 Documentation Home](../DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 API Reference](../api/api_docs/API_Index.md) - API documentation

---

## Getting Help

- [📋 Documentation Index](../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 [Section Name] Section](../[SECTION_DIR]/) - Section-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report bugs or request features

---

**Last Updated**: [Date] | **Section**: [Section Name] | **Category**: [Category]
```

---

## 3. Deeply Nested Documentation Template

**Use for**: Files in deeply nested directories like `docs/api/api_docs/`, `docs/development/implementation/`, etc.

```markdown
# [Document Title]

[⬆️ Back to Documentation Home](../../DOCUMENTATION_INDEX.md) | [📁 Back to [Parent Section]](../../[PARENT_DIR]/) | [📂 Back to [Immediate Parent]](../)

## Overview

[Brief description of what this document covers and its purpose]

---

## Content Sections

[Your document content goes here]

---

## Breadcrumb Navigation

**Path**: `Documentation Home` → `[Parent Section]` → `[Immediate Parent]` → **Current Document**

- [📚 Documentation Home](../../DOCUMENTATION_INDEX.md)
- [📁 [Parent Section]](../../[PARENT_DIR]/)
- [📂 [Immediate Parent]](../)
- **📄 Current Document**

---

## Section Navigation

### [Immediate Parent] Documentation
- [📋 Parent Overview](../) - Parent section index
- [🔗 Sibling Document 1](../SIBLING_FILE_1.md) - Related topic
- [🔗 Sibling Document 2](../SIBLING_FILE_2.md) - Related topic

### [Parent Section] Documentation
- [📋 Section Overview](../../[PARENT_DIR]/) - Parent section index
- [🔗 Related Section Document](../../[PARENT_DIR]/RELATED_FILE.md) - Related topic

---

## Related Documentation

- [📚 Documentation Home](../../DOCUMENTATION_INDEX.md) - Main documentation index
- [🔧 API Reference](../../api/api_docs/API_Index.md) - API documentation
- [🚀 Getting Started](../../SETUP/INSTALLATION_GUIDE.md) - Installation and setup

---

## Getting Help

- [📋 Documentation Index](../../DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 [Parent Section]](../../[PARENT_DIR]/) - Section-specific help
- [📂 [Immediate Parent]](../) - Immediate parent help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report bugs or request features

---

**Last Updated**: [Date] | **Section**: [Parent Section] > [Immediate Parent] | **Category**: [Category]
```

---

## 4. API Documentation Template

**Use for**: API endpoint documentation in `docs/api/api_docs/`

```markdown
# [Document Title]

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
curl -X GET "${SERVER_URL}/api/endpoint" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Overview

[Brief description of what this API endpoint/category covers]

---

## API Endpoints

[Your API documentation content goes here]

---

## API Navigation

### API Documentation
- [📖 API Overview](README.md) - API introduction and getting started
- [🔍 API Index](API_Index.md) - Complete API endpoint index
- [🔑 Authentication](02_authentication_endpoints.md) - Authentication methods

### Related API Categories
- [🔗 Related API Category](RELATED_API_FILE.md) - Related API endpoints
- [👤 User Management](05_account_endpoints.md) - User account APIs
- [👨‍💼 Admin Functions](04_admin_endpoints.md) - Administrative APIs

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

**Last Updated**: [Date] | **API Version**: [Version] | **Category**: API Documentation
```

---

## 5. Minimal Navigation Template

**Use for**: Simple documents or when you want minimal navigation overhead

```markdown
# [Document Title]

[⬆️ Back to Documentation Home](DOCUMENTATION_INDEX.md)

## Overview

[Brief description of what this document covers]

---

## Content

[Your document content goes here]

---

**Last Updated**: [Date]
```

---

## Navigation Best Practices

### 1. Consistency Guidelines
- Always include a "Back to Documentation Home" link
- Use consistent emoji icons for navigation elements
- Maintain the same navigation structure across similar document types
- Keep navigation links at the top and bottom of documents

### 2. Link Formatting
- Use relative paths for all internal documentation links
- Use absolute URLs for external resources (GitHub, etc.)
- Include descriptive text with links (not just "click here")
- Test all links to ensure they work correctly

### 3. Breadcrumb Navigation
- For deeply nested files, include breadcrumb navigation
- Show the full path from documentation home to current document
- Make each breadcrumb element a clickable link
- Use consistent formatting: `Home → Section → Subsection → Current`

### 4. Section Organization
- Group related documentation together
- Include section navigation for easy access to related documents
- Use consistent naming conventions for sections
- Provide section overview/index files where appropriate

### 5. Mobile Considerations
- Keep navigation links concise but descriptive
- Use line breaks for long navigation chains on mobile
- Ensure navigation is touch-friendly
- Test navigation on mobile devices

### 6. Accessibility
- Use descriptive link text that makes sense out of context
- Ensure sufficient contrast for navigation elements
- Provide alternative text for navigation icons if needed
- Maintain logical tab order for navigation elements

---

## Customization Examples

### Adding Custom Navigation Sections

```markdown
## Quick Links
- [🚀 Quick Start](SETUP/INSTALLATION_GUIDE.md) - Get started in 5 minutes
- [🔧 API Reference](api/api_docs/API_Index.md) - Complete API documentation
- [🆘 Troubleshooting](TROUBLESHOOTING/) - Common issues and solutions
```

### Adding Version Information

```markdown
---
**Document Version**: 2.1.0 | **Compatible With**: InstradaOGM v1.5.0+ | **Last Updated**: 2025-11-06
```

### Adding Prerequisites

```markdown
## Prerequisites
- [📋 Installation Guide](SETUP/INSTALLATION_GUIDE.md) - Complete installation
- [🔐 Basic Authentication](FEATURES/TWO_FACTOR_AUTHENTICATION_GUIDE.md) - 2FA setup
- [📊 Account Access](FEATURES/ACCOUNT_ACTIVITY_DASHBOARD.md) - Account dashboard
```

---

## Template Maintenance

### Updating Templates
1. Review templates quarterly for consistency
2. Update links when documentation structure changes
3. Add new navigation patterns as needed
4. Remove outdated navigation elements

### Template Versioning
- Version this file when making significant changes
- Document template changes in the changelog
- Communicate template updates to documentation authors
- Provide migration guides for major template changes

---

**Template Version**: 1.0.0 | **Last Updated**: 2025-11-06