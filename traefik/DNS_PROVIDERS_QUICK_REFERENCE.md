# DNS Providers Quick Reference

[⬆️ Back to Documentation Home](../docs/DOCUMENTATION_INDEX.md) | [📁 Back to Traefik](./README.md)

## Overview

Quick reference for configuring different DNS providers with Traefik.

---

## Popular Providers

### Cloudflare

**Configuration:**
```bash
DNS_PROVIDER=cloudflare
CLOUDFLARE_DNS_API_TOKEN=your_token_here
```

**Get API Token:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit zone DNS" template
4. Select your domain
5. Copy token

**Alternative (legacy):**
```bash
CLOUDFLARE_EMAIL=your-email@example.com
CLOUDFLARE_API_KEY=your_global_api_key
```

**Documentation:** https://go-acme.github.io/lego/dns/cloudflare/

---

### AWS Route53

**Configuration:**
```bash
DNS_PROVIDER=route53
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_HOSTED_ZONE_ID=your_zone_id  # Optional but recommended
```

**IAM Policy Required:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:GetChange",
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets"
      ],
      "Resource": [
        "arn:aws:route53:::hostedzone/*",
        "arn:aws:route53:::change/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "route53:ListHostedZonesByName",
      "Resource": "*"
    }
  ]
}
```

**Documentation:** https://go-acme.github.io/lego/dns/route53/

---

### DigitalOcean

**Configuration:**
```bash
DNS_PROVIDER=digitalocean
DO_AUTH_TOKEN=your_token_here
```

**Get API Token:**
1. Go to https://cloud.digitalocean.com/account/api/tokens
2. Click "Generate New Token"
3. Name it and select "Write" scope
4. Copy token

**Documentation:** https://go-acme.github.io/lego/dns/digitalocean/

---

### Google Cloud DNS

**Configuration:**
```bash
DNS_PROVIDER=gcloud
GCE_PROJECT=your_project_id
GCE_SERVICE_ACCOUNT_FILE=/path/to/service-account.json
```

**Setup:**
1. Create service account in Google Cloud Console
2. Grant "DNS Administrator" role
3. Create and download JSON key
4. Mount key file in docker-compose or copy to runtime/

**Documentation:** https://go-acme.github.io/lego/dns/gcloud/

---

### OVH

**Configuration:**
```bash
DNS_PROVIDER=ovh
OVH_ENDPOINT=ovh-eu  # or ovh-ca, ovh-us, etc.
OVH_APPLICATION_KEY=your_app_key
OVH_APPLICATION_SECRET=your_app_secret
OVH_CONSUMER_KEY=your_consumer_key
```

**Get Credentials:**
1. Go to https://eu.api.ovh.com/createApp/
2. Create application
3. Generate consumer key with DNS rights

**Documentation:** https://go-acme.github.io/lego/dns/ovh/

---

### Gandi

**Configuration:**
```bash
DNS_PROVIDER=gandiv5
GANDIV5_API_KEY=your_api_key
```

**Get API Key:**
1. Go to https://account.gandi.net/
2. Navigate to Security settings
3. Generate API key

**Documentation:** https://go-acme.github.io/lego/dns/gandiv5/

---

### Namecheap

**Configuration:**
```bash
DNS_PROVIDER=namecheap
NAMECHEAP_API_USER=your_username
NAMECHEAP_API_KEY=your_api_key
```

**Get API Key:**
1. Enable API access in Namecheap account
2. Whitelist your server IP
3. Get API key from account settings

**Documentation:** https://go-acme.github.io/lego/dns/namecheap/

---

### Azure DNS

**Configuration:**
```bash
DNS_PROVIDER=azuredns
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
AZURE_SUBSCRIPTION_ID=your_subscription_id
AZURE_TENANT_ID=your_tenant_id
AZURE_RESOURCE_GROUP=your_resource_group
```

**Setup:**
1. Create service principal in Azure
2. Grant DNS Zone Contributor role
3. Get credentials from Azure Portal

**Documentation:** https://go-acme.github.io/lego/dns/azuredns/

---

### Hetzner

**Configuration:**
```bash
DNS_PROVIDER=hetzner
HETZNER_API_KEY=your_api_key
```

**Get API Key:**
1. Go to https://dns.hetzner.com/
2. Navigate to API tokens
3. Create new token

**Documentation:** https://go-acme.github.io/lego/dns/hetzner/

---

### Vultr

**Configuration:**
```bash
DNS_PROVIDER=vultr
VULTR_API_KEY=your_api_key
```

**Get API Key:**
1. Go to https://my.vultr.com/settings/#settingsapi
2. Generate API key

**Documentation:** https://go-acme.github.io/lego/dns/vultr/

---

## All Supported Providers

**Full list of 150+ providers:** https://go-acme.github.io/lego/dns/

**Popular providers include:**
- Cloudflare
- AWS Route53
- DigitalOcean
- Google Cloud DNS
- Azure DNS
- OVH
- Gandi
- Namecheap
- Hetzner
- Vultr
- Linode
- DreamHost
- GoDaddy
- Dynu
- Duck DNS
- And 135+ more!

---

## Configuration Workflow

### 1. Choose Your Provider

Visit https://go-acme.github.io/lego/dns/ and find your DNS provider.

### 2. Get Provider Credentials

Follow the provider-specific instructions above or in the Lego documentation.

### 3. Configure runtime/.env.traefik

```bash
# Edit the file
nano traefik/runtime/.env.traefik

# Add your provider and credentials
DNS_PROVIDER=your_provider
PROVIDER_SPECIFIC_CREDENTIALS=your_credentials
```

### 4. Generate Configuration

```bash
cd traefik
./generate-config.sh
```

The script will:
- ✅ Validate your DNS_PROVIDER
- ✅ Check for required credentials (for known providers)
- ✅ Generate traefik.yml with your provider
- ✅ Generate config.yml

### 5. Validate

```bash
./validate.sh
```

### 6. Start Traefik

```bash
cd ..
docker compose -f docker-compose-traefik.yml --profile sqlite up -d
```

---

## Testing

### Use Staging First!

Always test with Let's Encrypt staging server first:

```bash
# In runtime/.env.traefik
ACME_SERVER=staging
```

**Why?**
- ✅ No rate limits
- ✅ Test your DNS provider integration
- ✅ Verify certificate generation works
- ❌ Certificates not trusted by browsers (expected)

### Switch to Production

After successful staging test:

```bash
# 1. Update config
nano runtime/.env.traefik
# Change: ACME_SERVER=production

# 2. Regenerate
./generate-config.sh

# 3. Delete staging cert
rm runtime/acme.json
touch runtime/acme.json
chmod 600 runtime/acme.json

# 4. Restart Traefik
cd .. && docker compose -f docker-compose-traefik.yml restart traefik
```

---

## Troubleshooting

### Certificate Not Generating?

**Check Traefik logs:**
```bash
docker compose -f docker-compose-traefik.yml logs -f traefik
```

**Common issues:**

1. **Invalid credentials**
   - Verify credentials in runtime/.env.traefik
   - Check provider dashboard for API key status

2. **DNS propagation timeout**
   - Some providers take longer to propagate DNS changes
   - Increase `delayBeforeChecks` in traefik.yml.template

3. **Rate limiting**
   - Use staging server for testing
   - Check Let's Encrypt rate limits: https://letsencrypt.org/docs/rate-limits/

4. **Wrong provider name**
   - Provider name must match Lego's CLI flag
   - Check: https://go-acme.github.io/lego/dns/[provider]/

### Validation Errors?

**Run validation:**
```bash
cd traefik
./validate.sh
```

**Check for:**
- ✅ DNS_PROVIDER is set
- ✅ Provider credentials are set
- ✅ acme.json has 600 permissions
- ✅ Ports 80, 443 are available

---

## Need Help?

1. **Check provider documentation:** https://go-acme.github.io/lego/dns/[provider]/
2. **Check Traefik logs:** `docker compose logs traefik`
3. **Verify DNS records:** Use `dig` or `nslookup` to check DNS
4. **Test with staging first:** Avoid rate limits while troubleshooting

---

## Section Navigation

### Traefik Documentation
- [📋 Traefik Overview](./README.md) - Main Traefik documentation
- [📖 Complete Guide](./TRAEFIK_GUIDE.md) - Comprehensive Traefik setup guide
- [🔧 Proxy Settings](../docs/CONFIGURATION/TRAEFIK-PROXY-SETTINGS.md) - Detailed proxy configuration

---

## Related Documentation

- [📚 Documentation Home](../docs/DOCUMENTATION_INDEX.md) - Main documentation index
- [🚀 Getting Started](../docs/SETUP/INSTALLATION_GUIDE.md) - Installation and setup
- [🔧 Configuration](../docs/CONFIGURATION/) - System configuration

---

## Getting Help

- [📋 Documentation Index](../docs/DOCUMENTATION_INDEX.md) - Complete documentation overview
- [📁 Traefik Section](./) - Traefik-specific help
- [🐛 Report Issues](https://github.com/rdeangel/InstradaOGM/issues) - Report DNS provider issues

---

**Last Updated**: 2025-11-07 | **Section**: Traefik | **Category**: DNS Configuration

