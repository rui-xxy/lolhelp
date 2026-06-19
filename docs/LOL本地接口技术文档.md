# 英雄联盟本地技术接口详解  
（基于 `/WeGameApps/英雄联盟` 当前安装目录的实证分析）

> 说明：本文件以当前目录中的配置文件、日志和结构为基础，结合公开已知的 LCU API / Live Client Data API 行为进行整理。示例中涉及的端口、Token 等全部使用占位符，未暴露实际账号敏感信息。

---

## 目录

- [整体架构概览](#整体架构概览)
- [一、Riot Client 与 LeagueClient 本地接口（LCU API）](#一riot-client-与-leagueclient-本地接口lcu-api)
  - [1. 角色与启动链路](#1-角色与启动链路)
  - [2. 本地端口与认证机制](#2-本地端口与认证机制)
  - [3. 访问方式与基础代码示例](#3-访问方式与基础代码示例)
  - [4. 核心功能模块与典型端点](#4-核心功能模块与典型端点)
  - [5. LCU WebSocket 事件流](#5-lcu-websocket-事件流)
  - [6. 典型应用场景](#6-典型应用场景)
  - [7. 使用限制与潜在风险](#7-使用限制与潜在风险)
- [二、游戏内实时数据接口（Live Client Data API）](#二游戏内实时数据接口live-client-data-api)
  - [1. 角色与定位](#1-角色与定位)
  - [2. 访问方式与认证](#2-访问方式与认证)
  - [3. 核心端点与数据格式](#3-核心端点与数据格式)
  - [4. 典型应用场景](#4-典型应用场景)
  - [5. 使用限制与风险](#5-使用限制与风险)
- [三、Riot Client / 腾讯平台远程接口](#三riot-client--腾讯平台远程接口)
- [四、从当前目录中可以印证的关键信息](#四从当前目录中可以印证的关键信息)
- [五、实战建议与开发注意事项](#五实战建议与开发注意事项)

---

## 整体架构概览

从当前目录结构看，主要组件为：

- `Riot Client/`：统一启动器，负责账号登陆、票据获取、调用游戏客户端。
- `LeagueClient/`：英雄联盟 PC 客户端（LCU，League Client Update），包含：
  - `LeagueClient.exe` / `LeagueClientUx.exe` / `LeagueClientUxRender.exe`
  - `system.yaml`、`Config/*.yaml`、`Plugins/rcp-*` 等
  - 大量 `LeagueClientUx.log` / `debug.log` 日志
- `Game/`：真正的游戏进程与对局逻辑（含 `Game/Logs/GameLogs/...`）。

技术接口大致分成两类：

- **客户端层本地接口**：  
  - LCU 本地 REST / WebSocket 接口（通过 `LeagueClient` 暴露），用于账户、房间、选人、聊天、战绩等。
- **游戏层本地接口**：
  - Live Client Data API（游戏运行时 `127.0.0.1:2999` 暴露），只在对局中提供当前局内的实时状态。

下面分章节展开。

---

## 一、Riot Client 与 LeagueClient 本地接口（LCU API）

### 1. 角色与启动链路

结合当前安装目录中的配置：

- `Riot Client/system.yaml` 中的关键片段：

  ```yaml
  partner_product:
    arguments:
    - --riotclient-auth-token={remoting-auth-token}
    - --riotclient-app-port={remoting-app-port}
    - --riotclient-tencent
    - --no-rads
    - --disable-self-update
    - --region=TENCENT
    - --locale={locale}
    executable: LeagueClient.exe
    id: LoL
    relative_path: ../LeagueClient
  ```

  说明：

  - Riot Client 启动英雄联盟时，会为 `LeagueClient.exe` 注入：
    - `--riotclient-auth-token` / `--riotclient-app-port`：用于 Riot Client 与 LeagueClient 之间的内部通信。
    - 区域、语言、腾讯集成等参数。

- `LeagueClient/2025-10-17T19-48-29_17588_LeagueClientUx.log` 中的启动参数（已脱敏）：

  ```text
  Command line arguments:
    --riotclient-auth-token=<riotclient-auth-token>
    --riotclient-app-port=57131
    ...
    --remoting-auth-token=<remoting-auth-token>
    --app-port=57243
    --install-directory=...
    --app-name=LeagueClient
    ...
  ```

  以及后续创建本地页面：

  ```text
  Creating ux window with url
    https://riot:<remoting-auth-token>@127.0.0.1:57243/bootstrap.html
  ```

  这清楚地表明：

  - **LCU 在本机 `127.0.0.1:<app-port>` 上开启 HTTPS 服务**。
  - 使用 **HTTP Basic Auth**，用户名固定为 `riot`，密码为 `--remoting-auth-token`。

- `LeagueClient/lockfile` / `LeagueClient/lockfile_`：  
  虽然当前文件为空（客户端未运行），但在游戏运行时会写入内容（格式为单行，字段以 `:` 分隔），典型格式（通用 LCU 行为）：

  ```text
  LeagueClient:PID:APP_PORT:PASSWORD:https
  ```

  - `APP_PORT` 与 `--app-port` 一致。
  - `PASSWORD` 与 `--remoting-auth-token` 一致或等价，用于本地身份认证。

**总结：**

- **LCU API 其实就是 `LeagueClient` 在本机起的 HTTPS + WebSocket 服务**。
- Riot Client 负责生成并传递 Auth Token 和端口，LeagueClient 用这些信息启动本地服务并在日志中体现。

---

### 2. 本地端口与认证机制

#### 1）LCU REST / WebSocket 基本信息

- **监听地址**：`https://127.0.0.1:<app-port>`
- **端口来源**：
  - 启动参数中的 `--app-port=<port>`
  - 或运行时从 `LeagueClient/lockfile` 中读取
- **认证方式**：HTTP Basic Auth
  - 用户名：`riot`
  - 密码：`<remoting-auth-token>`（来自 `--remoting-auth-token` 或 `lockfile`）

- **TLS 证书**：
  - 使用自签名证书。
  - 客户端调用时需要关闭证书校验（如 `curl -k`、Node.js 中 `rejectUnauthorized: false`等）。

#### 2）Riot Client 内部端口

- `--riotclient-app-port` / `--riotclient-auth-token`：  
  用于 Riot Client 与 LeagueClient 之间内部通信，不是对第三方开放的通用接口。
- 理论上也可被第三方进程访问，但不建议依赖，且更有被视为“深度逆向”的风险。

---

### 3. 访问方式与基础代码示例

#### 3.1 获取 LCU 端口与密码（本地）

最常见方法：**读取 `lockfile`**（在客户端运行时有效）。

假设安装在 `C:\WeGameApps\英雄联盟\LeagueClient`：

- 文件路径：`C:\WeGameApps\英雄联盟\LeagueClient\lockfile`

内容类似：

```text
LeagueClient:12345:57243:a1b2c3d4e5f6g7h8:https
```

解析规则：

- 第 3 段：端口 `57243`
- 第 4 段：密码 `a1b2c3d4e5f6g7h8`

#### 3.2 cURL 示例（获取当前召唤师信息）

```bash
# 假设 lockfile 中读取到：
# APP_PORT=57243
# PASSWORD=a1b2c3d4e5f6g7h8

curl -k \
  -u "riot:a1b2c3d4e5f6g7h8" \
  "https://127.0.0.1:57243/lol-summoner/v1/current-summoner"
```

- `-k`：忽略自签名证书。
- `-u`：使用 Basic Auth。

返回数据示例（字段简化）：

```json
{
  "displayName": "SomeSummoner",
  "puuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "summonerId": 123456789,
  "accountId": 1234567890,
  "profileIconId": 1234,
  "summonerLevel": 400
}
```

#### 3.3 Node.js 示例（REST 请求）

```js
const https = require('https');

const port = 57243;                 // 来自 lockfile
const password = 'a1b2c3d4e5f6g7h8';
const auth = Buffer.from(`riot:${password}`).toString('base64');

const options = {
  hostname: '127.0.0.1',
  port,
  path: '/lol-summoner/v1/current-summoner',
  method: 'GET',
  headers: {
    'Authorization': `Basic ${auth}`
  },
  rejectUnauthorized: false // 自签名证书
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => (data += chunk));
  res.on('end', () => {
    console.log(JSON.parse(data));
  });
});

req.on('error', console.error);
req.end();
```

---

### 4. 核心功能模块与典型端点

通过当前目录下的 `LeagueClient/debug.log` 和 `LeagueClientUx.log` 可以看到大量实际调用，比如：

- `/lol-lobby/v2/lobby`
- `/lol-chat/v1/conversations/.../messages`
- `/lol-summoner/v1/current-summoner/profile-privacy`
- WebSocket 事件 `uri: /lol-champ-select/v1/summoners/0` 等。

下面按功能模块整理常用端点（不是完整清单，而是“核心代表”）：

#### 4.1 召唤师与账号信息（`/lol-summoner`）

- `GET /lol-summoner/v1/current-summoner`  
  当前登录账号的召唤师信息。
- `GET /lol-summoner/v2/summoners/names?name=<urlencoded-name>`  
  根据召唤师名称查询信息。
- `PUT /lol-summoner/v1/current-summoner/profile-privacy`  
  修改个人资料隐私设置（当前日志中可见此调用失败的错误信息）。

示例（修改隐私设置）：

```bash
curl -k -u "riot:${PASSWORD}" \
  -X PUT \
  -H "Content-Type: application/json" \
  "https://127.0.0.1:${APP_PORT}/lol-summoner/v1/current-summoner/profile-privacy" \
  -d '{"profilePrivacy":"PUBLIC"}'
```

#### 4.2 大厅与匹配（`/lol-lobby`）

- `GET  /lol-lobby/v2/lobby`  
  当前大厅状态，`LeagueClient/debug.log` 中有类似日志：

  ```text
  "[LOG_INFO] /lol-lobby/v2/lobby  [object Object]"
  ```

- `POST /lol-lobby/v2/lobby`  
  创建大厅（自定义、匹配等）。
- `POST /lol-lobby/v2/lobby/matchmaking/search`  
  开始匹配。
- `DELETE /lol-lobby/v2/lobby/matchmaking/search`  
  取消匹配。
- `DELETE /lol-lobby/v2/lobby`  
  退出并解散大厅。

#### 4.3 游戏流程（Gameflow，`/lol-gameflow`）

常用端点（虽然本目录日志中没有直接记录，但为 LCU 标准流程）：

- `GET /lol-gameflow/v1/session`  
  当前游戏流程状态（大厅、正在匹配、BP 中、加载、游戏中、结算等）。
- `GET /lol-gameflow/v1/phase`  
  返回当前阶段的字符串，如：`None`, `Lobby`, `Matchmaking`, `ReadyCheck`, `ChampSelect`, `InProgress`, `EndOfGame`。
- `POST /lol-gameflow/v1/ready-check/accept`  
  接受“接受对局”的 ready check。

#### 4.4 选人阶段（ Champ Select，`/lol-champ-select`）

从 `LeagueClient/debug.log` 中可见 WebSocket 事件 URI 示例如：

```text
Riot WebSocket message, uri: /lol-champ-select/v1/summoners/0
```

典型 REST 端点包括：

- `GET /lol-champ-select/v1/session`  
  获取当前 BP 阶段信息（队伍、备选英雄、锁定信息等）。
- `PATCH /lol-champ-select/v1/session/actions/{id}`  
  锁定、BAN 英雄等操作。
- `GET /lol-champ-select/v1/all-grid-champions` 等  
  可用英雄列表。

#### 4.5 聊天与好友（`/lol-chat`, `/lol-summoner`）

日志中有聊天相关错误：

```text
jsonRequest of /lol-chat/v1/conversations/.../messages failed
```

常用端点：

- `GET /lol-chat/v1/me`  
  当前聊天用户状态（在线/离线、状态文本）。
- `GET /lol-chat/v1/friends`  
  好友列表。
- `GET /lol-chat/v1/conversations`  
  会话列表（大厅聊天、房间聊天、私聊等）。
- `POST /lol-chat/v1/conversations/{id}/messages`  
  发送消息。
- `GET /lol-chat/v1/conversations/{id}/messages`  
  获取会话消息。

#### 4.6 战绩与比赛记录（`/lol-match-history`, `/lol-replays`）

常见端点（标准 LCU 行为）：

- `GET /lol-match-history/v1/products/lol/current-summoner/matches`  
  当前召唤师最近对局列表。
- `GET /lol-match-history/v1/games/{gameId}`  
  指定对局的详细信息。
- `POST /lol-replays/v1/rofls/{gameId}/download`  
  请求下载某一对局的回放文件。

#### 4.7 其他常见模块

- `/lol-store/*`：游戏商城。
- `/lol-loadouts/*`：符文页等配置。
- `/lol-clash/*`：战队、锦标赛功能。
- `/lol-highlights/*`：高光录像录制。

---

### 5. LCU WebSocket 事件流

LCU 还提供一个 **WebSocket 事件流**，用于实时订阅各种资源变化（大厅、BP、对局流程、聊天等），前端插件（如 `rcp-fe-lol-navigation`）就在使用，例如 `LeagueClient/debug.log` 中的：

```text
"[LOG_DEBUG] Riot WebSocket message, uri:  /lol-champ-select/v1/summoners/0 , data:  [object Object]"
```

#### 5.1 连接方式

- WebSocket 地址：`wss://127.0.0.1:<app-port>/`
- 认证：同样使用 Basic Auth（`riot:<remoting-auth-token>`），TLS 为自签名。

#### 5.2 消息协议格式

协议是一个简化的 WAMP 风格，典型流程为：

1. 客户端建立 WebSocket 连接。
2. 发送订阅指令：

   ```json
   [5, "OnJsonApiEvent"]
   ```

3. 随后收到的事件形如：

   ```json
   [8, "OnJsonApiEvent",
     {
       "eventType": "Update",
       "uri": "/lol-gameflow/v1/session",
       "data": { /* 具体数据对象 */ }
     }
   ]
   ```

- `eventType`：常见值有 `Create` / `Update` / `Delete`。
- `uri`：对应的 REST 资源路径。
- `data`：资源的 JSON 数据快照。

#### 5.3 Node.js WebSocket 示例

```js
const WebSocket = require('ws');

const port = 57243;
const password = 'a1b2c3d4e5f6g7h8';
const authHeader = 'Basic ' + Buffer.from(`riot:${password}`).toString('base64');

const ws = new WebSocket(`wss://127.0.0.1:${port}/`, {
  rejectUnauthorized: false,
  headers: {
    Authorization: authHeader
  }
});

ws.on('open', () => {
  console.log('WebSocket connected');

  // 订阅所有 JsonApi 事件
  ws.send(JSON.stringify([5, 'OnJsonApiEvent']));
});

ws.on('message', (msg) => {
  try {
    const data = JSON.parse(msg);
    // 形如 [8, "OnJsonApiEvent", { eventType, uri, data }]
    if (Array.isArray(data) && data[1] === 'OnJsonApiEvent') {
      const evt = data[2];
      console.log('Event:', evt.eventType, evt.uri);
      // 示例：只打印 /lol-gameflow/v1/phase
      if (evt.uri === '/lol-gameflow/v1/phase') {
        console.log('Current phase:', evt.data);
      }
    }
  } catch (e) {
    console.error('Invalid message', e);
  }
});

ws.on('error', console.error);
```

---

### 6. 典型应用场景

- **桌面助手 / Overlay**：
  - 在选人阶段展示阵容统计、符文推荐。
  - 游戏中显示战绩、天赋、对线对手信息。
- **战绩与数据分析工具**：
  - 自动抓取最近对局、构建个人战绩面板。
- **自动化脚本（高风险）**：
  - 自动接受对局、自动创建房间、自动发送消息等（容易违反协议，不建议）。

---

### 7. 使用限制与潜在风险

- **协议与法律风险**：
  - LCU API 是内部接口，官方未正式对第三方开放。
  
- **易变性**：
  - `system.yaml` 中可见当前客户端版本 `15.22`，LCU 端点在版本升级时可能变更。
- **安全风险**：
  - `remoting-auth-token` 存在于进程命令行和日志中（如 `LeagueClientUx.log`），理论上本机其他程序可读取并调用 LCU API。
  - 任何恶意软件若获取此 Token，可在本机上以玩家身份操作账号（如建房、发消息）。
- **封号/反作弊风险**：
  - 虽然本地 HTTPS 调用本质上是“外部控制 UI”，但若用于自动化行为（脚本）可能被视为违规。
- **腾讯国服差异**：
  - 部分在国际服可用的接口，在腾讯版本上可能受限或行为不同（例如日志中多次出现 `/lol-summoner/v1/current-summoner/profile-privacy` 返回 403）。

---

## 二、游戏内实时数据接口（Live Client Data API）

### 1. 角色与定位

- 由游戏进程在 **对局进行中** 开启的本地 HTTP(S) 服务。
- 用于向本机其他程序提供实时对局状态：
  - 当前召唤师、队友、敌人信息。
  - 当前生命值、蓝量、金币、装备。
  - 实时事件（击杀、塔毁、龙/男爵等）。
- 不涉及账号管理、房间管理，仅限“当前这一局”的观测数据。

当前目录中没有直接出现 `/liveclientdata` 的字符串，但根据 LOL 客户端的通用行为可以确认该接口存在且在国服也大量被工具使用。

### 2. 访问方式与认证

- **默认监听地址**：`https://127.0.0.1:2999`
- **路径前缀**：`/liveclientdata`
- **认证**：无（不需要 Token、Cookie）
  - 但只监听 `127.0.0.1`，外部主机无法直接访问。
- **TLS**：使用自签名证书，需要关闭证书校验或手动信任。

示例（获取全部对局数据）：

```bash
curl -k "https://127.0.0.1:2999/liveclientdata/allgamedata"
```

### 3. 核心端点与数据格式

以下为该 API 的常见端点（官方未公开文档，但第三方工具实践表明接口稳定）：

#### 3.1 `/liveclientdata/allgamedata`

- **方法**：`GET`
- **说明**：一次性返回目前所有可用的对局信息（类似聚合视图）。
- **示例返回内容结构**（简化）：

  ```json
  {
    "activePlayer": { /* 当前玩家的详细状态 */ },
    "allPlayers": [ /* 所有 10 位玩家的简要状态 */ ],
    "events": { "Events": [ /* 事件列表 */ ] },
    "gameData": {
      "gameTime": 1234.56,
      "gameMode": "CLASSIC",
      "mapName": "Summoner's Rift"
    }
  }
  ```

#### 3.2 `/liveclientdata/activeplayer`

- **方法**：`GET`
- **说明**：当前玩家的状态（血量、蓝量、金币、经验、BUFF 等）。

  返回示例（字段示意）：

  ```json
  {
    "championName": "Ahri",
    "currentGold": 1200,
    "summonerName": "SomeSummoner",
    "level": 12,
    "scores": { "kills": 5, "deaths": 2, "assists": 3 },
    "abilities": { /* Q/W/E/R 冷却和等级 */ },
    "items": [ /* 装备列表 */ ]
  }
  ```

#### 3.3 `/liveclientdata/playerlist`

- **方法**：`GET`
- **说明**：10 名玩家的列表+简要信息（名称、英雄、队伍）。

#### 3.4 `/liveclientdata/playerscores?summonerName=<name>`

- **方法**：`GET`
- **说明**：某个玩家的 KDA、补刀、经济等分数信息。

#### 3.5 `/liveclientdata/gamestats`

- **方法**：`GET`
- **说明**：全局对局状态（时间、模式、地图、蓝红方状态等）。

#### 3.6 `/liveclientdata/eventdata` 或 `/liveclientdata/events`

- **方法**：`GET`
- **说明**：从对局开始到当前为止的事件列表。事件项常见字段：

  ```json
  {
    "EventName": "ChampionKill",
    "EventID": 37,
    "EventTime": 615.3,
    "KillerName": "SomeSummoner",
    "VictimName": "OtherSummoner",
    "Assisters": [ "Ally1", "Ally2" ]
  }
  ```

---

### 4. 典型应用场景

- **战绩 Overlay / 实时看板**：
  - 实时显示血量、蓝量、技能冷却、经济差等。
- **自动录像标记**：
  - 通过事件接口在击杀、龙/男爵处插入时间点，方便后期剪辑。
- **战术分析工具**：
  - 收集对局内数据，赛后分析走位、团战时机、资源控制等。

---

### 5. 使用限制与风险

- **仅限当前对局**：
  - API 在游戏运行时开放，离开对局后端口关闭。
- **无认证但仅本地可见**：
  - 任何本机进程只要知道接口即可访问当前对局详细数据。
  - 若存在恶意程序，理论上可泄露你的对局数据（战术信息、阵容等）。
- **性能影响**：
  - 频繁高频调用（例如每帧多次请求）可能对游戏产生轻微性能影响，应做合理节流（例如 100~200ms 一次）。
- **协议风险**：
  - 同样属于非公开接口，若用于外挂或不当用途仍有可能被视作违规。

---

## 三、Riot Client / 腾讯平台远程接口

当前目录的一些配置/日志反映了游戏与腾讯后台的远程接口交互（不在本地 API 范畴，但与整体链路密切相关）：

- `LeagueClient/system.yaml` 中的 `region_data.TENCENT`：
  - `voice.access_token_uri: https://live-vts.lol.qq.com:18088/vts/v1/access_token`
  - `voice.auth_token_uri: https://live-vts.lol.qq.com:18088/vts/v1/auth_token`
  - `jwt2gvt_url: https://api.gcloud.qq.com/lol/v1/jwt2gvt`
- `LeagueClientUx.log` 中的参数：
  - `--t.lcdshost=hn10-k8s-feapp.lol.qq.com`
  - `--t.chathost=hn10-k8s-ejabberd.lol.qq.com`
  - `--entitlements-url=https://hn10-k8s-entitlements.lol.qq.com:28088/api/token/v1`
  - `--rso-auth.url=https://prod-rso.lol.qq.com:3000`
- `Riot Client/config.json` 中的 GCloud Voice 配置：  
  指向 `idcconfig.gcloudsdk.com`、`harmony.voice.gcloudsdk.com` 等。

**这些远程接口特点：**

- **完全由官方客户端控制**，第三方程序不应直接调用。
- 涉及：
  - RSO 登录票据（`rso-auth`）
  - 权限与资产（`entitlements`）
  - 语音服务（GCloud Voice）
  - 商城、活动、战绩等 Web 服务。
- 在国服环境中通常通过 HTTPS 和 WebSocket 与腾讯自有服务通信（域名多为 `lol.qq.com` / 各种 `*.lol.qq.com`）。

对普通开发者而言：

- 重点关注 **本地 LCU + Live Client Data** 即可。
- 远程接口应视为 **黑盒**，避免自行模拟调用，以免触碰风控/协议红线。

---

## 四、从当前目录中可以印证的关键信息

为避免“纸上谈兵”，这里直接对照当前安装目录中的文件，列出支撑本说明的要点（不包含任何敏感值）：

- `Riot Client/system.yaml`
  - `partner_product.arguments` 中明确存在 `--riotclient-auth-token` / `--riotclient-app-port` 传入 `LeagueClient.exe`。
- `LeagueClient/system.yaml`
  - `app.app_name: LeagueClient`
  - `local_settings_file: Config/LeagueClientSettings.yaml`
  - `log_dir: LeagueClient Logs`，对应大量 `LeagueClientUx.log`、`debug.log`。
- `LeagueClient/Config/LeagueClientSettings.yaml`
  - 包含 `globals.locale`, `globals.region=TENCENT` 等安装级配置。
- `LeagueClient/lockfile` / `lockfile_`
  - 虽然当前为空，但文件名与典型 LCU 行为一致，用作端口/密码共享。
- `LeagueClient/2025-10-17T19-48-29_17588_LeagueClientUx.log`
  - 启动参数中含 `--remoting-auth-token` 与 `--app-port`。
  - 日志中有：

    ```text
    Creating ux window with url https://riot:<token>@127.0.0.1:57243/bootstrap.html
    ```

    直接证明 LCU 在本地通过 Basic Auth + HTTPS 提供服务。
- `LeagueClient/debug.log`
  - 包含对多个 LCU 端点的实际调用记录，例如：
    - `/lol-lobby/v2/lobby`
    - `/lol-chat/v1/conversations/.../messages`
    - `/lol-summoner/v1/current-summoner/profile-privacy`
    - WebSocket 事件：`uri: /lol-champ-select/v1/summoners/0` 等。
- `Game/Logs/GameLogs/*`
  - 大量对局日志和网络统计文件，虽未直接出现 `/liveclientdata` 字样，但其存在证明游戏层有自己的网络服务逻辑，与 Live Client Data API 的默认行为相吻合。

---

## 五、实战建议与开发注意事项

- **推荐使用方式**：
  - 工具类、数据分析类应用，优先使用：
    - LCU API（账户、房间、选人、战绩、聊天）
    - Live Client Data API（对局内状态）
  - 通过 `lockfile` 自动发现端口与密码，避免硬编码。
- **避免的行为**：
  - 自动化控制（自动接受对局、自动补位、自动聊天）。
  - 试图伪造/重放远程平台票据（RSO、entitlements 等）。
- **技术实现要点**：
  - 所有本地 HTTPS 调用都需要关闭 CA 校验或导入自签名证书。
  - 注意做合理节流，避免高频轮询导致性能问题。
  - 对 JSON 结构要容错（字段新增/删除/重命名在版本更新中时常发生）。
- **安全建议**：
  - 监控和限制本机上能读取 `LeagueClient/lockfile` 和 `LeagueClientUx.log` 的程序，避免 Token 被其它软件滥用。
  - 不在日志中记录完整的 LCU Token、端口等敏感信息。

---

如果你需要，我可以在这份文档的基础上再单独整理一份「接口速查表」Markdown（只列 URI、方法、用途），或者帮你写一个读取 `lockfile` 并封装 LCU 请求的本地脚本模板（Node.js / Python / Go 均可）。
