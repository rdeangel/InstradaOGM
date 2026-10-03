# Changelog

[⬆️ Back to Documentation Home](docs/DOCUMENTATION_INDEX.md)

## Overview

All notable changes to the InstradaOGM project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- **Upgrade — reverse proxies and client IP.** The app only trusts `X-Forwarded-For` / `X-Real-IP` / `X-Forwarded-Host` from addresses in `TRUSTED_PROXY_CIDRS`. Unset uses an automatic list (loopback outside Docker; inside Docker, the container's own networks **except** the gateway). If nginx, Caddy, Nginx Proxy Manager, or another reverse proxy runs on the Docker host or on a **different machine** and forwards to the published app port, set `TRUSTED_PROXY_CIDRS` to the proxy address **the app sees** before or right after upgrading. The container log prints the exact value when headers are ignored (`Proxy headers from untrusted peer … set TRUSTED_PROXY_CIDRS=<ip>/32`). Without that setting, every visitor looks like the proxy: self-service shows the wrong IP, own-device access fails, and login lockouts share one IP ceiling. Direct LAN access to `:3000` is unchanged. Details: `docs/CONFIGURATION/CONFIGURATION_INDEX.md`, `docs/CONFIGURATION/NGINX-PROXY-SETTINGS.md`, `docs/CONFIGURATION/CADDY-PROXY-SETTINGS.md`.
- Security updates to bundled libraries. Updated the web framework, sign-in library, and email library to versions that fix publicly reported security issues. Removed several unused libraries. No configuration changes are needed. Rebuild or pull the new image. If someone was halfway through signing in with an external provider during the upgrade, they may need to click "Sign in" again.
- API keys now look like `<id>_<secret>` and are checked much faster. Keys created before this version still work, but their first use after each restart is rate-limited per address (HTTP 429 `Legacy API key lookup limited` if exceeded). The account page marks them as legacy. Create a new key, update your scripts, then delete the old one. Limits are kept in memory per app process.
- Login redirects are origin-checked. A `callbackUrl` that points at another site, a protocol-relative URL (`//evil.com`), or a DNS name that looks like a private IP now lands on `NEXTAUTH_URL`. Redirects to localhost and private IPv4 addresses still work unless you set `AUTH_ALLOW_PRIVATE_REDIRECTS=false`. Redirects to a `10.x` LAN IP now work (they previously fell back to the base URL).
- `/api/admin/provider-display-names` requires an ADMIN or SUPER_ADMIN session or API key (HTTP 401 anonymous, HTTP 403 other signed-in roles).
- `/api/health` no longer includes a `version` field. When the database is down it returns HTTP 503 with `error: "database unavailable"` and does not include driver text.
- Missing, weak, or example `NEXTAUTH_SECRET` and `BACKUP_ENCRYPTION_SECRET_KEY` values log a `SECURITY:` warning at startup and show an alert on the System Summary tab. Example env files use non-working `REPLACE_ME_…` placeholders. Generate real values with `openssl rand -base64 32` and `openssl rand -hex 32`.
- Browser writes from other sites are now rejected. Cookie-session `POST`/`PUT`/`PATCH`/`DELETE` to `/api/*` must be same-origin (`Sec-Fetch-Site`) or send an `Origin` that matches `Host`, a trusted `X-Forwarded-Host`, or the host in `NEXTAUTH_URL`. If a reverse proxy rewrites the `Host` header, also send `X-Forwarded-Host` (and set `TRUSTED_PROXY_CIDRS`), or set `NEXTAUTH_URL` to the URL users type. As a last resort, set `CSRF_PROTECTION=false` and report it. `X-Forwarded-Host` from untrusted peers is ignored.
- Changing your email, password or username now requires your current password (or an authenticator code). The Profile page has a new **Current Password** field. API keys can no longer change a password, email or username through `PUT /api/account/update-profile` (HTTP 403). Name-only updates still work for API keys and SSO users. Changing your password there now signs you out everywhere and disables your API keys, the same as `/api/account/set-password`. Changing your email marks it unverified.
- SSO sign-in no longer links automatically to an existing local account that has two-factor authentication turned on, or whose owner changed its email and has not verified it yet. Those users see "Account Link Required" (`OidcLinkRequired`) and can sign in with their local password instead. Verifying the new email lifts the second restriction. Accounts already linked to SSO are not affected. The IdP's `email_verified` claim is still not required.
- Self-service device management can now only assign devices to the same host groups anonymous visitors can see. Assignments to hidden or globally disabled groups are rejected (HTTP 403), for single and batch assign alike; admins and explicit `*` permission are unchanged. Group-management state that cannot be verified now fails closed with HTTP 503 in host-group assignment, DHCP reservations and the VPN safe restart, instead of allowing the action. `includeDisabled=true` on the network groups list is now honored for admins only.
- The cross-site write check now also applies to API requests without a session cookie (for example, tools posting to `/api/*` from servers or other sites). Public `/api/auth/*` routes and requests carrying an API-key header remain exempt.
- Two-factor accounts no longer get their failed-login counter reset by entering only a correct password. The counter now clears when the authenticator (or backup) code step succeeds, when a forced password change completes, or for accounts without two-factor as before. The forced password-change page is rate-limited like sign-in: repeated wrong current-password or code attempts return HTTP 429 with `Retry-After`.
- Completing a password reset now enforces the minimum password length (`AUTH_PASSWORD_MIN_LENGTH`, default 8), rejects oversized input, and signs the account out of all sessions. API keys stay enabled after a reset.
- `/api/opnsense/aliases/{uuid}` (read, edit, delete a host alias, and add or remove an IP in a network group) now requires an ADMIN or SUPER_ADMIN session or API key (HTTP 401 anonymous, HTTP 403 other roles). Before, any signed-in account could change any alias or group membership. The UUID and IP address are validated (HTTP 400). Self-service and device pages use `/api/opnsense/host-group-management`, which applies per-device permissions. The self-service "remove from group" action now uses it too.
- DHCP reservations: a USER account can delete only reservations for IP addresses it may manage (the same rule as creating one). Bulk delete is limited to ADMIN/SUPER_ADMIN (HTTP 403). The reservation lookup no longer shows a USER the reserved MAC address and vendor of devices they can't manage. Conflict flags are still returned.
- Turning on two-factor authentication now needs your current password together with the first authenticator code. Regenerating backup codes also needs your password. API keys can no longer set up 2FA or regenerate backup codes (HTTP 403). Starting 2FA setup on an account that already has 2FA is refused, so setup can no longer silently replace or switch off an existing authenticator. For accounts with a password, the confirmation for changing your email, username, or password and for turning 2FA off is now always the current password. An authenticator or backup code alone is no longer accepted. Accounts without a password (SSO-only) still confirm with an authenticator code or a recent sign-in. The unused endpoints POST /api/auth/2fa/enable and POST /api/auth/2fa were removed.
- Self-registration no longer marks the e-mail address as verified. SSO sign-in will not automatically link to a self-registered account until its owner has verified the address through the verification e-mail (`/api/auth/resend-verification`). Until then, a matching SSO sign-in shows "Account Link Required". Accounts created by an admin and existing SSO links are unchanged. This only matters when public registration is enabled (off by default). If you had registration enabled, review self-registered accounts created before this release.

### Fixed
- The first admin is created from `INITIAL_ADMIN_PASSWORD`, or a random password printed once in the logs. **The container now exits if database seeding fails** (for example a DB blip at startup, or two replicas seeding an empty DB at once); check the logs and restart. On the next start the seed is skipped because the admin already exists.
- OPNsense HTTPS no longer turns off certificate checks for the whole process. A self-signed firewall needs `OPNSENSE_CA_CERT` (a PEM or a file path). `SKIP_SSL_VERIFICATION=true` still skips checks for OPNsense only, and only when you set it.

### Changed
- Postgres in Docker Compose is no longer reachable on the host port; connect with `docker compose exec`. The Traefik stack no longer publishes the app on port 3000 or a dashboard on port 8080. Traefik is pinned to v3.7.13. The plain stack still publishes the app on port 3000.
- New local and SSO accounts are never made super-admin automatically. Use the seeded `admin` account (`INITIAL_ADMIN_PASSWORD`, or the generated password printed once in the logs). If the user table is empty, re-run `npm run prisma:seed` or restart the container.
- `scripts/backup_manager.sh` destination paths expand a leading `~` and `$HOME` only. Other `$VAR` in the destination is no longer expanded. Verbose and dry-run logs no longer print SMTP passwords or API bearer tokens.
- GitHub Actions workflow steps are pinned to commit SHAs. The Docker runner installs `prisma`/`tsx`/`bcryptjs`/`dotenv` with `npm ci` from `docker/runtime/`.
- Cookie-session API writes are CSRF-checked (`Sec-Fetch-Site` when present, otherwise `Origin`). Unset `CSRF_PROTECTION` is on; only the literal `false` disables it.

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

