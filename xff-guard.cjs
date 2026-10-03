'use strict';

// ponytail: http only. Next prod/standalone uses http.createServer; next dev --experimental-https is not covered, add https.Server if anyone needs it.
// ponytail: no "auto" token inside an explicit list; add if users need auto + extra hosts.

const http = require('http');
const net = require('net');
const os = require('os');
const fs = require('fs');

const WARN_PEER_CAP = 64;
const warnedPeers = new Set();

const privateV4 = new net.BlockList();
privateV4.addSubnet('10.0.0.0', 8, 'ipv4');
privateV4.addSubnet('172.16.0.0', 12, 'ipv4');
privateV4.addSubnet('192.168.0.0', 16, 'ipv4');
privateV4.addSubnet('100.64.0.0', 10, 'ipv4');
privateV4.addSubnet('127.0.0.0', 8, 'ipv4');

const privateV6 = new net.BlockList();
privateV6.addAddress('::1', 'ipv6');
privateV6.addSubnet('fc00::', 7, 'ipv6');
privateV6.addSubnet('fe80::', 10, 'ipv6');

function familyOf(ip) {
  const n = net.isIP(ip);
  if (n === 4) return 'ipv4';
  if (n === 6) return 'ipv6';
  return null;
}

function normalize(ip) {
  if (ip == null) return '';
  let s = String(ip).trim();
  if (!s) return '';
  if (/^::ffff:/i.test(s)) {
    s = s.replace(/^::ffff:/i, '');
  }
  if (net.isIP(s) === 6) {
    s = s.toLowerCase();
  }
  return s;
}

function isValidIp(ip) {
  const n = normalize(ip);
  return net.isIP(n) !== 0;
}

function isPrivateIp(ip) {
  const n = normalize(ip);
  const fam = familyOf(n);
  if (!fam) return false;
  try {
    if (fam === 'ipv4') return privateV4.check(n, 'ipv4');
    return privateV6.check(n, 'ipv6');
  } catch {
    return false;
  }
}

function parseCidrEntry(raw) {
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  let addr;
  let prefix;
  if (trimmed.includes('/')) {
    const slash = trimmed.lastIndexOf('/');
    addr = trimmed.slice(0, slash);
    const prefixStr = trimmed.slice(slash + 1);
    if (!/^\d+$/.test(prefixStr)) return null;
    prefix = Number(prefixStr);
  } else {
    addr = trimmed;
    prefix = null;
  }
  addr = normalize(addr);
  const fam = familyOf(addr);
  if (!fam) return null;
  if (prefix == null) {
    prefix = fam === 'ipv4' ? 32 : 128;
  }
  if (!Number.isInteger(prefix)) return null;
  if (fam === 'ipv4' && (prefix < 0 || prefix > 32)) return null;
  if (fam === 'ipv6' && (prefix < 0 || prefix > 128)) return null;
  return { addr, prefix, family: fam, display: `${addr}/${prefix}` };
}

function parseTrustedCidrs(raw) {
  if (raw == null || String(raw).trim() === '') {
    return { mode: 'auto', cidrs: [] };
  }
  const trimmed = String(raw).trim();
  if (/^none$/i.test(trimmed)) {
    return { mode: 'none', cidrs: [] };
  }
  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  const cidrs = [];
  for (const part of parts) {
    const parsed = parseCidrEntry(part);
    if (!parsed) {
      console.error(`[xff-guard] ignoring invalid TRUSTED_PROXY_CIDRS entry "${part}"`);
      continue;
    }
    cidrs.push(parsed.display);
  }
  return { mode: 'explicit', cidrs };
}

function ipv4ToInt(ip) {
  const p = ip.split('.').map(Number);
  return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0);
}

function intToIpv4(n) {
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ].join('.');
}

function networkPlusOne(ip, prefix) {
  const ipInt = ipv4ToInt(ip);
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const net = (ipInt & mask) >>> 0;
  return intToIpv4((net + 1) >>> 0);
}

function parseDefaultGateway(routeText) {
  if (routeText == null || routeText === '') return null;
  const lines = String(routeText).split(/\r?\n/);
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 3) continue;
    if (cols[1] !== '00000000') continue;
    const hex = cols[2];
    if (!/^[0-9A-Fa-f]{8}$/.test(hex)) continue;
    const ip = [
      parseInt(hex.slice(6, 8), 16),
      parseInt(hex.slice(4, 6), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(0, 2), 16),
    ].join('.');
    if (ip === '0.0.0.0') continue;
    return ip;
  }
  return null;
}

function addCidrToBlockList(list, cidr) {
  const parsed = parseCidrEntry(cidr);
  if (!parsed) return;
  if (parsed.prefix === (parsed.family === 'ipv4' ? 32 : 128)) {
    list.addAddress(parsed.addr, parsed.family);
  } else {
    list.addSubnet(parsed.addr, parsed.prefix, parsed.family);
  }
}

function createTrustChecker(allowCidrs, denyAddrs) {
  const allow = new net.BlockList();
  const deny = new net.BlockList();
  for (const cidr of allowCidrs) addCidrToBlockList(allow, cidr);
  for (const addr of denyAddrs) {
    const n = normalize(addr);
    const fam = familyOf(n);
    if (!fam) continue;
    deny.addAddress(n, fam);
  }
  return function isTrusted(ip) {
    const n = normalize(ip);
    const fam = familyOf(n);
    if (!fam) return false;
    try {
      return allow.check(n, fam) && !deny.check(n, fam);
    } catch {
      return false;
    }
  };
}

function autoDetectTrusted(ifaces, routeText, inContainer) {
  const allow = ['127.0.0.0/8', '::1'];
  const deny = [];
  if (!inContainer) {
    return { allow, deny, isTrusted: createTrustChecker(allow, deny) };
  }

  const names = ifaces && typeof ifaces === 'object' ? Object.keys(ifaces) : [];
  for (const name of names) {
    const entries = ifaces[name] || [];
    for (const entry of entries) {
      if (!entry || entry.internal) continue;
      const family = entry.family;
      const isV4 = family === 'IPv4' || family === 4;
      if (!isV4) continue;
      const address = entry.address;
      if (!address || net.isIP(address) !== 4) continue;
      let prefix;
      if (typeof entry.cidr === 'string' && entry.cidr.includes('/')) {
        allow.push(entry.cidr);
        prefix = Number(entry.cidr.split('/')[1]);
      } else if (typeof entry.netmask === 'string') {
        const maskInt = ipv4ToInt(entry.netmask);
        prefix = maskInt === 0 ? 0 : maskInt.toString(2).replace(/0+$/, '').length;
        allow.push(`${address}/${prefix}`);
      } else {
        continue;
      }
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue;
      const plusOne = networkPlusOne(address, prefix);
      if (!deny.includes(plusOne)) deny.push(plusOne);
    }
  }

  if (routeText == null) {
    console.error('[xff-guard] /proc/net/route unreadable, excluding only network+1');
  } else {
    const gw = parseDefaultGateway(routeText);
    if (gw && !deny.includes(gw)) deny.push(gw);
  }

  return { allow, deny, isTrusted: createTrustChecker(allow, deny) };
}

function headerString(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function headerPresent(value) {
  return headerString(value).trim() !== '';
}

function resolveClientIp(peer, xff, xRealIp, isTrusted) {
  const peerN = normalize(peer);
  const xffStr = xff == null ? '' : String(xff);
  if (xffStr.trim()) {
    const parts = xffStr.split(',');
    for (let i = parts.length - 1; i >= 0; i--) {
      const raw = parts[i].trim();
      if (!raw) continue;
      const n = normalize(raw);
      if (!isValidIp(n)) {
        break;
      }
      if (typeof isTrusted === 'function' && isTrusted(n)) continue;
      return n;
    }
  }
  const xri = normalize(xRealIp);
  if (isValidIp(xri)) return xri;
  return peerN;
}

function warnUntrustedPeer(peer, log) {
  if (!peer) return;
  if (warnedPeers.has(peer)) return;
  if (warnedPeers.size >= WARN_PEER_CAP) return;
  warnedPeers.add(peer);
  const suffix = familyOf(peer) === 'ipv6' ? '/128' : '/32';
  const line = `[xff-guard] Proxy headers from untrusted peer ${peer} ignored. If this is your reverse proxy, set TRUSTED_PROXY_CIDRS=${peer}${suffix}`;
  (typeof log === 'function' ? log : console.error)(line);
}

function resetWarnedPeers() {
  warnedPeers.clear();
}

let defaultIsTrusted = function () {
  return false;
};

function sanitize(req, options) {
  const opts = options || {};
  const isTrusted = typeof opts.isTrusted === 'function' ? opts.isTrusted : defaultIsTrusted;
  const log = typeof opts.log === 'function' ? opts.log : console.error;
  if (!req || typeof req !== 'object') return;
  if (!req.headers || typeof req.headers !== 'object') {
    req.headers = {};
  }
  const headers = req.headers;
  delete headers['x-ogm-client-ip'];

  const peer = normalize(req.socket && req.socket.remoteAddress);
  const sentXff = headers['x-forwarded-for'];
  const sentXri = headers['x-real-ip'];
  const hadProxyHeaders = headerPresent(sentXff) || headerPresent(sentXri);
  const trustedPeer = Boolean(peer) && isValidIp(peer) && isTrusted(peer);

  if (!trustedPeer) {
    headers['x-forwarded-for'] = peer;
    delete headers['x-real-ip'];
    headers['x-ogm-client-ip'] = peer;
    if (hadProxyHeaders && isPrivateIp(peer)) {
      warnUntrustedPeer(peer, log);
    }
    return;
  }

  const incomingXff = headerString(sentXff);
  const incomingXri = headerString(sentXri);
  const clientIp = resolveClientIp(peer, incomingXff, incomingXri, isTrusted);
  headers['x-forwarded-for'] = incomingXff.trim() ? `${incomingXff.trim()}, ${peer}` : peer;
  headers['x-ogm-client-ip'] = clientIp;
}

function detectInContainer() {
  try {
    return fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
  } catch {
    return false;
  }
}

function readRouteText() {
  try {
    return fs.readFileSync('/proc/net/route', 'utf8');
  } catch {
    return null;
  }
}

function initTrust() {
  const parsed = parseTrustedCidrs(process.env.TRUSTED_PROXY_CIDRS);
  let allow = [];
  let deny = [];
  if (parsed.mode === 'none') {
    allow = [];
    deny = [];
  } else if (parsed.mode === 'explicit') {
    allow = parsed.cidrs.slice();
    deny = [];
  } else {
    const detected = autoDetectTrusted(os.networkInterfaces(), readRouteText(), detectInContainer());
    allow = detected.allow;
    deny = detected.deny;
  }
  defaultIsTrusted = createTrustChecker(allow, deny);
  if (allow.length === 0) {
    console.log('[xff-guard] trusting proxy headers from: nobody');
  } else {
    const excl = deny.length ? deny.join(', ') : 'none';
    console.log(`[xff-guard] trusting proxy headers from: ${allow.join(', ')} (excluding ${excl})`);
  }
}

function installHook() {
  const orig = http.Server.prototype.emit;
  globalThis.__ogmXffGuardOrigEmit = orig;
  http.Server.prototype.emit = function patchedEmit(event) {
    if (event === 'request' && arguments[1]) {
      try {
        sanitize(arguments[1]);
      } catch (err) {
        console.error('[xff-guard] sanitize failed', err);
      }
    }
    return orig.apply(this, arguments);
  };
}

if (!globalThis.__ogmXffGuard) {
  installHook();
  initTrust();
  globalThis.__ogmXffGuard = true;
}

module.exports = {
  parseTrustedCidrs,
  autoDetectTrusted,
  resolveClientIp,
  sanitize,
  normalize,
  isValidIp,
  isPrivateIp,
  createTrustChecker,
  resetWarnedPeers,
};
