import https from 'node:https';
import type { LcuCredentials } from './lockfile';

// 最小 LCU 客户端：只做 detect-client 验证需要的请求。
// 完整客户端（重试/超时/类型化 DTO/POST/WebSocket）留到后续战绩阶段。
//
// LCU 连接三要素（来自技术文档）：
// 1. 地址：https://127.0.0.1:<port>（port 来自 lockfile）
// 2. 认证：HTTP Basic Auth，用户名固定 'riot'，密码 = lockfile token
// 3. 证书：自签名，必须 rejectUnauthorized:false 关闭校验
export class LcuClient {
  constructor(private creds: LcuCredentials) {}

  // 发 GET 请求。path 形如 '/lol-summoner/v1/current-summoner'。
  // 返回解析后的 JSON；客户端未响应/凭证错误/非 2xx 时 reject。
  get<T = unknown>(requestPath: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: this.creds.port,
          path: requestPath,
          method: 'GET',
          auth: `riot:${this.creds.token}`, // Basic Auth，用户名固定 riot
          rejectUnauthorized: false, // 自签名证书，关闭校验
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data) as T);
              } catch {
                reject(new Error(`LCU 返回非 JSON：${data.slice(0, 100)}`));
              }
            } else {
              reject(new Error(`LCU 请求失败：HTTP ${res.statusCode}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }
}
