import https from 'node:https';
import type { LcuCredentials } from './lockfile';

const LCU_REQUEST_TIMEOUT_MS = 15_000;
const LCU_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

export class LcuClient {
  constructor(private creds: LcuCredentials) {}

  get<T = unknown>(requestPath: string): Promise<T> {
    return this.request<T>('GET', requestPath);
  }

  put<T = unknown>(requestPath: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', requestPath, body);
  }

  patch<T = unknown>(requestPath: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', requestPath, body);
  }

  post<T = unknown>(requestPath: string, body: unknown): Promise<T> {
    return this.request<T>('POST', requestPath, body);
  }

  private request<T = unknown>(
    method: 'GET' | 'PUT' | 'PATCH' | 'POST',
    requestPath: string,
    body?: unknown,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: this.creds.port,
          path: requestPath,
          method,
          auth: `riot:${this.creds.token}`,
          rejectUnauthorized: false,
          headers: payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : undefined,
        },
        (res) => {
          let data = '';
          let responseBytes = 0;
          res.on('error', reject);
          res.on('data', (chunk: Buffer) => {
            responseBytes += chunk.length;
            if (responseBytes > LCU_MAX_RESPONSE_BYTES) {
              res.destroy(new Error(`LCU response exceeded ${LCU_MAX_RESPONSE_BYTES} bytes`));
              return;
            }
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(data ? (JSON.parse(data) as T) : (undefined as T));
              } catch {
                reject(new Error(`LCU returned non-JSON: ${data.slice(0, 100)}`));
              }
              return;
            }
            reject(new Error(`LCU ${method} ${requestPath} failed: HTTP ${res.statusCode}`));
          });
        },
      );
      req.setTimeout(LCU_REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error(`LCU ${method} ${requestPath} timed out`));
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}
