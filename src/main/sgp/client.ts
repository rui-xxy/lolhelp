import https from 'node:https';
import type { SgpAuth } from './auth';

// SGP（Service Gateway Platform）HTTPS 客户端。
// 与 LcuClient 的区别：
// - 认证：Bearer token（entitlements JWT），不是 Basic Auth
// - 地址：大区 SGP 域名（如 hn10-k8s-sgp.lol.qq.com:21019），不是 127.0.0.1
// - 证书：腾讯自签名，rejectUnauthorized:false
//
// 实测验证：能查完整历史战绩（100+场），不受 LCU 21 场缓存限制。
export class SgpClient {
  constructor(private auth: SgpAuth) {}

  // 发 GET 请求到 SGP。path 形如 '/match-history-query/v1/...'。
  // params 作为 query string 拼接。
  get<T = unknown>(requestPath: string, params?: Record<string, string | number>): Promise<T> {
    let fullPath = requestPath;
    if (params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
      fullPath += `?${qs.toString()}`;
    }

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: this.extractHost(this.auth.region.matchHistory),
          port: 21019,
          path: fullPath,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.auth.accessToken}`, // entitlements JWT
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          rejectUnauthorized: false, // 腾讯自签名证书
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data) as T);
              } catch {
                reject(new Error(`SGP 返回非 JSON：${data.slice(0, 100)}`));
              }
            } else {
              reject(new Error(`SGP 请求失败：HTTP ${res.statusCode}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  // 从 "https://hn10-k8s-sgp.lol.qq.com:21019" 提取 hostname "hn10-k8s-sgp.lol.qq.com"
  private extractHost(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    }
  }
}
