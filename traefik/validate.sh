#!/bin/bash

# =============================================================================
# Traefik Configuration Validation Script
# =============================================================================
# This script validates the Traefik configuration before deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$SCRIPT_DIR/runtime"

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║         Traefik Configuration Validation                               ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0
WARNINGS=0

# Check if running from traefik directory
cd "$SCRIPT_DIR/.."

echo "🔍 Validating Traefik Configuration..."
echo ""

# Check required template files
echo "📋 Checking template files..."
TEMPLATE_FILES=(
    "traefik/templates/traefik.yml.template"
    "traefik/templates/config.yml.template"
    "traefik/templates/.env.traefik.example"
)

for file in "${TEMPLATE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file - MISSING"
        ((ERRORS++))
    fi
done

echo ""

# Check required runtime files
echo "📋 Checking runtime files..."
RUNTIME_FILES=(
    "traefik/runtime/.env.traefik"
    "traefik/runtime/traefik.yml"
    "traefik/runtime/config.yml"
    "traefik/runtime/acme.json"
)

for file in "${RUNTIME_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file - MISSING"
        if [ "$file" = "traefik/runtime/.env.traefik" ]; then
            echo "     Run: cd traefik && ./generate-config.sh"
        fi
        ((ERRORS++))
    fi
done

echo ""

# Check other required files
echo "📋 Checking other required files..."
OTHER_FILES=(
    "docker-compose-traefik.yml"
    ".env"
)

for file in "${OTHER_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file - MISSING"
        ((ERRORS++))
    fi
done

echo ""

# Check runtime/.env.traefik configuration
echo "⚙️  Checking Traefik environment configuration..."
if [ -f "traefik/runtime/.env.traefik" ]; then
    source traefik/runtime/.env.traefik

    if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "your-instrada-ogm.com" ]; then
        echo "  ⚠️  DOMAIN: $DOMAIN (verify this is correct - should be your actual domain)"
    else
        echo "  ✅ DOMAIN: $DOMAIN"
    fi

    if [ -z "$LETSENCRYPT_EMAIL" ] || [ "$LETSENCRYPT_EMAIL" = "your-email@example.com" ]; then
        echo "  ❌ LETSENCRYPT_EMAIL not configured"
        ((ERRORS++))
    else
        echo "  ✅ LETSENCRYPT_EMAIL: $LETSENCRYPT_EMAIL"
    fi

    if [ -z "$CLOUDFLARE_DNS_API_TOKEN" ] || [ "$CLOUDFLARE_DNS_API_TOKEN" = "your_cloudflare_api_token_here" ]; then
        echo "  ❌ CLOUDFLARE_DNS_API_TOKEN not configured"
        ((ERRORS++))
    else
        echo "  ✅ CLOUDFLARE_DNS_API_TOKEN: ${CLOUDFLARE_DNS_API_TOKEN:0:10}..."
    fi

    if [ -z "$ACME_SERVER" ]; then
        echo "  ⚠️  ACME_SERVER not set (defaulting to staging)"
        ((WARNINGS++))
    else
        echo "  ✅ ACME_SERVER: $ACME_SERVER"
        if [ "$ACME_SERVER" = "staging" ]; then
            echo "     ⚠️  Using STAGING certificates (not trusted by browsers)"
        fi
    fi

    if [ -z "$DOCKER_NETWORK" ]; then
        echo "  ❌ DOCKER_NETWORK not configured"
        ((ERRORS++))
    else
        echo "  ✅ DOCKER_NETWORK: $DOCKER_NETWORK"
    fi
fi

echo ""

# Check main .env configuration
echo "⚙️  Checking main .env configuration..."
if grep -q "CF_DNS_API_TOKEN=" .env 2>/dev/null; then
    echo "  ⚠️  CF_DNS_API_TOKEN found in .env (should be in traefik/runtime/.env.traefik)"
    echo "     This is no longer needed - Traefik now uses traefik/runtime/.env.traefik"
    ((WARNINGS++))
else
    echo "  ✅ CF_DNS_API_TOKEN not in .env (correct - using traefik/runtime/.env.traefik)"
fi

echo ""

# Check Docker
echo "🐳 Checking Docker..."
if command -v docker &> /dev/null; then
    echo "  ✅ Docker installed"
    DOCKER_VERSION=$(docker --version)
    echo "     $DOCKER_VERSION"

    # Check for Docker Compose (v2 plugin)
    if docker compose version &> /dev/null; then
        echo "  ✅ Docker Compose installed"
        COMPOSE_VERSION=$(docker compose version)
        echo "     $COMPOSE_VERSION"
    else
        echo "  ❌ Docker Compose not found"
        ((ERRORS++))
    fi
else
    echo "  ❌ Docker not found"
    ((ERRORS++))
fi

echo ""

# Check Docker Compose syntax
echo "📝 Validating Docker Compose syntax..."
if docker compose -f docker-compose-traefik.yml config > /dev/null 2>&1; then
    echo "  ✅ docker-compose-traefik.yml syntax is valid"
else
    echo "  ❌ docker-compose-traefik.yml has syntax errors"
    ((ERRORS++))
fi

echo ""

# Check acme.json permissions
echo "🔒 Checking acme.json permissions..."
if [ -f "traefik/runtime/acme.json" ]; then
    PERMS=$(stat -c "%a" traefik/runtime/acme.json 2>/dev/null || stat -f "%OLp" traefik/runtime/acme.json 2>/dev/null)
    if [ "$PERMS" = "600" ]; then
        echo "  ✅ acme.json has correct permissions (600)"
    else
        echo "  ⚠️  acme.json has permissions $PERMS (should be 600)"
        echo "     Run: chmod 600 traefik/runtime/acme.json"
        ((WARNINGS++))
    fi
fi

echo ""

# Check ports
echo "🔌 Checking ports..."
for port in 80 443 8080; do
    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
        echo "  ⚠️  Port $port is already in use"
        ((WARNINGS++))
    else
        echo "  ✅ Port $port is available"
    fi
done

echo ""

# Summary
echo "════════════════════════════════════════════════════════════════════════"
echo "📊 Validation Summary"
echo "════════════════════════════════════════════════════════════════════════"
echo "Errors:   $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo "✅ Configuration is valid!"
    if [ $WARNINGS -gt 0 ]; then
        echo "⚠️  Please review the warnings above before deploying."
    fi
    echo ""
    echo "🚀 Ready to deploy! Run:"
    echo "   docker compose -f docker-compose-traefik.yml --profile postgres up -d"
    echo "   # or"
    echo "   docker compose -f docker-compose-traefik.yml --profile sqlite up -d"
    echo ""
    exit 0
else
    echo "❌ Configuration has errors. Please fix them before deploying."
    echo ""
    echo "💡 Common fixes:"
    echo "   - Run: cd traefik && ./generate-config.sh"
    echo "   - Edit: traefik/runtime/.env.traefik"
    echo "   - Check: .env file has CF_DNS_API_TOKEN"
    echo ""
    exit 1
fi

