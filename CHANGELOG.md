# Changelog

[⬆️ Back to Documentation Home](docs/DOCUMENTATION_INDEX.md)

## Overview

All notable changes to the InstradaOGM project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-26

### ✨ Features
- feat: Implement duplicate host alias detection and management, including removal with group unassignment, across host alias components and API routes. ([dd0bc3a](https://github.com/rdeangel/InstradaOGM/commit/dd0bc3a))
- feat: Implement searchable and scrollable multi-select for target host aliases with loading states and reposition the execution time field for 'ONCE' schedules. ([ecff61a](https://github.com/rdeangel/InstradaOGM/commit/ecff61a))
- feat: Introduce scheduled assignment management with new API endpoints, database schema, and feature documentation. ([912650d](https://github.com/rdeangel/InstradaOGM/commit/912650d))
- feat: improved bulk scheduling operations ([9f27671](https://github.com/rdeangel/InstradaOGM/commit/9f27671))
- feat: p3 - implement admin UI for schedule management with list, create, and edit capabilities. ([9fbd851](https://github.com/rdeangel/InstradaOGM/commit/9fbd851))
- feat: p2 - Add and integrate a new service for executing network group schedules based on defined time boundaries. ([2888e39](https://github.com/rdeangel/InstradaOGM/commit/2888e39))
- feat: p1 - Implement scheduled assignment management with new API routes, data models, and validation. ([278e0cf](https://github.com/rdeangel/InstradaOGM/commit/278e0cf))
- feat: script for quick start pre-built package installation and docs ([9cdc2d5](https://github.com/rdeangel/InstradaOGM/commit/9cdc2d5))

### 🐛 Bug Fixes
- fix: Shorten DHCP conflict badge text and adjust badge display in MacTrackingTable. ([0119b11](https://github.com/rdeangel/InstradaOGM/commit/0119b11))

### 🚀 Improvements
- feat(schedules): add schedule info modal and improve cron display ([b235626](https://github.com/rdeangel/InstradaOGM/commit/b235626))
- style(schedules): improve scrollbar styling ([831be28](https://github.com/rdeangel/InstradaOGM/commit/831be28))
- feat(schedules): add time window info modal and improve timeline UX ([c90e31d](https://github.com/rdeangel/InstradaOGM/commit/c90e31d))
- Update ScheduleTimelineGrid to improve usability ([68a22e7](https://github.com/rdeangel/InstradaOGM/commit/68a22e7))
- refactor(schedules): replace MOVE/REMOVE ops with ASSIGN/UNASSIGN ([51f3d50](https://github.com/rdeangel/InstradaOGM/commit/51f3d50))
- refactor: Relocate scheduled assignments management to a dedicated tab within the admin dashboard. ([4370310](https://github.com/rdeangel/InstradaOGM/commit/4370310))
- doc: updated docker image documenation ([6d41540](https://github.com/rdeangel/InstradaOGM/commit/6d41540))

### 📝 Chore
- chore: prepare release v1.1.0 ([622a711](https://github.com/rdeangel/InstradaOGM/commit/622a711))

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

