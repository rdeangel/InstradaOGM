#!/bin/bash

# =============================================================================
# Traefik Configuration Generator for InstradaOGM
# =============================================================================
# This script generates Traefik configuration files from templates
# using environment variables from runtime/.env.traefik

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/templates"
RUNTIME_DIR="$SCRIPT_DIR/runtime"
ENV_FILE="$RUNTIME_DIR/.env.traefik"

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║         Traefik Configuration Generator for InstradaOGM                ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if running from correct directory
if [ ! -f "$TEMPLATE_DIR/traefik.yml.template" ]; then
    echo "❌ Error: Template files not found!"
    echo "Please run this script from the traefik directory."
    exit 1
fi

# Create runtime directory if it doesn't exist
if [ ! -d "$RUNTIME_DIR" ]; then
    echo "📁 Creating runtime directory..."
    mkdir -p "$RUNTIME_DIR"
    mkdir -p "$RUNTIME_DIR/logs"
fi

# Check if .env.traefik exists
if [ ! -f "$ENV_FILE" ]; then
    echo "⚠️  Configuration file not found: $ENV_FILE"
    echo ""
    echo "Creating from template..."
    cp "$TEMPLATE_DIR/.env.traefik.example" "$ENV_FILE"
    echo "✅ Created: $ENV_FILE"
    echo ""
    echo "📝 Please edit $ENV_FILE with your configuration:"
    echo "   - DOMAIN: Your domain name"
    echo "   - LETSENCRYPT_EMAIL: Your email for Let's Encrypt"
    echo "   - DNS_PROVIDER: Your DNS provider (cloudflare, route53, digitalocean, etc.)"
    echo "   - DNS provider credentials (varies by provider)"
    echo "   - ACME_SERVER: staging or production"
    echo ""
    echo "💡 See https://go-acme.github.io/lego/dns/ for provider-specific configuration"
    echo ""
    read -p "Press Enter to open the file for editing..."
    ${EDITOR:-nano} "$ENV_FILE"
fi

# Load environment variables
echo "📖 Loading configuration from $ENV_FILE..."
source "$ENV_FILE"

# Validate required variables
REQUIRED_VARS=("DOMAIN" "LETSENCRYPT_EMAIL" "DNS_PROVIDER" "DOCKER_NETWORK" "CONTAINER_NAME")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ Error: Missing required variables in $ENV_FILE:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    exit 1
fi

echo "✅ Configuration loaded"
echo ""

# Validate DNS provider credentials based on provider
echo "🔍 Validating DNS provider credentials..."
case "$DNS_PROVIDER" in
    cloudflare)
        if [ -z "$CLOUDFLARE_DNS_API_TOKEN" ] && [ -z "$CLOUDFLARE_API_KEY" ]; then
            echo "❌ Error: Cloudflare requires either CLOUDFLARE_DNS_API_TOKEN or CLOUDFLARE_API_KEY"
            exit 1
        fi
        ;;
    route53)
        if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
            echo "❌ Error: Route53 requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
            exit 1
        fi
        ;;
    digitalocean)
        if [ -z "$DO_AUTH_TOKEN" ]; then
            echo "❌ Error: DigitalOcean requires DO_AUTH_TOKEN"
            exit 1
        fi
        ;;
    gandi|gandiv5)
        if [ -z "$GANDIV5_API_KEY" ]; then
            echo "❌ Error: Gandi requires GANDIV5_API_KEY"
            exit 1
        fi
        ;;
    ovh)
        if [ -z "$OVH_APPLICATION_KEY" ] || [ -z "$OVH_APPLICATION_SECRET" ] || [ -z "$OVH_CONSUMER_KEY" ]; then
            echo "❌ Error: OVH requires OVH_APPLICATION_KEY, OVH_APPLICATION_SECRET, and OVH_CONSUMER_KEY"
            exit 1
        fi
        ;;
    *)
        echo "⚠️  Warning: Unknown DNS provider '$DNS_PROVIDER'"
        echo "   Make sure you've configured the required environment variables"
        echo "   See: https://go-acme.github.io/lego/dns/$DNS_PROVIDER/"
        ;;
esac
echo "✅ DNS provider credentials validated"
echo ""

# Set ACME server based on environment variable
if [ "$ACME_SERVER" = "production" ]; then
    ACME_CA_SERVER="caServer: https://acme-v02.api.letsencrypt.org/directory"
    echo "🔒 Using Let's Encrypt PRODUCTION server"
else
    ACME_CA_SERVER="caServer: https://acme-staging-v02.api.letsencrypt.org/directory"
    echo "🧪 Using Let's Encrypt STAGING server (for testing)"
fi

# Set default values for optional variables
LOG_LEVEL="${LOG_LEVEL:-INFO}"
TRUSTED_IP_RANGE="${TRUSTED_IP_RANGE:-192.168.0.0/16}"

echo ""
echo "📋 Configuration Summary"
echo "======================="
echo "Domain:              $DOMAIN"
echo "Email:               $LETSENCRYPT_EMAIL"
echo "DNS Provider:        $DNS_PROVIDER"
echo "ACME Server:         $ACME_SERVER"
echo "Docker Network:      $DOCKER_NETWORK"
echo "Container Name:      $CONTAINER_NAME"
echo "Trusted IP Range:    $TRUSTED_IP_RANGE"
echo "Log Level:           $LOG_LEVEL"
echo ""

# Generate traefik.yml
echo "📝 Generating traefik.yml..."
sed -e "s|{{LETSENCRYPT_EMAIL}}|$LETSENCRYPT_EMAIL|g" \
    -e "s|{{DNS_PROVIDER}}|$DNS_PROVIDER|g" \
    -e "s|{{ACME_CA_SERVER}}|$ACME_CA_SERVER|g" \
    -e "s|{{DOCKER_NETWORK}}|$DOCKER_NETWORK|g" \
    -e "s|{{TRUSTED_IP_RANGE}}|$TRUSTED_IP_RANGE|g" \
    -e "s|{{LOG_LEVEL}}|$LOG_LEVEL|g" \
    "$TEMPLATE_DIR/traefik.yml.template" > "$RUNTIME_DIR/traefik.yml"
echo "✅ Generated: $RUNTIME_DIR/traefik.yml"

# Generate config.yml
echo "📝 Generating config.yml..."
sed -e "s|{{DOMAIN}}|$DOMAIN|g" \
    -e "s|{{CONTAINER_NAME}}|$CONTAINER_NAME|g" \
    "$TEMPLATE_DIR/config.yml.template" > "$RUNTIME_DIR/config.yml"
echo "✅ Generated: $RUNTIME_DIR/config.yml"

# Create acme.json if it doesn't exist
if [ ! -f "$RUNTIME_DIR/acme.json" ]; then
    echo "📝 Creating acme.json..."
    touch "$RUNTIME_DIR/acme.json"
    chmod 600 "$RUNTIME_DIR/acme.json"
    echo "✅ Created: $RUNTIME_DIR/acme.json"
fi

# Ensure logs directory exists
mkdir -p "$RUNTIME_DIR/logs"

echo ""
echo "✨ Configuration generation complete!"
echo ""
echo "📁 Generated files:"
echo "   - $RUNTIME_DIR/traefik.yml"
echo "   - $RUNTIME_DIR/config.yml"
echo "   - $RUNTIME_DIR/acme.json"
echo "   - $RUNTIME_DIR/logs/"
echo ""
echo "🚀 Next steps:"
echo "   1. Review the generated configuration files"
echo "   2. Update docker-compose-traefik.yml to use runtime/ directory"
echo "   3. Start services: docker compose -f docker-compose-traefik.yml --profile [sqlite|postgres] up -d"
echo ""

