# Contributing

[⬆️ Back to README](README.md) | [📚 Documentation Center](docs/DOCUMENTATION_INDEX.md)

Local development, custom Docker builds, volume layout, and production start commands.

## Local development

```bash
npm install
npm run setup-dirs
npm run prisma:generate
npm run dev
npm run lint                 # eslint .
npm run type-check:pretty    # tsc --noEmit --pretty
```

Full machine setup: [Installation Guide](docs/SETUP/INSTALLATION_GUIDE.md), [Environment Setup](docs/SETUP/ENVIRONMENT_SETUP_GUIDE.md).

## Custom Docker builds

npm scripts read the version from `package.json`. Command reference: [Docker Versioning](docs/SETUP/DOCKER_VERSIONING.md).

```bash
# Build
npm run docker:build:postgres
npm run docker:build:sqlite
npm run docker:build-no-cache:postgres
npm run docker:build-no-cache:sqlite
npm run docker:build-with-version

# Run
npm run docker:up:postgres
npm run docker:up:sqlite
npm run docker:down:postgres
npm run docker:down:sqlite
npm run docker:logs:postgres
npm run docker:logs:sqlite
npm run docker:version
```

Direct Compose (version from `package.json`):

```bash
docker compose --profile sqlite build \
  --build-arg NEXT_PUBLIC_APP_VERSION=$(npm pkg get version --workspaces=false | tr -d '"')

docker compose --profile postgres build \
  --build-arg NEXT_PUBLIC_APP_VERSION=$(npm pkg get version --workspaces=false | tr -d '"')
```

Or:

```bash
NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version") docker compose --profile postgres build
```

## Multi-platform images

SQLite and PostgreSQL images support `linux/amd64` and `linux/arm64`. Use `npm run docker:buildx:*` or `docker buildx build --platform linux/amd64,linux/arm64`.

Setup, push, and CI notes: [Multi-Platform Builds](docs/SETUP/MULTI_PLATFORM_BUILDS.md).

```bash
npm run docker:buildx:setup
npm run docker:buildx:fix
npm run docker:buildx:postgres
npm run docker:buildx:sqlite
npm run docker:buildx:all
npm run docker:buildx:push:all
npm run docker:buildx:latest:all
npm run docker:buildx:push:latest:all
```

## Volume layout

**SQLite**
- Database: `./data/db/`
- Backups: `./data/backups/`

**PostgreSQL**
- Database: `postgres_data` (named Docker volume)
- Backups: `./data/backups/`

Deployment walkthroughs: [SQLite](docs/DEPLOYMENT/DOCKER_DEPLOYMENT_SQLITE.md), [PostgreSQL](docs/DEPLOYMENT/DOCKER_DEPLOYMENT_POSTGRES.md).

## Production (npm)

```bash
npm run build
npm start
```

Docker remains the recommended production path. See [Deployment Overview](docs/DEPLOYMENT/README.md).
