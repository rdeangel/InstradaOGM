// Single Node process only. docker-compose runs one app container.
// Counters and the legacy memo are lost on restart. Do not use this map across replicas.

export const LEGACY_SCAN_PER_IP = 5;
export const LEGACY_SCAN_PER_PROCESS = 30;
export const LEGACY_SCAN_WINDOW_MS = 60_000;
export const LEGACY_MEMO_MAX = 1_000;
const IP_MAP_MAX = 10_000;

type IpBucket = {
  count: number;
  windowStartedAt: number;
};

let ipBuckets = new Map<string, IpBucket>();
let processCount = 0;
let processWindowStartedAt = 0;
const memo = new Map<string, string>();

function dropOldest<K, V>(map: Map<K, V>): void {
  const oldest = map.keys().next().value;
  if (oldest !== undefined) {
    map.delete(oldest);
  }
}

export function takeLegacyApiKeyScan(ip: string): boolean {
  const now = Date.now();

  if (now - processWindowStartedAt >= LEGACY_SCAN_WINDOW_MS) {
    processWindowStartedAt = now;
    processCount = 0;
  }
  if (processCount >= LEGACY_SCAN_PER_PROCESS) {
    return false;
  }

  let bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStartedAt >= LEGACY_SCAN_WINDOW_MS) {
    bucket = { count: 0, windowStartedAt: now };
  }
  if (bucket.count >= LEGACY_SCAN_PER_IP) {
    return false;
  }

  if (!ipBuckets.has(ip) && ipBuckets.size >= IP_MAP_MAX) {
    dropOldest(ipBuckets);
  }

  bucket.count += 1;
  ipBuckets.set(ip, bucket);
  processCount += 1;
  return true;
}

export const legacyMemo = {
  get(k: string): string | undefined {
    return memo.get(k);
  },
  set(k: string, id: string): void {
    if (!memo.has(k) && memo.size >= LEGACY_MEMO_MAX) {
      dropOldest(memo);
    }
    memo.set(k, id);
  },
  delete(k: string): void {
    memo.delete(k);
  },
};

export function resetLegacyStateForTests(): void {
  ipBuckets = new Map();
  processCount = 0;
  processWindowStartedAt = 0;
  memo.clear();
}
