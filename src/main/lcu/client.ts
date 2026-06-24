import https from 'node:https';
import type { LcuCredentials } from './lockfile';

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
          res.on('data', (chunk) => (data += chunk));
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
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}
