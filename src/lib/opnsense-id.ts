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

/**
 * Defence in depth for OPNsense HTTP paths. Rejects traversal and encoding
 * tricks before any fetch. Query strings (`?`) are rejected because no current
 * call site uses them; add an explicit allow if a future caller needs one.
 */
export function assertSafeOpnsenseEndpoint(endpoint: string): string {
  if (
    endpoint.includes('..') ||
    endpoint.includes('#') ||
    endpoint.includes('%') ||
    endpoint.includes('\\') ||
    endpoint.includes('?')
  ) {
    throw new InvalidOpnsensePathError();
  }
  return endpoint;
}
