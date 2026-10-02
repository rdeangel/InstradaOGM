/**
 * Safe charset for OPNsense path identifiers (alias uuid, VPN uuid/ikeid/vpnid,
 * Kea reservation ids). OpenVPN instance `vpnid` values are numeric (`1`/`2`/`3`)
 * and classic IPsec ikeid may be numeric, so this is not RFC-4122-only.
 */
export const OPNSENSE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class InvalidOpnsenseIdError extends Error {
  readonly status = 400 as const;

  constructor() {
    super('Invalid OPNsense identifier');
    this.name = 'InvalidOpnsenseIdError';
  }
}

export class InvalidOpnsensePathError extends Error {
  readonly status = 400 as const;

  constructor() {
    super('Invalid OPNsense API path');
    this.name = 'InvalidOpnsensePathError';
  }
}

export function isOpnsenseId(value: unknown): value is string {
  return typeof value === 'string' && OPNSENSE_ID_PATTERN.test(value);
}

export function assertOpnsenseId(s: string): string {
  if (!isOpnsenseId(s)) {
    throw new InvalidOpnsenseIdError();
  }
  return s;
}

/** Allow-list for OPNsense HTTP paths used by current call sites (`/api/...`). */
const SAFE_OPNSENSE_ENDPOINT = /^\/api\/[A-Za-z0-9/_-]+$/;

/**
 * Defence in depth for OPNsense HTTP paths. Allow-lists `/api/` plus
 * alphanumerics, `_`, `-`, and `/`. Control characters (tab/CR/LF) and
 * host-swap prefixes (`@`) are rejected before any fetch.
 */
export function assertSafeOpnsenseEndpoint(endpoint: string): string {
  if (typeof endpoint !== 'string' || /[\u0000-\u001F\u007F]/.test(endpoint)) {
    throw new InvalidOpnsensePathError();
  }
  if (!SAFE_OPNSENSE_ENDPOINT.test(endpoint)) {
    throw new InvalidOpnsensePathError();
  }
  return endpoint;
}
