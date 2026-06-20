# LOL 助手 API 文档

基于实际逆向 + curl 验证的国服（腾讯服）LCU/SGP 接口文档。
所有端点均经实测确认可用（2026-06 国服 HN10 黑色玫瑰）。

---

## 一、认证链路

### 1.1 LCU 凭证（本地，第一层）

| 项 | 说明 |
|---|---|
| 来源 | `LeagueClientUx.log` 的 `--app-port` 和 `--remoting-auth-token` |
| 地址 | `https://127.0.0.1:{app-port}` |
| 认证 | HTTP Basic Auth，用户名固定 `riot`，密码 = `remoting-auth-token` |
| 证书 | 自签名，必须 `rejectUnauthorized: false` |
| 有效期 | 客户端单次运行期间稳定，重启后变化 |

**国服关键发现**：lockfile 为空（国际服才有内容），必须从日志解析。

### 1.2 Entitlements Token（云端，第二层）

| 项 | 说明 |
|---|---|
| 获取方式 | 用 LCU 凭证请求 `GET /entitlements/v1/token` |
| 格式 | JWT（`eyJ...` 开头，约 1030 字符，Riot 签发） |
| 用途 | 作为 Bearer token 请求腾讯 SGP 云端战绩 |
| 有效期 | 较长（JWT 自带过期时间） |

### 1.3 完整认证流程

```
1. 读 LeagueClientUx.log → 拿 LCU port + remoting-auth-token
2. LCU Basic Auth 请求 https://127.0.0.1:{port}/entitlements/v1/token
   → 返回 accessToken（JWT）
3. 用 accessToken 作为 Bearer 请求 SGP 云端接口
```

---

## 二、SGP 云端战绩接口（核心）

SGP（Service Gateway Platform）是腾讯云端战绩数据库，能查完整历史（不受 LCU 21 场缓存限制）。

### 2.1 战绩列表（含完整 10 人详情）

```
GET https://{大区域名}:21019/match-history-query/v1/products/lol/player/{puuid}/SUMMARY
    ?startIndex={偏移}&count={条数}&tag={模式筛选}

Header: Authorization: Bearer {entitlements_token}
```

| 参数 | 说明 |
|---|---|
| `puuid` | 玩家全局唯一 ID |
| `startIndex` | 分页起点（0/100/200...），翻页用 |
| `count` | 本次拉取条数，上限 100 |
| `tag` | 可选，模式筛选：`q_420` 单排 / `q_440` 灵活 / `q_450` 大乱斗 / `q_2400` 海克斯大乱斗 / `q_490` 快速 / `q_1700` 竞技场 |

**返回结构**：
```json
{
  "games": [
    {
      "metadata": { "match_id": "HN10_8843193220", "participants": ["puuid1", ...] },
      "json": {
        "gameId": 8843193220,
        "queueId": 2400,
        "gameMode": "KIWI",
        "gameCreation": 1781954245050,
        "gameDuration": 922,
        "participants": [...10人],
        "teams": [...2队]
      }
    }
  ]
}
```

**单次 SUMMARY 返回的数据是完整的**——10 人 participants 含全部字段（KDA/装备/伤害/符文等），不需要单独请求详情。

### 2.2 国服大区 SGP 域名（27 个）

| 大区码 | 名称 | 域名 |
|---|---|---|
| HN1 | 艾欧尼亚 | hn1-k8s-sgp.lol.qq.com:21019 |
| HN2 | 祖安 | hn2-k8s-sgp.lol.qq.com:21019 |
| HN3 | 诺克萨斯 | hn3-k8s-sgp.lol.qq.com:21019 |
| HN4 | 班德尔城 | hn4-k8s-sgp.lol.qq.com:21019 |
| HN5 | 皮尔特沃夫 | hn5-k8s-sgp.lol.qq.com:21019 |
| HN6 | 战争学院 | hn6-k8s-sgp.lol.qq.com:21019 |
| HN7 | 巨神峰 | hn7-k8s-sgp.lol.qq.com:21019 |
| HN8 | 雷瑟守备 | hn8-k8s-sgp.lol.qq.com:21019 |
| HN9 | 裁决之地 | hn9-k8s-sgp.lol.qq.com:21019 |
| HN10 | 黑色玫瑰 | hn10-k8s-sgp.lol.qq.com:21019 |
| HN11 | 暗影岛 | hn11-k8s-sgp.lol.qq.com:21019 |
| HN12 | 钢铁烈阳 | hn12-k8s-sgp.lol.qq.com:21019 |
| HN13 | 水晶之痕 | hn13-k8s-sgp.lol.qq.com:21019 |
| HN14 | 均衡教派 | hn14-k8s-sgp.lol.qq.com:21019 |
| HN15 | 扭曲丛林 | hn15-k8s-sgp.lol.qq.com:21019 |
| HN16 | 教育网专区 | hn16-k8s-sgp.lol.qq.com:21019 |
| HN17 | 蛮荒之地 | hn17-k8s-sgp.lol.qq.com:21019 |
| HN18 | 恕瑞玛 | hn18-k8s-sgp.lol.qq.com:21019 |
| HN19 | 皮城警备 | hn19-k8s-sgp.lol.qq.com:21019 |
| BGP1 | 男爵领域 | bgp1-sgp.lol.qq.com:21019 |
| BGP2 | 峡谷之巅 | bgp2-k8s-sgp.lol.qq.com:21019 |
| WT1 | 网通一区 | wt1-k8s-sgp.lol.qq.com:21019 |
| NJ100 | 联盟一区 | nj100-sgp.lol.qq.com:21019 |
| GZ100 | 联盟二区 | gz100-sgp.lol.qq.com:21019 |
| CQ100 | 联盟三区 | cq100-sgp.lol.qq.com:21019 |
| TJ100 | 联盟四区 | tj100-sgp.lol.qq.com:21019 |
| TJ101 | 联盟五区 | tj101-sgp.lol.qq.com:21019 |

**大区隔离**：puuid 只存在于玩家注册的大区，用错大区域名返回空数组。

---

## 三、LCU 本地接口

### 3.1 按 Riot ID 查召唤师（名字→puuid）

```
GET https://127.0.0.1:{port}/lol-summoner/v1/summoners?name={完整RiotID编码}
Header: Basic Auth (riot:token)
```

**关键**：必须传**完整 Riot ID**（`游戏名#数字`），`#` 编码为 `%23`。
- ✅ `?name=小猫猫拳%2346662` → 成功返回 puuid
- ❌ `?name=小猫猫拳`（只传 gameName）→ 422 失败

**限制**：只能查本大区玩家，跨大区返回 404。

### 3.2 当前登录账号

```
GET https://127.0.0.1:{port}/lol-summoner/v1/current-summoner
```

返回：gameName / displayName / puuid / summonerLevel / profileIconId / tagLine

**国服**：名字在 `gameName`（`displayName` 为空），tagLine 在 `tagLine`。

### 3.3 按 puuid 查召唤师（任意玩家）

```
GET https://127.0.0.1:{port}/lol-summoner/v2/summoners/puuid/{puuid}
```

返回该 puuid 的 gameName / puuid / level 等。可用于从战绩参与者反查名字。

### 3.4 按 summonerId 查（数字 ID）

```
GET https://127.0.0.1:{port}/lol-summoner/v1/summoners/{summonerId}
```

summonerId 是纯数字（如 18134172744），可查任何同大区玩家。

### 3.5 大区码来源

日志启动参数 `--t.location=loltencent.gz2.HN10`，最后一段是大区码（HN10）。

---

## 四、Participant 字段清单（SGP SUMMARY）

每场对局的 `json.participants[]` 含 10 人，每人字段扁平在顶层（不是嵌套在 stats）。

### 核心字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `puuid` | string | 全局唯一 ID |
| `riotIdGameName` | string | 游戏名（如"充实自己"） |
| `riotIdTagline` | string | 标签（如"36371"） |
| `championId` | number | 英雄 ID |
| `championName` | string | 英雄名（SGP 直出，如"Morgana"） |
| `champLevel` | number | 结束时等级 |
| `teamId` | number | 阵营（100 蓝 / 200 红） |
| `kills/deaths/assists` | number | KDA |
| `win` | boolean | 胜负 |
| `totalDamageDealtToChampions` | number | 对英雄总伤害 |
| `totalMinionsKilled` | number | 兵线补刀 |
| `neutralMinionsKilled` | number | 野怪补刀 |
| `goldEarned` | number | 获得金币 |
| `item0~item6` | number | 装备 ID（7 格含饰品） |
| `spell1Id/spell2Id` | number | 召唤师技能 ID |
| `visionScore` | number | 视野分 |
| `profileIcon` | number | 召唤师头像 ID |

### 多杀字段

| 字段 | 说明 |
|---|---|
| `doubleKills` | 双杀 |
| `tripleKills` | 三杀 |
| `quadraKills` | 四杀 |
| `pentaKills` | 五杀 |
| `largestMultiKill` | 最大多杀 |
| `largestKillingSpree` | 最大连杀（≥7 = 超神） |
| `firstBloodKill` | 一血 |
| `firstTowerKill` | 一塔 |

### 符文字段（perks 对象）

```json
{
  "perks": {
    "statPerks": { "defense": 5011, "flex": 5008, "offense": 5005 },
    "styles": [
      {
        "description": "primaryStyle",
        "style": 8000,           // 主系系别 ID（精密）
        "selections": [
          { "perk": 8010, ... }  // 基石符文（征服者）
        ]
      },
      {
        "description": "subStyle",
        "style": 8300,           // 副系系别 ID（启迪，不在 datas.json 里）
        "selections": [
          { "perk": 8321, ... }  // 副系第一个符文（返现）
        ]
      }
    ]
  }
}
```

**注意**：副系用 `selections[0].perk`（具体符文 ID），不能用 `style`（系别 ID 如 8300 不在 datas.json 里）。
大乱斗(KIWI)模式 perks 全为 0（无符文）。

### Challenges（高级数据，120+ 字段）

| 字段 | 说明 |
|---|---|
| `acesBefore15Minutes` | 15分钟前团灭参与数 |
| `flawlessAces` | 完美团灭（无人阵亡） |
| `teamDamagePercentage` | 伤害占团队比例 |
| `damageTakenOnTeamPercentage` | 承伤占团队比例 |
| `goldPerMinute` | 每分钟金币 |
| `damagePerMinute` | 每分钟伤害 |

---

## 五、Teams 字段

```json
{
  "teams": [
    {
      "teamId": 100,
      "win": "Win",
      "objectives": {
        "baron": { "first": false, "kills": 0 },
        "dragon": { "first": false, "kills": 0 },
        "tower": { "first": true, "kills": 4 },
        "inhibitor": { "first": true, "kills": 1 },
        "riftHerald": { "first": false, "kills": 0 },
        "horde": { "first": false, "kills": 0 },
        "champion": { "first": false, "kills": 50 }
      },
      "bans": []
    }
  ]
}
```

---

## 六、queueId 模式映射

| queueId | 名称 |
|---|---|
| 420 | 单双排位 |
| 440 | 灵活组排 |
| 450 | 极地大乱斗 |
| 490 | 快速模式 |
| 2400 | 海克斯大乱斗（KIWI） |
| 1700 | 斗魂竞技场 |
| 400/430 | 匹配模式 |

SGP tag 格式：`q_{queueId}`（如 `q_420` = 单排）。

---

## 七、国服限制（实测）

| 限制 | 说明 |
|---|---|
| lockfile 为空 | 国际服才有内容，国服必须从日志解析 |
| `?name=` 只查本大区 | 跨大区返回 404 |
| SGP 按名查被 403 | summoner-ledge/riot-id 端点全部 Forbidden |
| SGP 大区隔离 | puuid 只在注册大区有数据，用错域名返回空 |
| 双排信息不暴露 | playerSubteamId 永远 0（隐私保护） |
| LCU 战绩缓存 ~21 场 | 必须走 SGP 才能查完整历史 |
| SGP 单次上限 100 场 | 翻页用 startIndex 偏移 |

---

## 八、项目架构映射

| 项目文件 | 职责 |
|---|---|
| `src/main/lcu/lockfile.ts` | 凭证获取（日志解析 + 缓存） |
| `src/main/lcu/client.ts` | LCU HTTPS 客户端（Basic Auth） |
| `src/main/sgp/auth.ts` | SGP 认证（entitlements token + 大区码） |
| `src/main/sgp/client.ts` | SGP HTTPS 客户端（Bearer Auth） |
| `src/main/sgp/region.ts` | 27 大区域名映射 |
| `src/main/match/matchService.ts` | 战绩查询服务（按 Riot ID → puuid → SGP 查战绩） |
| `src/main/match/matchMapper.ts` | SGP 响应 → 前端结构（字段映射） |
| `src/main/match/queueNames.ts` | queueId → 中文模式名 |
| `src/main/lcu/heroData.ts` | 英雄/装备/技能/符文 ID→名字+图标（来自 datas.json） |
