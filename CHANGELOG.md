# Changelog

[⬆️ Back to Documentation Home](docs/DOCUMENTATION_INDEX.md)

## Overview

All notable changes to the InstradaOGM project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-01-17

### ✨ Features
- feat: add docker-publish.yml GitHub Actions workflow and fix ARM64 build ([2653cfe](https://github.com/rdeangel/InstradaOGM/commit/2653cfe))
- feat: Add pre-built distribution package creation script and CI workflow, updating seed environment loading and build configurations. ([2c9fd76](https://github.com/rdeangel/InstradaOGM/commit/2c9fd76))
- feat: Add 512x512 logo assets and exclude from Docker builds ([72ee01a](https://github.com/rdeangel/InstradaOGM/commit/72ee01a))

### 🐛 Bug Fixes
- fix: resolve session tracking issues - Created missing API endpoint for session usage tracking - Corrected API endpoint paths in frontend hooks, analytics routes, and exclusion lists to fix 404 errors. - Updated API documentation to reflect the actual session tracking implementation and authentication model. ([59ab80e](https://github.com/rdeangel/InstradaOGM/commit/59ab80e))
- fix: Added scroll bar to HostAliasListModal and added standard pagination ([d5b967f](https://github.com/rdeangel/InstradaOGM/commit/d5b967f))
- fix: resolved issue "Application error: a client-side exception" when loading System Summary without having any rules defined in "Self-Service Access". Refactored `allowedNetworks` parsing in API routes. ([bff015f](https://github.com/rdeangel/InstradaOGM/commit/bff015f))

### 📝 Chore
- chore: prepare release v1.0.1 ([39aa5fd](https://github.com/rdeangel/InstradaOGM/commit/39aa5fd))

## [1.0.0] - 2025-12-16

### ✨ Features
- feat: first release v1.0.0 ([dfda9f0](https://github.com/rdeangel/InstradaOGM/commit/dfda9f0))

### 📚 Documentation
- docs: create initial CHANGELOG.md file ([fb95a26](https://github.com/rdeangel/InstradaOGM/commit/fb95a26))

