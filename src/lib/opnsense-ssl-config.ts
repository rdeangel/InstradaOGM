import 'server-only';
import { X509Certificate } from 'crypto';
import fs from 'fs';
import https from 'https';
import { logger } from './logger';

const MAX_CA_FILE_BYTES = 65536;
const UNTRUSTED_PEER_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_UNTRUSTED',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_GET_ISSUER_CERT',
]);

const UNTRUSTED_PEER_MESSAGE =
  'OPNsense presented a certificate this process does not trust. Set OPNSENSE_CA_CERT to the firewall CA PEM or to a file path that contains it. SKIP_SSL_VERIFICATION=true disables verification for OPNsense only and is for a lab.';

let cachedAgent: https.Agent | undefined;
let cachedAgentKey: string | undefined;
let skipWarningShown = false;

function withErrorCode(wrapped: Error, original: unknown): Error {
  const code = (original as NodeJS.ErrnoException | undefined)?.code;
  if (code) {
    (wrapped as NodeJS.ErrnoException).code = code;
  }
  return wrapped;
}

/**
 * Resolve OPNSENSE_CA_CERT to PEM text. Inline PEM (including `\n` escapes) or a file path.
 * When unset, the agent uses the system trust store.
 */
export function resolveOpnsenseCaPem(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  let pem: string;
  if (trimmed.includes('-----BEGIN CERTIFICATE-----')) {
    pem = trimmed.includes('\\n') ? trimmed.replace(/\\n/g, '\n') : trimmed;
  } else {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(trimmed);
    } catch {
      throw new Error(`OPNSENSE_CA_CERT is set to "${trimmed}" but that file is not readable.`);
    }
    if (!stat.isFile() || stat.size > MAX_CA_FILE_BYTES) {
      throw new Error(`OPNSENSE_CA_CERT is set to "${trimmed}" but that file is not readable.`);
    }
    try {
      pem = fs.readFileSync(trimmed, 'utf8');
    } catch {
      throw new Error(`OPNSENSE_CA_CERT is set to "${trimmed}" but that file is not readable.`);
    }
  }

  try {
    // Validate it is an X.509 certificate before pinning it as the only trust anchor.
    new X509Certificate(pem);
  } catch {
    throw new Error('OPNSENSE_CA_CERT is not a PEM X.509 certificate.');
  }
  return pem;
}

/**
 * HTTPS agent for OPNsense API calls. TLS is verified on this agent only.
 * A pinned CA replaces the system store. SKIP_SSL_VERIFICATION=true is the lab bypass.
 */
export function createOPNsenseHttpsAgent(): https.Agent {
  const skipSslVerification = process.env.SKIP_SSL_VERIFICATION === 'true';
  const caRaw = process.env.OPNSENSE_CA_CERT;

  if (skipSslVerification && caRaw?.trim()) {
    throw new Error(
      'SKIP_SSL_VERIFICATION and OPNSENSE_CA_CERT are both set. Set a CA pin or the lab skip flag, not both.',
    );
  }

  const caPem = resolveOpnsenseCaPem(caRaw);

  if (skipSslVerification && !skipWarningShown) {
    skipWarningShown = true;
    logger.warn(
      'WARNING: SSL certificate verification is disabled for OPNsense API calls only ' +
        '(rejectUnauthorized: false). This is insecure and is for a lab. ' +
        'It does not disable TLS for any other host.',
    );
  }

  const agentOptions: https.AgentOptions = {
    rejectUnauthorized: !skipSslVerification,
    minVersion: 'TLSv1.2',
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5,
  };

  if (caPem) {
    agentOptions.ca = caPem;
  }

  if (skipSslVerification) {
    agentOptions.checkServerIdentity = () => undefined;
  }

  return new https.Agent(agentOptions);
}

/**
 * Cached OPNsense HTTPS agent. Keyed by SKIP_SSL_VERIFICATION and OPNSENSE_CA_CERT.
 */
export function getOpnsenseHttpsAgent(): https.Agent {
  const key = `${process.env.SKIP_SSL_VERIFICATION ?? ''}\0${process.env.OPNSENSE_CA_CERT ?? ''}`;
  if (cachedAgent && cachedAgentKey === key) {
    return cachedAgent;
  }
  if (cachedAgent) {
    cachedAgent.destroy();
    cachedAgent = undefined;
    cachedAgentKey = undefined;
  }
  cachedAgent = createOPNsenseHttpsAgent();
  cachedAgentKey = key;
  return cachedAgent;
}

export function resetOpnsenseHttpsAgentForTests(): void {
  if (cachedAgent) {
    cachedAgent.destroy();
    cachedAgent = undefined;
    cachedAgentKey = undefined;
  }
  skipWarningShown = false;
}

/**
 * Validates SSL configuration and provides helpful error messages.
 */
export function handleSSLError(error: unknown): Error {
  if (!error) return new Error('Unknown error');

  const errorCode = (error as { code?: string; errno?: string }).code || (error as { code?: string; errno?: string }).errno;
  const skipSslVerification = process.env.SKIP_SSL_VERIFICATION === 'true';

  if (errorCode && UNTRUSTED_PEER_CODES.has(errorCode)) {
    if (skipSslVerification) {
      return withErrorCode(
        new Error(
          'OPNsense presented a certificate this process does not trust. Verification is already off for OPNsense only.',
        ),
        error,
      );
    }
    return withErrorCode(new Error(UNTRUSTED_PEER_MESSAGE), error);
  }

  switch (errorCode) {
    case 'CERT_HAS_EXPIRED':
      return withErrorCode(
        new Error(
          `OPNsense SSL certificate has expired. ${skipSslVerification
            ? 'Verification is already off for OPNsense only.'
            : 'Set OPNSENSE_CA_CERT after installing a current firewall certificate, or set SKIP_SSL_VERIFICATION=true for a lab.'
          } Error: ${(error as Error).message || 'Unknown SSL error'}`,
        ),
        error,
      );

    case 'ECONNREFUSED':
      return new Error(
        'Connection refused to OPNsense server. Please check if OPNsense is running and accessible.',
      );

    case 'ENOTFOUND':
      return new Error(
        'OPNsense server hostname could not be resolved. Please check your OPNSENSE_URL configuration.',
      );

    case 'ETIMEDOUT':
      return new Error(
        'Connection to OPNsense server timed out. Please check network connectivity and server availability.',
      );

    case 'ERR_TLS_CERT_ALTNAME_INVALID': {
      const certError = error as { reason?: string; host?: string; cert?: { subjectaltname?: string } };
      const hostname = certError.host || 'unknown';
      const altNames = certError.cert?.subjectaltname || 'none listed';

      if (skipSslVerification) {
        logger.warn(
          `SSL hostname mismatch detected but SSL verification is disabled for OPNsense only. ` +
            `Connecting to ${hostname} but certificate is valid for: ${altNames}.`,
        );
        return error instanceof Error ? error : new Error(`SSL hostname mismatch: ${String(error)}`);
      }

      return withErrorCode(
        new Error(
          `OPNsense certificate name does not match ${hostname}. The certificate allows: ${altNames}. ` +
            `Use a URL host that is on the certificate, or set OPNSENSE_CA_CERT only after the name matches. ` +
            `SKIP_SSL_VERIFICATION=true skips the name check for OPNsense only and is for a lab.`,
        ),
        error,
      );
    }

    default:
      if (error instanceof Error) {
        return error;
      }
      return new Error(`Unknown error: ${String(error)}`);
  }
}
