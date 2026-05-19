# Changelog

[⬆️ Back to Documentation Home](docs/DOCUMENTATION_INDEX.md)

## Overview

All notable changes to the InstradaOGM project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-05-19

### 🎨 Style
- style(ui): improve layout and scrolling in DuplicateAliasesModal ([e3b2778](https://github.com/rdeangel/InstradaOGM/commit/e3b2778))

### 📝 Chore
- chore: prepare release v1.2.3 ([a743e60](https://github.com/rdeangel/InstradaOGM/commit/a743e60))

## [1.2.2] - 2026-05-18

### ✨ Features
- feat(db): add network alias visibility overlay ([7d9966a](https://github.com/rdeangel/InstradaOGM/commit/7d9966a))

### 📚 Documentation
- docs(network): update documentation for alias visibility feature ([c108d6b](https://github.com/rdeangel/InstradaOGM/commit/c108d6b))

### 📝 Chore
- chore: prepare release v1.2.2 ([9a2a2bf](https://github.com/rdeangel/InstradaOGM/commit/9a2a2bf))

## [1.2.1] - 2026-05-14

### ✨ Features
- feat(ui): add silent refresh callback for network alias management ([19d2b81](https://github.com/rdeangel/InstradaOGM/commit/19d2b81))

### 🐛 Bug Fixes
- fix: implement group type toggle logic and support move operations for network aliases ([1b06501](https://github.com/rdeangel/InstradaOGM/commit/1b06501))

### 📝 Chore
- chore: prepare release v1.2.1 ([62d9023](https://github.com/rdeangel/InstradaOGM/commit/62d9023))

## [1.2.0] - 2026-05-14

### 🔒 Security
- fix: resolve security linter warnings and update network alias tab dependency tracking ([1c2808c](https://github.com/rdeangel/InstradaOGM/commit/1c2808c))

### ✨ Features
- feat: add react-grab development tool to project layout and styling ([874235e](https://github.com/rdeangel/InstradaOGM/commit/874235e))
- feat(schedules): improve preview accuracy and implement execution deduplication ([e6c8f2f](https://github.com/rdeangel/InstradaOGM/commit/e6c8f2f))
- feat: implement persistent selection and state caching for devices and network aliases using localStorage ([c5dfaca](https://github.com/rdeangel/InstradaOGM/commit/c5dfaca))
- feat: implement focus and visibility-based in-place refresh for network data and expose silent refresh methods via component handles ([c3ab40e](https://github.com/rdeangel/InstradaOGM/commit/c3ab40e))
- feat: implement network alias change analytics with associated audit log tracking and dashboard visualization ([1310197](https://github.com/rdeangel/InstradaOGM/commit/1310197))
- feat: implement CIDR list viewing and integrate group-based VPN status indicators into Network Alias management ([3f3e9e6](https://github.com/rdeangel/InstradaOGM/commit/3f3e9e6))
- feat(network): lift network alias state to admin page and enhance bulk operations ([dbfd048](https://github.com/rdeangel/InstradaOGM/commit/dbfd048))
- feat(network): implement friendly name resolution and VPN status tracking ([398204c](https://github.com/rdeangel/InstradaOGM/commit/398204c))
- feat(analytics): add network alias assignment history and tracking ([6cb3603](https://github.com/rdeangel/InstradaOGM/commit/6cb3603))
- feat(network): implement network management page and enhance alias validation ([bda31de](https://github.com/rdeangel/InstradaOGM/commit/bda31de))
- feat: implement network alias management system ([9f76d9e](https://github.com/rdeangel/InstradaOGM/commit/9f76d9e))

### 🐛 Bug Fixes
- fix: visually disable inactive aliases and update group assignment helper text ([d5c13a0](https://github.com/rdeangel/InstradaOGM/commit/d5c13a0))
- fix: add network alias validation and improve execution error handling ([624118a](https://github.com/rdeangel/InstradaOGM/commit/624118a))
- fix: update dependency arrays for network alias callbacks and remove unused AlertTriangle icon ([9ae6a82](https://github.com/rdeangel/InstradaOGM/commit/9ae6a82))

### ♻️ Refactor
- refactor: consolidated Network Aliases Management toggle with multiple refresh dialog states into a single unified object and update dialog overlay accessibility ([f3ef305](https://github.com/rdeangel/InstradaOGM/commit/f3ef305))
- refactor: implement network alias support, normalize audit logging, and add VPN status indicators to alias management ([5cc4f49](https://github.com/rdeangel/InstradaOGM/commit/5cc4f49))
- refactor: optimize network alias management with targeted membership updates, silent background fetches, and improved audit logging logic. ([9b8b74c](https://github.com/rdeangel/InstradaOGM/commit/9b8b74c))
- refactor(network): implement exclusive group assignment and enhance alias metadata ([db26847](https://github.com/rdeangel/InstradaOGM/commit/db26847))

### 📚 Documentation
- docs: README update and cross platform build local save commands ([c44f3b8](https://github.com/rdeangel/InstradaOGM/commit/c44f3b8))
- docs: add network alias management and analytics documentation ([15cbeb1](https://github.com/rdeangel/InstradaOGM/commit/15cbeb1))
- docs: small readme update ([07fefac](https://github.com/rdeangel/InstradaOGM/commit/07fefac))
- docs(readme): simplify readme and add scheduled assignments ([e1556c7](https://github.com/rdeangel/InstradaOGM/commit/e1556c7))

### 📝 Chore
- chore: prepare release v1.2.0 ([f175f2c](https://github.com/rdeangel/InstradaOGM/commit/f175f2c))
- chore: update nodemailer to v8.0.5 and ignore .mcp.json files ([e845728](https://github.com/rdeangel/InstradaOGM/commit/e845728))

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

