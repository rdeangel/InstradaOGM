import 'server-only';
import https from 'https';
import { getOpnsenseHttpsAgent, handleSSLError } from './opnsense-ssl-config';

export type OpnsenseHttpResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
};

export type OpnsenseHttpsRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function rejectTlsError(error: unknown, reject: (reason: Error) => void): void {
  const original = error instanceof Error ? error : new Error(String(error));
  const wrapped = handleSSLError(original);
  if (wrapped !== original) {
    const code = (original as NodeJS.ErrnoException).code;
    if (code) {
      (wrapped as NodeJS.ErrnoException).code = code;
    }
  }
  reject(wrapped);
}

export function opnsenseHttpsRequest(
  absoluteUrl: string,
  init: OpnsenseHttpsRequestInit = {},
): Promise<OpnsenseHttpResponse> {
  let url: URL;
  try {
    url = new URL(absoluteUrl);
  } catch {
    return Promise.reject(new Error('OPNSENSE_URL must use https://'));
  }
  if (url.protocol !== 'https:') {
    return Promise.reject(new Error('OPNSENSE_URL must use https://'));
  }

  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  const body = init.body;

  return new Promise((resolve, reject) => {
    let agent: https.Agent;
    try {
      agent = getOpnsenseHttpsAgent();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on('error', (err) => rejectTlsError(err, reject));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          const incoming = res.headers;
          const response: OpnsenseHttpResponse = {
            ok: status >= 200 && status < 300,
            status,
            statusText: res.statusMessage ?? '',
            headers: {
              get(name: string): string | null {
                const value = incoming[name.toLowerCase()];
                if (value === undefined) return null;
                return Array.isArray(value) ? value.join(', ') : value;
              },
            },
            text: async () => raw,
            json: async () => JSON.parse(raw) as unknown,
          };
          resolve(response);
        });
      },
    );

    req.on('error', (err) => rejectTlsError(err, reject));
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}
