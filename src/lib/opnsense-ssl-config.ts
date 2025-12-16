import 'server-only';
import https from 'https';
import { logger } from './logger';

/**
 * Creates an HTTPS agent with SSL verification settings specifically for OPNsense API calls.
 * This provides per-request SSL configuration instead of global NODE_TLS_REJECT_UNAUTHORIZED.
 * 
 * @returns HTTPS agent configured based on SKIP_SSL_VERIFICATION environment variable
 */
export function createOPNsenseHttpsAgent(): https.Agent {
  const skipSslVerification = process.env.SKIP_SSL_VERIFICATION === 'true';

  if (skipSslVerification) {
    logger.warn(
      "WARNING: SSL certificate verification is disabled for OPNsense API calls only " +
      "(rejectUnauthorized: false). This is insecure and not recommended for production environments."
    );
  }

  const agentOptions: https.AgentOptions = {
    // Only disable SSL verification for OPNsense API calls when explicitly configured
    rejectUnauthorized: !skipSslVerification,

    // Additional security configurations
    secureProtocol: 'TLSv1_2_method', // Enforce TLS 1.2+
    ciphers: [
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES128-SHA256',
      'ECDHE-RSA-AES256-SHA384',
      'DHE-RSA-AES128-GCM-SHA256',
      'DHE-RSA-AES256-GCM-SHA384',
      '!aNULL',
      '!eNULL',
      '!EXPORT',
      '!DES',
      '!RC4',
      '!MD5',
      '!PSK',
      '!SRP',
      '!CAMELLIA'
    ].join(':'),

    // Connection settings
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 30000,
  };

  // When SSL verification is disabled, also disable hostname verification
  if (skipSslVerification) {
    agentOptions.checkServerIdentity = () => undefined; // Bypass hostname verification
    logger.warn(
      "WARNING: Both SSL certificate verification AND hostname verification are disabled for OPNsense API calls. " +
      "This completely bypasses SSL security checks and should only be used in development environments."
    );
  }

  return new https.Agent(agentOptions);
}

/**
 * Gets the fetch configuration with proper SSL handling for OPNsense API calls.
 * This is used with Node.js fetch API (Node 18+) or undici.
 * 
 * @returns Configuration object for fetch requests
 */
export function getOPNsenseFetchConfig(): RequestInit {
  const skipSslVerification = process.env.SKIP_SSL_VERIFICATION === 'true';

  if (skipSslVerification) {
    logger.warn(
      "WARNING: SSL certificate verification is disabled for OPNsense API calls only. " +
      "This is insecure and not recommended for production environments."
    );
  }

  // For Node.js 18+ fetch API, we need to use a custom dispatcher
  // This is handled differently than the https.Agent approach
  const config: RequestInit = {
    // @ts-expect-error - Node.js specific fetch options
    agent: createOPNsenseHttpsAgent(),
  };

  return config;
}

/**
 * Validates SSL configuration and provides helpful error messages.
 * 
 * @param error - The error that occurred during the request
 * @returns Enhanced error with helpful SSL-related guidance
 */
export function handleSSLError(error: unknown): Error {
  if (!error) return new Error('Unknown error');

  const errorCode = (error as { code?: string; errno?: string }).code || (error as { code?: string; errno?: string }).errno;
  const skipSslVerification = process.env.SKIP_SSL_VERIFICATION === 'true';

  switch (errorCode) {
    case 'CERT_HAS_EXPIRED':
      return new Error(
        `OPNsense SSL certificate has expired. ${skipSslVerification
          ? 'SSL verification is already disabled.'
          : 'Set SKIP_SSL_VERIFICATION=true in your .env file to bypass SSL verification for development.'
        }. Error: ${(error as Error).message || 'Unknown SSL error'}`
      );

    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return new Error(
        `OPNsense uses a self-signed or untrusted SSL certificate. ${skipSslVerification
          ? 'SSL verification is already disabled.'
          : 'Set SKIP_SSL_VERIFICATION=true in your .env file to bypass SSL verification for development.'
        }`
      );

    case 'CERT_UNTRUSTED':
      return new Error(
        `OPNsense SSL certificate is not trusted by the system. ${skipSslVerification
          ? 'SSL verification is already disabled.'
          : 'Set SKIP_SSL_VERIFICATION=true in your .env file to bypass SSL verification for development.'
        }`
      );

    case 'ECONNREFUSED':
      return new Error(
        'Connection refused to OPNsense server. Please check if OPNsense is running and accessible.'
      );

    case 'ENOTFOUND':
      return new Error(
        'OPNsense server hostname could not be resolved. Please check your OPNSENSE_URL configuration.'
      );

    case 'ETIMEDOUT':
      return new Error(
        'Connection to OPNsense server timed out. Please check network connectivity and server availability.'
      );

    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      const certError = error as { reason?: string; host?: string; cert?: { subjectaltname?: string } };
      const hostname = certError.host || 'unknown';
      const altNames = certError.cert?.subjectaltname || 'none listed';

      if (skipSslVerification) {
        // When SSL verification is disabled, this error should not occur due to checkServerIdentity bypass
        // If it still occurs, log a warning but don't throw an error
        logger.warn(
          `SSL hostname mismatch detected but SSL verification is disabled. ` +
          `Connecting to IP ${hostname} but certificate is valid for: ${altNames}. ` +
          `This should not happen with proper SSL bypass configuration.`
        );
        // Return the original error to let the calling code handle it
        return error instanceof Error ? error : new Error(`SSL hostname mismatch: ${String(error)}`);
      }

      return new Error(
        `OPNsense SSL certificate hostname mismatch. Connecting to IP ${hostname} but certificate is valid for: ${altNames}. ` +
        `Solutions: 1) Use the domain name from the certificate instead of IP, 2) Set SKIP_SSL_VERIFICATION=true in your .env file to bypass SSL verification.`
      );

    default:
      // Return the original error if it's not SSL-related, or create a new Error if it's not an Error object
      if (error instanceof Error) {
        return error;
      }
      return new Error(`Unknown error: ${String(error)}`);
  }
}
