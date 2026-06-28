import https from 'node:https';
import type { RiotClientCredentials } from '../lcu/lockfile';

const RIOT_CLIENT_REQUEST_TIMEOUT_MS = 15_000;
const RIOT_CLIENT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export class RiotClient {
  constructor(private creds: RiotClientCredentials) {}

  get<T = unknown>(requestPath: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: this.creds.port,
          path: requestPath,
          method: 'GET',
          auth: `riot:${this.creds.token}`,
          rejectUnauthorized: false,
          headers: {
            Accept: 'application/json',
          },
        },
        (res) => {
          let data = '';
          let responseBytes = 0;
          res.on('error', reject);
          res.on('data', (chunk: Buffer) => {
            responseBytes += chunk.length;
            if (responseBytes > RIOT_CLIENT_MAX_RESPONSE_BYTES) {
              res.destroy(new Error(`RiotClient response exceeded ${RIOT_CLIENT_MAX_RESPONSE_BYTES} bytes`));
              return;
            }
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(data ? (JSON.parse(data) as T) : (undefined as T));
              } catch {
                reject(new Error(`RiotClient returned non-JSON: ${data.slice(0, 100)}`));
              }
              return;
            }
            reject(new Error(`RiotClient GET ${requestPath} failed: HTTP ${res.statusCode}`));
          });
        },
      );
      req.setTimeout(RIOT_CLIENT_REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error(`RiotClient GET ${requestPath} timed out`));
      });
      req.on('error', reject);
      req.end();
    });
  }
}
