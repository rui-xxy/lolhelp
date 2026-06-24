# LCU / SGP 端点完整数据档案

> 国服（腾讯服）LOL 客户端可用的本地 API 端点字典。
> 每个端点记录：完整路径、HTTP 方法、认证方式、入参、响应字段结构，并标注项目当前使用状态。
>
> 状态图例：✅ 已用 ｜ ⚠️ 未挖掘（响应里有但项目没用）｜ ❌ 国服禁用（403）
>
> 最后实测：2026-06（客户端版本 16.x，HN10 大区）

---

## 一、认证机制

本项目同时使用两套独立的本地 API，认证方式完全不同：

| 维度 | SGP（云端战绩库） | LCU（本地客户端） |
|---|---|---|
| 地址 | `https://{大区域名}:21019` | `https://127.0.0.1:{动态端口}` |
| 认证 | `Authorization: Bearer {entitlements JWT}` | HTTP Basic Auth `riot:{token}` |
| 证书 | 腾讯自签名（`rejectUnauthorized:false`） | 自签名（`rejectUnauthorized:false`） |
| token 来源 | LCU `/entitlements/v1/token` 的 `accessToken` | lockfile 或 `LeagueClientUx.log` 解析 |
| 能查别人？ | ✅ 是（战绩/挑战/段位等） | ⚠️ 多数只能查自己 |
| 缓存 | 5 分钟（`sgp/auth.ts` `SGP_AUTH_TTL`） | 30 秒（`lockfile.ts` `CREDS_CACHE_TTL`） |

### SGP 认证链（`src/main/sgp/auth.ts`）
1. `getCachedCredentials()`（lockfile.ts）读 `LeagueClientUx.log` → 拿 LCU port/token
2. LCU `GET /entitlements/v1/token` → 拿 `accessToken`（JWT）
3. LCU `GET /lol-summoner/v1/current-summoner` → 拿当前账号 `puuid`
4. 日志正则 `--t.location=loltencent.gz2.HN10` → 拿大区码
5. 组装 `SgpAuth{ accessToken, region, puuid }`

### 大区码 → 域名映射（`src/main/sgp/region.ts`）
27 个国服大区，格式 `https://{code}-k8s-sgp.lol.qq.com:21019`。常用：
- `HN10` → `hn10-k8s-sgp.lol.qq.com`（艾欧尼亚/黑色玫瑰等）
- `HN1` → `hn1-k8s-sgp.lol.qq.com`
- `TJ100` → `tj100-sgp.lol.qq.com`
- `GZ100` / `CQ100` / `NJ100` / `BGP1`（峡谷之巅）等

### 客户端方法边界
- **`SgpClient`**（`src/main/sgp/client.ts`）：仅 `get(path, params?)` 和 `post(path, body?, params?)`。固定 port 21019。
- **`LcuClient`**（`src/main/lcu/client.ts`）：`get` / `put` / `patch` / `post` 四方法，统一走 `request()` 底层。hostname 固定 `127.0.0.1`。

---

## 二、SGP 端点（能查别人）

### 2.1 ✅ 战绩列表（核心）

| 项 | 值 |
|---|---|
| 路径 | `/match-history-query/v1/products/lol/player/{puuid}/SUMMARY` |
| 方法 | GET |
| 认证 | Bearer JWT |
| 入参 | `startIndex`（偏移，0/100/…）、`count`（1~100）、可选 `tag`（模式：`q_420`单双排/`q_440`灵活/`q_450`大乱斗/`q_490`快速等） |
| 单次上限 | 100 场 |
| 重试 | 401/403 自动 `invalidateSgpAuth` 重试一次（`matchService.ts` `requestWithRetry`） |
| 代码位置 | `matchService.ts:529-533`、`matchService.ts:663-667`（scout 复用） |

**响应顶层**：`{ games: SgpGame[] }`，每个 `SgpGame = { metadata, json }`。

#### game.json 顶层字段（实测 18 个）
| 字段 | 含义 | 状态 |
|---|---|---|
| `gameId` | 对局 ID | ✅ → `PlayerMatchDetail.gameId` |
| `queueId` | 队列 ID（模式） | ✅ → `queueName`（经 `queueNames.ts` 转中文） |
| `gameCreation` | 创建时间（毫秒戳） | ✅ |
| `gameDuration` | 时长（秒） | ✅ |
| `gameStartTimestamp` / `gameEndTimestamp` | 开始/结束时间（毫秒戳） | ⚠️ |
| `gameMode` | 模式名（如 CLASSIC） | ⚠️ 声明未读 |
| `gameModeMutators` | 模式变体（数组，如某些特殊规则模式非空） | ⚠️ 实测多数为 `[]` |
| `gameName` | 自定义房名 | ⚠️ |
| `gameType` | 游戏类型（如 MATCHED_GAME） | ⚠️ |
| `gameVersion` | 客户端版本（如 "15.x"） | ⚠️ |
| `mapId` | 地图 ID（11=召唤师峡谷） | ⚠️ |
| `seasonId` | 赛季 ID | ⚠️ |
| `platformId` | 平台/大区 ID | ⚠️ |
| `tournamentCode` | 赛事代码（自定义赛事用，正常空） | ⚠️ |
| `endOfGameResult` | 结算状态（如 "GameComplete"） | ⚠️ |
| `participants` | 10 人详情 | ✅（见下表） |
| `teams` | 团队级数据 | ⚠️ **完全未挖掘**（见下） |

#### game.json.metadata（实测 3 个字段）
| 字段 | 含义 | 状态 |
|---|---|---|
| `product` | 产品（"lol"） | ⚠️ |
| `tags` | 标签数组（如 `["normal","q_2400"]`，可判断模式） | ⚠️ |
| `participants` | 10 人 puuid 列表（按 participantId 顺序） | ⚠️（项目声明未读） |

#### ⚠️ teams[]（团队统计，完全未挖掘）
每个 team 含 4 个字段：

| 字段 | 含义 | 状态 |
|---|---|---|
| `teamId` | 队伍（100/200） | ⚠️ |
| `win` | 这队是否赢 | ⚠️ |
| `bans[]` | ban 的英雄列表（竞技场/排位） | ⚠️ |
| `objectives` | 团队目标统计（见下） | ⚠️ |

**teams[].objectives 完整字段**（实测）：
| 字段 | 含义 |
|---|---|
| `baron.first` / `baron.kills` | 首杀男爵 / 男爵击杀数 |
| `dragon.first` / `dragon.kills` | 首龙 / 龙击杀数 |
| `atakhan.first` / `atakhan.kills` | 阿塔坎（新史诗怪）首杀/击杀 |
| `horde.first` / `horde.kills` | 虚空虫群首杀/击杀 |
| `riftHerald.first` / `riftHerald.kills` | 峡谷先锋 |
| `tower.first` / `tower.kills` | 首塔 / 塔击杀数 |
| `inhibitor.first` / `inhibitor.kills` | 首水晶 / 水晶击杀数 |
| `champion.first` / `champion.kills` | 首杀 / 击杀数 |

> 类型声明于 `matchMapper.ts:92-96` `SgpTeam`，但 `extractMatchDetail` 从未读取。这些能做"团队资源控制统计""团队经济对比"。

#### participant[] 字段（单人，150+ 个）

**身份**
| 字段 | 含义 | 状态 |
|---|---|---|
| `puuid` | 玩家 puuid | ✅ |
| `summonerId` | 召唤师 ID | ✅ |
| `summonerName` | 召唤师名 | ✅（兜底 riotId） |
| `summonerLevel` | 当时的等级 | ⚠️ 声明未读 |
| `riotIdGameName` / `riotIdTagline` | Riot ID 名/标签 | ✅ |
| `profileIcon` | 头像 ID | ✅ |
| `participantId` | 参与者序号 | ✅ |
| `PlayerBehavior` | 玩家行为标记（如 `{PlayerBehavior_IsHeroInCombat:0}`） | ⚠️ |

**英雄**
| 字段 | 含义 | 状态 |
|---|---|---|
| `championId` | 英雄 ID | ✅ |
| `championName` | 英雄英文名（如 "Vayne"） | ✅ |
| `championTransform` | 变身形态（如乌迪尔） | ⚠️ |
| ~~`skinId` / `championSkinId` / `skinVariant`~~ | ❌ **不存在**（实测 SGP 响应无任何 skin 字段，`matchMapper.ts:210` 的类型声明无效，取值永远 undefined） | ❌ |
| `teamId` | 队伍（100/200） | ✅ |
| `teamPosition` / `role` / `lane` / `individualPosition` | 位置 | ✅（多级兜底取一个） |
| `positionAssignedByMatchmaking` | 匹配系统分配的位置（如 "NONE"/"TOP"） | ⚠️ |
| `selectedRolePreferences` | 选人时填的位置偏好（如 "TOP.JUNGLE.NONE.UNSELECTED"） | ⚠️ |

> **⚠️ 重要：SGP 战绩不返回玩家用的皮肤信息。** 实测 participant 里没有任何 skin 字段，无法知道某局用了什么皮肤。`championSplashUrl`（战绩背景图）因此永远 fallback 到经典原画（`Alias_0.jpg`）。

**KDA / 击杀**
| 字段 | 含义 | 状态 |
|---|---|---|
| `kills` / `deaths` / `assists` | KDA | ✅ + 计算 `kda` |
| `doubleKills` | 双杀 | ⚠️ 声明未读 |
| `tripleKills` / `quadraKills` / `pentaKills` | 三/四/五杀 | ✅ |
| `largestMultiKill` | 最大多杀 | ✅ |
| `largestKillingSpree` | 最大连杀（≥7=超神） | ✅ |
| `killingSprees` | 连杀次数 | ⚠️ |
| `unrealKills` | 超神击杀 | ⚠️ |
| `firstBloodKill` / `firstBloodAssist` | 一血 | ⚠️ |
| `firstTowerKill` / `firstTowerAssist` | 一塔 | ⚠️ |

**伤害（细分全未挖掘）**
| 字段 | 含义 | 状态 |
|---|---|---|
| `totalDamageDealtToChampions` | 对英雄总伤害 | ✅ |
| `totalDamageDealt` | 总输出（含小兵/野怪/英雄） | ⚠️ |
| `totalDamageTaken` | 总承伤 | ⚠️ |
| `magicDamageDealtToChampions` / `physicalDamageDealtToChampions` / `trueDamageDealtToChampions` | 魔/物/真伤（对英雄） | ⚠️ |
| `magicDamageDealt` / `physicalDamageDealt` / `trueDamageDealt` | 魔/物/真伤（总输出，含所有目标） | ⚠️ |
| `magicDamageTaken` / `physicalDamageTaken` / `trueDamageTaken` | 魔/物/真承伤 | ⚠️ |
| `damageSelfMitigated` | 自我减免伤害 | ⚠️ |
| `totalDamageShieldedOnTeammates` | 对队友护盾量 | ⚠️ |
| `damageDealtToBuildings` / `damageDealtToTurrets` / `damageDealtToObjectives` | 建筑/塔/目标伤害 | ⚠️ |
| `damageDealtToEpicMonsters` | 对史诗野怪伤害（龙/男爵等） | ⚠️ |
| `largestCriticalStrike` | 最大暴击伤害 | ⚠️ |

**经济 / 装备**
| 字段 | 含义 | 状态 |
|---|---|---|
| `goldEarned` | 总经济 | ✅ |
| `goldSpent` | 总花费 | ⚠️ |
| `item0` ~ `item6` | 7 格装备（含饰品） | ✅（`collectItems`） |
| `roleBoundItem` | 角色绑定装备（新机制） | ⚠️ |
| `itemsPurchased` / `consumablesPurchased` | 购买次数 | ⚠️ |
| `totalMinionsKilled` / `neutralMinionsKilled` | 补刀/打野怪 | ✅（`calcCs` 合计） |
| `totalAllyJungleMinionsKilled` / `totalEnemyJungleMinionsKilled` | 友/敌方野怪 | ⚠️ |

**视野**
| 字段 | 含义 | 状态 |
|---|---|---|
| `visionScore` | 视野得分 | ✅ |
| `wardsPlaced` / `wardsKilled` | 插/拆眼数 | ⚠️（wardsPlaced 声明未读） |
| `visionWardsBoughtInGame` / `sightWardsBoughtInGame` | 买眼数 | ⚠️ |
| `detectorWardsPlaced` | 控制守卫数 | ⚠️ |

**治疗 / 控制 / 生存**
| 字段 | 含义 | 状态 |
|---|---|---|
| `totalHeal` / `totalHealsOnTeammates` | 总治疗/对队友治疗 | ⚠️ |
| `totalUnitsHealed` | 治疗单位数 | ⚠️ |
| `timeCCingOthers` | 控制他人时长 | ⚠️ |
| `totalTimeCCDealt` | 总控制时长 | ⚠️ |
| `timePlayed` / `longestTimeSpentLiving` / `totalTimeSpentDead` | 游戏时长/最长存活/死亡时长 | ⚠️ |

**等级 / 经验**
| 字段 | 含义 | 状态 |
|---|---|---|
| `champLevel` | 结算等级 | ✅ |
| `champExperience` | 经验值 | ⚠️ |

**技能 / 符文 / 召唤师技能**
| 字段 | 含义 | 状态 |
|---|---|---|
| `spell1Id` / `spell2Id` | D/F 召唤师技能 | ✅（`collectSpells`，判断闪现位置） |
| `spell1Casts` ~ `spell4Casts` | 技能施放次数 | ⚠️ |
| `summoner1Casts` / `summoner2Casts` | 召唤师技能施放次数 | ⚠️ |
| `perks.styles[].description` / `style` / `selections[].perk` | 符文（主副系+基石） | ✅（`collectRunes`） |

**团队 / 推塔 / 史诗野怪**
| 字段 | 含义 | 状态 |
|---|---|---|
| `turretKills` / `turretTakedowns` / `turretsLost` | 塔击杀/参与/丢失 | ⚠️ |
| `inhibitorKills` / `inhibitorTakedowns` / `inhibitorsLost` | 水晶 | ⚠️ |
| `baronKills` / `dragonKills` | 男爵/龙击杀 | ⚠️ |
| `nexusKills` / `nexusTakedowns` / `nexusLost` | 水晶枢纽 | ⚠️ |
| `objectivesStolen` / `objectivesStolenAssists` | 偷龙/男爵 | ⚠️ |

**竞技场/特殊模式**
| 字段 | 含义 | 状态 |
|---|---|---|
| `playerSubteamId` / `subteamPlacement` / `placement` | 竞技场子队/名次 | ⚠️（subteamId 永远 0，隐私） |
| `playerAugment1` ~ `playerAugment6` | 竞技场强化 | ⚠️ |
| `PlayerScore0` ~ `PlayerScore11` | 评分槽位 | ⚠️ |

**比赛结果 / 行为**
| 字段 | 含义 | 状态 |
|---|---|---|
| `win` | 是否获胜 | ✅ |
| `gameEndedInEarlySurrender` / `gameEndedInSurrender` / `gameEndedInIGNBSurrender` | 重开/投降/IGNB 投降 | ⚠️ |
| `teamEarlySurrendered` / `teamIGNBSurrendered` | 我队是否提前投降/IGNB 投降 | ⚠️ |
| `causedGameEndFromIGNBSurrender` | 是否是这个玩家导致 IGNB 投降结束 | ⚠️ |
| `wasSevereTransgressor` | 是否严重违规者 | ⚠️ |
| `wasPremadeWithSevereTransgressor` | 是否和违规者组队 | ⚠️ |
| `eligibleForProgression` | 是否计入段位进度 | ⚠️ |
| `missions` | 本局任务进度（如 `2026_S1A1_Skins_英雄名`） | ⚠️ |

**Ping 信号（14 种，全未挖掘）**
`allInPings` / `assistMePings` / `basicPings` / `commandPings` / `dangerPings` / `enemyMissingPings` / `enemyVisionPings` / `getBackPings` / `holdPings` / `needVisionPings` / `onMyWayPings` / `pushPings` / `retreatPings` / `visionClearedPings` —— 全 ⚠️。

> **⚠️ 关于组队字段**：`matchMapper.ts:126-137` 声明并处理 `premadeId` / `premadeTeamId` / `premadeGroupId` / `partyId` / `groupId`（用于识别双排/组队），但**实测 SGP 响应里这 5 个字段全部不存在**，`normalizePremadeId` 取到的永远是 undefined。国服不暴露真实组队信息（隐私保护），双排识别功能实际无效。
>
> **字段总数**：participant 实测共 **155 个顶层字段**（不含 challenges 嵌套的 120 项）。

#### ⚠️ participant.challenges（嵌套对象，120 项预计算统计，仅用 1 项）
`challenges` 是 Riot 预计算的高级统计对象，含 120 个字段。项目仅用：
- ✅ `teamDamagePercentage` — 伤害占团队比例（高手雷达 MVP 算分用）

**全部 120 个字段（实测真实存在）**：

| 字段 | 含义 | 状态 |
|---|---|---|
| `kda` | Riot 科学计算的综合 KDA（非简单 (K+A)/D） | ⚠️ |
| `killParticipation` | 参团率（0~1，如 0.75 = 75%） | ⚠️ |
| `damagePerMinute` | 每分钟对英雄伤害 | ⚠️ |
| `goldPerMinute` | 每分钟经济 | ⚠️ |
| `damageTakenOnTeamPercentage` | 承伤占团队比例 | ⚠️ |
| `visionScorePerMinute` | 每分钟视野得分 | ⚠️ |
| `skillshotsHit` | 非指向技能命中数 | ⚠️ |
| `skillshotsDodged` | 技能闪避数 | ⚠️ |
| `dodgeSkillShotsSmallWindow` | 短窗口闪避技能数 | ⚠️ |
| `soloKills` | 单杀数（无助攻） | ⚠️ |
| `soloBaronKills` | 单杀男爵 | ⚠️ |
| `baronTakedowns` | 男爵参与击杀 | ⚠️ |
| `dragonTakedowns` | 龙参与击杀 | ⚠️ |
| `elderDragonKillsWithOpposingSoul` | 灵龙击杀 | ⚠️ |
| `elderDragonMultikills` | 远古龙多杀 | ⚠️ |
| `riftHeraldTakedowns` | 峡谷先锋参与 | ⚠️ |
| `teamBaronKills` / `teamElderDragonKills` / `teamRiftHeraldTakes` | 团队级史诗野怪 | ⚠️ |
| `epicMonsterSteals` | 抢龙/男爵 | ⚠️ |
| `epicMonsterStolenWithoutSmite` | 非惩戒抢史诗怪 | ⚠️ |
| `epicMonsterKillsNearEnemyJungler` | 敌方打野附近抢怪 | ⚠️ |
| `epicMonsterKillsWithin30SecondsOfSpawn` | 怪刚出生 30 秒内击杀 | ⚠️ |
| `wardTakedowns` | 在视野内击杀 | ⚠️ |
| `wardTakedownsBefore20M` | 20 分钟前视野击杀 | ⚠️ |
| `wardsGuarded` | 守卫保护次数 | ⚠️ |
| `controlWardsPlaced` | 控制守卫放置数 | ⚠️ |
| `stealthWardsPlaced` | 隐形守卫放置数 | ⚠️ |
| `twoWardsOneSweeperCount` | 一次扫描排两眼 | ⚠️ |
| `takedowns` | 总参与击杀（K+A） | ⚠️ |
| `multikills` | 多杀总数 | ⚠️ |
| `multikillsAfterAggressiveFlash` | 进攻闪现后多杀 | ⚠️ |
| `multiKillOneSpell` | 单技能多杀 | ⚠️ |
| `doubleAces` / `flawlessAces` | 双团灭/完美团灭 | ⚠️ |
| `acesBefore15Minutes` | 15 分钟前团灭对手 | ⚠️ |
| `fullTeamTakedown` | 全队参与击杀 | ⚠️ |
| `outnumberedKills` | 以少打多击杀 | ⚠️ |
| `outnumberedNexusKill` | 多打少时推水晶 | ⚠️ |
| `killedChampTookFullTeamDamageSurvived` | 承受全队伤害存活击杀 | ⚠️ |
| `killAfterHiddenWithAlly` | 隐身配合队友击杀 | ⚠️ |
| `pickKillWithAlly` | 配合队友击杀 | ⚠️ |
| `knockEnemyIntoTeamAndKill` | 把敌人击退进队友击杀 | ⚠️ |
| `immobilizeAndKillWithAlly` | 定身配合击杀 | ⚠️ |
| `enemyChampionImmobilizations` | 定身敌方英雄次数 | ⚠️ |
| `survivedThreeImmobilizesInFight` | 战斗中承受 3 次定身存活 | ⚠️ |
| `survivedSingleDigitHpCount` | 残血（个位数 HP）存活次数 | ⚠️ |
| `tookLargeDamageSurvived` | 承受大量伤害存活 | ⚠️ |
| `saveAllyFromDeath` | 救助队友免死 | ⚠️ |
| `effectiveHealAndShielding` | 有效治疗/护盾量 | ⚠️ |
| `maxKillDeficit` | 最大击杀劣势 | ⚠️ |
| `hadOpenNexus` | 推开水晶枢纽 | ⚠️ |
| `perfectDragonSoulsTaken` | 完美元素龙魂 | ⚠️ |
| `perfectGame` | 完美对局 | ⚠️ |
| `legendaryCount` | 传奇（连杀）次数 | ⚠️ |
| `legendaryItemUsed` | 使用传说装备 | ⚠️ |
| `mejaisFullStackInTime` | 梅贾窃魂卷满层 | ⚠️ |
| `turretTakedowns` / `turretPlatesTaken` | 塔参与/镀层 | ⚠️ |
| `firstTurretKilled` / `takedownOnFirstTurret` | 首塔 | ⚠️ |
| `kTurretsDestroyedBeforePlatesFall` | 镀层前推塔数 | ⚠️ |
| `outerTurretExecutesMin…Before10Minutes` | 10 分钟前外塔 | ⚠️ |
| `turretsTakenWithRiftHerald` | 先锋推塔 | ⚠️ |
| `multiTurretRiftHeraldCount` | 多塔先锋 | ⚠️ |
| `quickFirstTurret` / `quickSoloKills` / `quickCleanse` | 快速首塔/单杀/净化 | ⚠️ |
| `laneMinionsFirst10Minutes` | 10 分钟兵线补刀 | ⚠️ |
| `jungleCsBefore10Minutes` | 10 分钟打野补刀 | ⚠️ |
| `twentyMinionsIn3SecondsCount` | 3 秒补 20 刀 | ⚠️ |
| `alliedJungleMonsterKills` / `enemyJungleMonsterKills` | 友/敌方野怪击杀 | ⚠️ |
| `initialBuffCount` / `initialCrabCount` | 初始 buff/河蟹 | ⚠️ |
| `scuttleCrabKills` | 河蟹击杀 | ⚠️ |
| `voidMonsterKill` | 虚空生物击杀 | ⚠️ |
| `poroExplosions` | 布隆的魄罗爆炸（嚎哭深渊） | ⚠️ |
| `snowballsHit` | 雪球命中（大乱斗） | ⚠️ |
| `killsOnRecentlyHealedByAramPack` | 大乱斗治疗包击杀 | ⚠️ |
| `blastConeOppositeOpponentCount` | 爆裂果实用法 | ⚠️ |
| `dancedWithRiftHerald` | 与先锋跳舞 | ⚠️ |
| `fistBumpParticipation` | 拳击（友好互动） | ⚠️ |
| `unseenRecalls` | 隐身回城 | ⚠️ |
| `takedownsInAlcove` / `takedownsInEnemyFountain` | 凹槽/敌方泉水击杀 | ⚠️ |
| `killsNearEnemyTurret` / `killsUnderOwnTurret` | 敌塔/己塔附近击杀 | ⚠️ |
| `killsOnOtherLanesEarlyJungleAsLaner` / `getTakedownsInAllLanesEarlyJungleAsLaner` | 线上英雄早期游走 | ⚠️ |
| `takedownsBeforeJungleMinionSpawn` / `takedownsFirstXMinutes` | 野怪前/前 X 分钟击杀 | ⚠️ |
| `takedownsAfterGainingLevelAdvantage` | 等级优势后击杀 | ⚠️ |
| `landSkillShotsEarlyGame` | 早期技能命中 | ⚠️ |
| `junglerTakedownsNearDamagedEpicMonster` | 打野在受损史诗怪附近击杀 | ⚠️ |
| `killsWithHelpFromEpicMonster` | 史诗怪助攻击杀 | ⚠️ |
| `deathsByEnemyChamps` | 被敌方英雄击杀数 | ⚠️ |
| `bountyGold` | 悬赏金币 | ⚠️ |
| `gameLength` | 游戏时长 | ⚠️ |
| `abilityUses` | 技能使用总数 | ⚠️ |
| `killingSprees` | 连杀次数 | ⚠️ |
| `shortestTimeToAceFromFirstTakedown` | 最快团灭时间 | ⚠️ |
| `12AssistStreakCount` | 12 连助 | ⚠️ |
| `HealFromMapSources` / `InfernalScalePickup` | 地图治疗/地狱火鳞 | ⚠️ |
| `lostAnInhibitor` | 丢水晶 | ⚠️ |
| `SWARM_*`（12 项） | 绒毛/星之守护者 PvE 模式统计 | ⚠️ |
| `teamDamagePercentage` | 伤害占团队比例 | ✅ |
| `moreEnemyJungleThanOpponent` | 入侵野区多于对手 | ⚠️ |

> 类型声明 `matchMapper.ts:79-82` 用 `[k:string]: unknown` 兜底。**注**：`crowdControlTime`（控制时长）和 `carryScore`（carry 评分）**实测不存在**——这两个字段在 SGP 响应里没有，不要引用。

---

### 2.2 ✅ 挑战 / 游戏资产（能查别人）

| 项 | 值 |
|---|---|
| 路径 | `/challenges-client/v2/all-player-data` |
| 方法 | **POST**（注意不是 GET） |
| 认证 | Bearer JWT |
| 入参 | query `puuid={玩家puuid}`，body `[]`（空数组） |
| 能查别人？ | ✅ 是（传任意 puuid） |
| 代码位置 | `matchService.ts:225-229` `fetchCollectionCounts` |

**响应顶层字段**
| 字段 | 含义 | 状态 |
|---|---|---|
| `puuid` | 玩家 puuid | ✅ |
| `totalPoints` | 总挑战点数 `{level, current, max, percentile}` | ⚠️ 未用（玩家含金量） |
| `categoryPoints` | 5 大分类点数（每类含 level/current/max/percentile） | ⚠️ **未用（实力雷达图数据）** |
| `levelPoints` | 各等级对应的点数映射表 | ⚠️ |
| `playerChallenges[]` | 405 个挑战详情 | ✅（仅取 currentValue） |
| `preferences` | 挑战偏好（bannerAccent/title/crestBorder） | ⚠️ |
| `apexLaderUpdateTime` | 巅峰榜更新时间 | ⚠️ |

**categoryPoints 的 5 大分类**（雷达图维度）：
```
IMAGINATION（想象力）  EXPERTISE（专精）  TEAMWORK（团队协作）
VETERANCY（老练）      COLLECTION（收藏）
```
每个含 `{level: "DIAMOND", current, max, percentile}`。

**已破解的 challenge id → 收藏字段映射**（`matchService.ts:206-213`）：
| challenge id | 含义 | 项目状态 |
|---|---|---|
| `505001` | 拥有英雄数 | ✅ → championCount |
| `510001` | 拥有皮肤数 | ✅ → skinCount |
| `510011` | 拥有炫彩数 | ⚠️ 预留未展示 |
| `504002` | 召唤师图标数 | ⚠️ 未用 |
| `504003` | 守卫皮肤数 | ⚠️ 未用 |
| `504004` | 表情数 | ⚠️ 未用 |

**playerChallenges[] 每项字段**
`{ id, category, legacy, percentile, initValue, currentLevel, currentValue, currentThreshold, currentLevelAchievedTime, nextLevel, nextThreshold }`

`currentLevel` 取值：`NONE / IRON / BRONZE / SILVER / GOLD / PLATINUM / DIAMOND / MASTER / GRANDMASTER / CHALLENGER`

> 405 个 challenge 里还有海量成就数据（击杀累计、英雄海、S+ 评级数等），id 可通过 LCU `/lol-game-data/assets/v1/challenges.json`（406 项配置，用 name 作主键）反查含义。

---

### 2.3 ✅ 段位统计（SGP，能查别人）

| 项 | 值 |
|---|---|
| 路径 | `/leagues-ledge/v2/rankedStats/puuid/{puuid}` |
| 方法 | GET |
| 认证 | Bearer JWT |
| 能查别人？ | ✅ 是 |
| 注意 | 项目段位实际走 LCU（见 3.2），此 SGP 端点未在项目使用，但能查别人 |

**响应顶层字段**
| 字段 | 含义 | 状态 |
|---|---|---|
| `queues[]` | 各队列段位详情 | ⚠️ 项目未用（走 LCU） |
| `highestPreviousSeasonEndTier` | 历史最高结算段位 | ⚠️ |
| `highestPreviousSeasonEndRank` | 历史最高结算级位 | ⚠️ |
| `highestPreviousSeasonAchievedTier` | 上赛季达成段位 | ⚠️ |
| `highestPreviousSeasonAchievedRank` | 上赛季达成级位 | ⚠️ |
| `earnedRegaliaRewardIds[]` | 已获段位奖励 | ⚠️ |
| `splitsProgress` | 赛段进度 | ⚠️ |
| `seasons` | 各模式赛季信息（含 currentSeasonId/End） | ⚠️ |

**queues[] 每项字段**
```
queueType, provisionalGameThreshold, tier, rank, leaguePoints, cumulativeLp,
wins, losses, currentSeasonWinsForRewards, previousSeasonWinsForRewards,
provisionalGamesRemaining, highestTier, highestRank,
previousSeasonEndTier, previousSeasonEndRank,
previousSeasonHighestTier, previousSeasonHighestRank,
previousSeasonAchievedTier, previousSeasonAchievedRank, ratedRating...
```
> 比 LCU 段位端点字段更全（含历史最高、cumulativeLp 累计胜点等）。

---

### 2.4 ✅ 召唤师档案（SGP，能查别人）

| 项 | 值 |
|---|---|
| 路径 | `/summoner-ledge/v1/regions/{大区小写}/summoners/puuid/{puuid}` |
| 方法 | GET |
| 认证 | Bearer JWT |
| 入参 | 大区小写（如 `hn10`）、puuid |
| 能查别人？ | ✅ 是 |

**响应字段**
| 字段 | 含义 | 状态 |
|---|---|---|
| `id` / `accountId` | 召唤师 ID | ⚠️ |
| `puuid` | puuid | ⚠️ |
| `name` / `internalName` | 名字（国服常空） | ⚠️ |
| `profileIconId` | 头像 ID | ⚠️ |
| `level` | 召唤师等级 | ⚠️ |
| `expPoints` / `expToNextLevel` | 经验/升级所需 | ⚠️ |
| `lastGameDate` | **最后游戏时间**（毫秒戳） | ⚠️（判断是否活跃） |
| `privacy` | 隐私（PRIVATE/PUBLIC） | ⚠️ |
| `revisionDate` | 最后修改时间 | ⚠️ |
| `nameChangeFlag` | **是否需要改名**（boolean，实测值 `false`）。国服改名系统用：当玩家有免费改名机会未用、或名字违规需强制改名时为 `true`，正常为 `false` | ⚠️ |
| `unnamed` | **是否未命名**（boolean，实测值 `false`）。新号未设置过名字/内部名为空时为 `true`（即"游客号/未完成创角"），老号正常为 `false`。配合 `internalName`（空字符串=未命名）判断 | ⚠️ |
| `internalName` | 内部名（国服常为空字符串） | ⚠️ |

---

## 三、LCU 端点（多数只能查自己）

> host 固定 `127.0.0.1:{lockfile端口}`，Basic Auth。

### 3.1 召唤师 / 档案

| 路径 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/lol-summoner/v1/current-summoner` | GET | 当前账号（puuid/level/icon/summonerId/gameName/tagLine） | ✅ |
| `/lol-summoner/v1/summoners?name={RiotID编码}` | GET | Riot ID（`名字%23tag`）→ puuid | ✅ |
| `/lol-summoner/v1/summoners/{summonerId}` | GET | 数字 ID → 资料 | ✅ |
| `/lol-summoner/v1/summoners/puuid/{puuid}` | GET | puuid → 资料（v1） | ✅ |
| `/lol-summoner/v2/summoners/puuid/{puuid}` | GET | puuid → 资料（v2，字段更全） | ✅ |
| `/lol-summoner/v1/summoner-profile?puuid={puuid}` | GET | 生涯背景（backgroundSkinId/regalia） | ⚠️ 实测可用未用 |
| `/lol-summoner/v1/current-summoner/name` | POST | 改名 | ❌ 不做（写入） |
| `/lol-summoner/v1/current-summoner/summoner-profile` | POST | 改生涯背景/强化 | ❌ 不做 |
| `/lol-regalia/v2/current-summoner/regalia` | PUT | 改勋章/头像框/称号 | ❌ 不做 |

### 3.2 段位（项目实际走 LCU，不走 SGP）

| 路径 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/lol-ranked/v1/current-ranked-stats` | GET | 当前账号段位（国服优先） | ✅ |
| `/lol-ranked/v1/ranked-stats/{puuid}` | GET | 按 puuid 查段位 | ✅ |
| `/lol-ranked/v1/ranked-stats/{summonerId}` | GET | 按 summonerId 查段位 | ✅（兜底） |
| `/lol-ranked/v2/tiers?summonerIds=` | GET | 段位（v2 批量） | ⚠️ |

**段位响应消费字段**（`matchService.ts` `collectRankQueues`）：
`queueType` / `tier` / `ratedTier` / `division` / `rank` / `leaguePoints` / `ratedRating` / `wins` / `losses`。仅保留单双（RANKED_SOLO_5x5）/灵活（RANKED_FLEX_SR）。

未挖掘：`miniSeries`（晋级赛）、`veterancy`、云顶 `rated` 段位、历史赛季等。

### 3.3 战绩（本地缓存，仅约 21 场）

| 路径 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/lol-match-history/v1/products/lol/{puuid}/matches?begIndex=0&endIndex=24` | GET | 最近 N 场（liveBattle 用，算 KDA/胜率） | ✅ |
| `/lol-match-history/v1/matchlist` | GET | 战绩列表 | ⚠️ |
| `/lol-match-history/v1/games/{gameId}` | GET | 单场详情 | ⚠️ |
| `/lol-match-history/v1/recently-played-summoners` | GET | 最近一起玩的 | ⚠️ |

> 完整战绩（>21场）必须走 SGP（见 2.1）。LCU 本地缓存是老式嵌套结构（`participants[].stats.kills`），与 SGP 扁平结构不同。

### 3.4 实时对局

| 路径 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/lol-gameflow/v1/gameflow-phase` | GET | 游戏阶段（None/Lobby/Matchmaking/ReadyCheck/ChampSelect/InProgress） | ✅ |
| `/lol-gameflow/v1/session` | GET | 对局骨架（10人 puuid/summonerId/championId + queue） | ✅（仅取队伍+queue） |
| `/lol-champ-select/v1/session` | GET | 选人阶段会话（myTeam/theirTeam） | ✅ |
| `/lol-matchmaking/v1/ready-check/accept` | POST | 自动接受对局 | ❌ 不做 |
| `/lol-matchmaking/v1/ready-check/decline` | POST | 拒绝 | ❌ |
| `/lol-gameflow/v1/session/dodge` | POST | 秒退 | ❌ |
| `/lol-gameflow/v1/reconnect` | POST | 重连 | ❌ |

未挖掘：`gameflow/v1/session.gameData` 的 banList/地图/observer/spectators 等。

### 3.5 社交

| 路径 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/lol-chat/v1/friends` | GET | 好友列表（含在线/游戏状态/段位） | ✅ |
| `/lol-chat/v1/me` | GET/PUT | 自己的状态/可见性/假段位 | GET✅ / PUT❌ |
| `/lol-chat/v2/friend-requests` | POST | 加好友 | ❌ |
| `/lol-chat/v1/friends/{id}` | DELETE/PUT | 删/备注好友 | ❌ |
| `/lol-chat/v1/conversations/{id}/messages` | POST | 发消息 | ❌ |
| `/lol-chat/v1/blocked-players` | GET/POST | 屏蔽列表/拉黑 | ⚠️/❌ |

### 3.6 资产 / 游戏数据 / 成就

| 路径 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/lol-game-data/assets/v1/champion-summary.json` | GET | 英雄列表（id/name/description真名/alias/roles） | ✅ |
| `/lol-game-data/assets/v1/items.json` | GET | 装备列表 | ✅ |
| `/lol-game-data/assets/v1/summoner-spells.json` | GET | 召唤师技能 | ✅ |
| `/lol-game-data/assets/v1/perks.json` | GET | 符文 | ✅ |
| `/lol-game-data/assets/v1/champions/{id}.json` | GET | 单英雄详情（含 skins[]） | ⚠️ |
| `/lol-game-data/assets/v1/skins.json` | GET | 全皮肤（2087个） | ⚠️ |
| `/lol-game-data/assets/v1/challenges.json` | GET | 挑战配置（406项，name→描述） | ⚠️（反查 id 含义用） |
| `/lol-game-data/assets/v1/profile-icons.json` | GET | 头像列表 | ⚠️ |
| `/lol-champions/v1/owned-champions-minimal` | GET | 拥有的英雄（只查自己） | ⚠️（已被 challenges 替代） |
| `/lol-champions/v1/inventories/{sid}/skins-minimal` | GET | 皮肤列表（含 ownership.owned） | ⚠️（已被 challenges 替代） |
| `/lol-perks/v1/pages` | GET/POST/PUT/DELETE | 符文页 CRUD | GET✅ / 写入❌ |
| `/lol-item-sets/v1/item-sets/{sid}/sets` | GET/POST | 出装推荐 | ⚠️/❌ |
| `/lol-rewards/v1/grants` | GET | 可领取奖励 | ⚠️（实测可用） |
| `/lol-rewards/v1/grants/{id}/select` | POST | 领奖励 | ❌ |
| `/lol-missions/v1/missions` | GET | 任务列表（202项） | ⚠️（实测可用） |
| `/lol-honor-v2/v1/profile` | GET | 荣誉等级/checkpoint | ⚠️（实测可用） |
| `/lol-clash/v1/player` | GET | 冠军战队（位置/段位/票） | ⚠️（实测可用） |
| `/lol-spectator/v1/active-games/by-summoner/{id}` | GET | 观战对局 | ✅（lcu.ts 用） |
| `/lol-spectator/v1/active-games/by-puuid/{puuid}` | GET | 同上 | ✅ |
| `/lol-spectator/v1/spectate/launch` | POST | 启动观战 | ❌ |
| `/lol-loot/v1/player-loot` | GET | 战利品箱 | ⚠️（实测可用） |
| `/lol-loot/v1/recipes/{name}/craft` | POST | 合成/分解 | ❌ |

### 3.7 游戏设置

| 路径 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/lol-game-settings/v1/game-settings` | GET | 游戏内设置（General/HUD/Volume/FloatingText 等，94 字段） | ✅ |
| `/lol-game-settings/v1/game-settings` | PATCH | 增量改设置 | ✅（综合页用） |
| `/lol-game-settings/v1/input-settings` | GET | 热键（GameEvents 166 个 + HUDEvents/Quickbinds/ShopEvents） | ✅ |
| `/lol-game-settings/v1/input-settings` | PATCH | 改热键 | ✅ |

> 注：game-settings 是 LCU 内存镜像，只含部分游戏设置。完整设置在本地文件 `Game/Config/game.cfg`（INI 格式）+ `input.ini`，需直接读写文件（见设计文档）。

### 3.8 客户端进程控制

| 路径 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/process-control/v1/process/quit` | POST | 退出客户端 | ❌ |
| `/process-control/v1/process/restart` | POST | 重启客户端 | ❌ |
| `/patcher/v1/executable-version` | GET | 客户端版本号 | ⚠️ |
| `/entitlements/v1/token` | GET | 拿 SGP accessToken | ✅（认证链用） |

---

## 四、❌ 国服禁用端点（全 403，避免重复踩坑）

以下端点在国服（腾讯服）实测返回 **403 Forbidden**，不要尝试：

**所有 `-ledge` 系列**（除 challenges-client / leagues-ledge / summoner-ledge 这 3 个可用外）：
- `masteries-ledge`（英雄成就）❌
- `eternals-ledge` v1/v2（永恒星碑）❌
- `collections-ledge`（收藏明细）❌
- `clash-ledge`（冠军战队详情）❌
- `honor-ledge`（荣誉）❌
- `crystals-ledge` ❌
- `bans-ledge`（禁用英雄）❌
- `active-shards-ledge` ❌
- `account-ledge` ❌
- `inventory-ledge`（库存）❌
- `player-preferences-ledge` ❌

**收藏/库存类**：
- `/lol-collections/v1/*`（所有路径）❌
- `/lol-inventory/v1/*` ❌
- `/lol-mastery/v1/*` / `/lol-mastery/v2/*`（英雄成就）❌
- `/lol-store/v1/store` ❌
- `/lol-challenges/v1/challenges`（404，走 SGP 的 challenges-client）❌
- `/lol-client-settings/v1/settings` ❌

> 这些端点在国际服可用，但腾讯国服全部封禁。**查别人的资产/成就数据，唯一可用路径是 SGP 的 challenges 端点**（2.2）。

---

## 五、未挖掘数据重点（按价值排序）

### 🥇 玩家实力雷达图（challenges.categoryPoints）
- 数据现成（challenges 端点已有），能查别人
- 5 维度：想象力/专精/团队协作/老练/收藏，每维含 level + percentile
- **零额外请求**（查资产数时已拉到），做出来非常炫酷

### 🥈 玩家含金量评分（challenges.totalPoints）
- 总挑战点数 + 百分位（如 0.021 = 全服前 2.1%）
- 一个数字概括玩家"肝度/成就度"

### 🥉 战绩团队数据（teams.objectives）
- 团队龙/塔/男爵/水晶击杀数
- 能做"团队经济曲线""资源控制统计"

### 4️⃣ participant.challenges 细分统计（120 项）
- 参团率(killParticipation) / 每分钟伤害(damagePerMinute) / 经济(goldPerMinute) / 承伤占比 / 每分钟视野 / 单杀数 / 技能命中率 / 抢龙(epicMonsterSteals)...
- 能做"单场深度复盘"
- 完整 120 项字段见 2.1 章节，**注意 `crowdControlTime` 和 `carryScore` 实测不存在**

### 5️⃣ 4 个未用的收藏 id
- 图标(504002) / 表情(504004) / 守卫(504003) / 炫彩(510011)
- 加几行就能和英雄/皮肤数并列展示

### 6️⃣ 历史段位（leagues-ledge）
- 历史最高段位 / 上赛季结算段位 / cumulativeLp 累计胜点
- 比当前段位信息更丰富

---

## 六、客户端本地文件数据源（API 之外的金矿）

> LCU/SGP 端点之外，客户端本地文件里藏着大量设置和数据。国服很多 LCU 端点（收藏/库存）被禁（403），但**这些数据在本地文件里都有**。安装目录默认 `D:/WeGameApps/英雄联盟`（需自动探测）。

### 6.1 游戏内设置 — `Game/Config/game.cfg`（INI 格式，4KB）

**综合页"系统/界面"分组的真实数据源**（之前 LCU `game-settings` 端点找不到的字段全在这里）：

`[General]` 段字段（实测）：
| 字段 | 含义 |
|---|---|
| `AutoSendCrashReport` | 自动发送崩溃报告（1/0） |
| `LowSpecMachineAdaptation` | 低配机器适应模式 |
| `CloseClientDuringGame` | 游戏期间关闭客户端 |
| `DisableInteractiveBackground` | 禁用互动背景效果 |
| `DisableChampionSkillText` | 禁用英雄技能说明文本 |
| `LearnSpellOnCast` | 施法时学习技能 |
| `ThemeMusic` | 主题音乐 |
| `TargetChampionsOnlyAsToggle` | 仅以英雄为目标（切换） |
| `SnapCameraOnRespawn` | 重生时镜头对齐 |
| `ShowTurretRangeIndicators` | 显示防御塔范围 |
| `ShowCursorLocator` | 显示光标定位 |
| `RelativeTeamColors` | 相对队伍颜色 |
| `RecommendJunglePaths` | 推荐打野路线 |
| `PredictMovement` | 预测移动 |
| `CfgVersion` | 配置版本号（如 16.12.788.4269） |
| `WindowMode` / `Width` / `Height` | 窗口模式/宽/高（0窗口/1全屏/2无边框） |
| ... 还有 General/HUD/Volume/FloatingText 等分类共 94 字段 |

> **结论**：综合页的所有设置项都应直接读写 `game.cfg`，而非走 LCU（LCU 的 `game-settings` 端点只是部分镜像，缺低配/崩溃报告等字段）。

### 6.2 热键 — `Game/Config/input.ini`（INI 格式，6KB）

`[GameEvents]`（166 个热键）+ `[HUDEvents]` + `[Quickbinds]`（快捷施法）+ `[ShopEvents]`。每个键位如 `evtSpell1=[q]`。

### 6.3 出装方案 — `Game/Config/ItemSets.json`（JSON，~1KB+）

用户自定义的装备推荐方案，含 `accountId` + `itemSets[]`（每套含 associatedChampions/maps/blocks/items）。**写入这里能让游戏内显示自定义出装推荐**。

### 6.4 持久化设置 — `Game/Config/PersistedSettings.json`（JSON，60KB）

游戏所有设置的完整持久化版本（含历史值），比 game.cfg 更全。作"字段字典参考"用，**不作写入目标**（以 game.cfg 为准）。

### 6.5 五杀统计 — `Game/Config/pallas_UltKill.ini`（INI）

记录每个英雄（uid）的五杀次数统计（如 `uid1073742157=1621`）。**有意思的小众数据**。

### 6.6 语音/音效开关 — `Game/Config/pallas_lol_voice.ini`

`[VoiceSwitch] Panel=0 Mic=0`（语音面板/麦克风开关）。

### 6.7 云顶阵容偏好 — `Game/Config/TFTTeamPlansPreferences.yaml`（YAML，31KB）

云顶之弈的阵容规划偏好（注册阵容索引、提醒开关等）。跨账号同步用。

---

### 6.8 ★ 客户端偏好设置 — `LeagueClient/Config/*.yaml`（5 个文件，API 外的重要补充）

| 文件 | 大小 | 内容 | 价值 |
|---|---|---|---|
| `LeagueClientSettings.yaml` | 1KB | 安装/区域/locale/crash_reporting/game-settings 状态 | ⚠️ 低 |
| `LCUAccountPreferences.yaml` | 25KB | **每个英雄的默认皮肤映射**（champ-select.skins，如 `1:1040`=英雄1默认皮肤1040）、符文页偏好 | ⭐⭐⭐ **"上次用的皮肤"记忆** |
| `LCULocalPreferences.yaml` | 2KB | 音频开关(masterSoundEnabled)、预组语音(inputVolume/vadSensitivity)、录像提示、动画开关、皮肤查看器 | ⭐⭐ 客户端级设置 |
| `PerksPreferences.yaml` | 9KB | 符文页完整定义（pages[]，每页含主副系/具体符文/属性碎片） | ⭐⭐ 符文页读写 |
| `TFTPreferences.yaml` | 1KB | 云顶收藏/外观偏好（companion/皮肤收藏） | ⚠️ |

**LCUAccountPreferences.yaml 的 champ-select.skins**：
```yaml
champ-select:
    data:
        skins:
            1: 1040      # 英雄1(Annie)默认用皮肤1040
            10: 10067    # 英雄10默认用皮肤10067
            101: 101031
            ...
```
> 这是**每个英雄上次选用的皮肤 ID**（171 个英雄全有）。结合皮肤元数据（`/lol-game-data/assets/v1/skins.json`）能显示"该玩家每个英雄爱用什么皮肤"。

---

## 七、客户端可读写的本地文件清单汇总

| 文件 | 格式 | 可读 | 可写 | 用途 |
|---|---|---|---|---|
| `Game/Config/game.cfg` | INI | ✅ | ✅ | 游戏设置（94字段） |
| `Game/Config/input.ini` | INI | ✅ | ✅ | 热键（166项） |
| `Game/Config/ItemSets.json` | JSON | ✅ | ✅ | 出装方案 |
| `Game/Config/PersistedSettings.json` | JSON | ✅ | ⚠️ 只参考 | 设置完整版（字典） |
| `Game/Config/pallas_UltKill.ini` | INI | ✅ | ❌ | 五杀统计（只读展示） |
| `LeagueClient/Config/LCUAccountPreferences.yaml` | YAML | ✅ | ⚠️ 谨慎 | 英雄默认皮肤/符文偏好 |
| `LeagueClient/Config/LCULocalPreferences.yaml` | YAML | ✅ | ⚠️ 谨慎 | 客户端音频/语音/动画设置 |
| `LeagueClient/Config/PerksPreferences.yaml` | YAML | ✅ | ⚠️ 谨慎 | 符文页 |

> **写入约束**（V3 设计文档）：游戏对局中禁止写 input.ini/game.cfg；写入前自动备份；原子写（tmp+rename）；YAML 用白名单（禁止整文件复制）。客户端运行时写 game.cfg 可能不实时生效（需重启）。

---

## 八、API 与本地文件的对应关系（重要）

| 想要的数据 | API 端点（国服） | 本地文件 |
|---|---|---|
| 拥有英雄数 | ✅ SGP challenges(505001) | ❌ 无 |
| 拥有皮肤数 | ✅ SGP challenges(510001) | ❌ 无 |
| 综合页设置（低配/崩溃/背景） | ❌ LCU 无此端点 | ✅ `game.cfg [General]` |
| 热键 | ✅ LCU game-settings(input) | ✅ `input.ini` |
| 出装方案 | ⚠️ LCU item-sets | ✅ `ItemSets.json` |
| 每英雄上次用的皮肤 | ❌ 无端点 | ✅ `LCUAccountPreferences.yaml` |
| 符文页 | ✅ LCU perks/pages | ✅ `PerksPreferences.yaml` |
| 战绩 | ✅ SGP | ❌ 无（不落本地） |
| 段位 | ✅ LCU/SGP | ❌ 无 |

> **关键洞察**：国服 API（SGP challenges + 战绩）和本地文件是**互补**的。API 擅长查别人的动态数据（战绩/段位/资产数），本地文件擅长自己账号的配置（设置/皮肤记忆/出装/符文）。换号设置同步功能必须靠本地文件读写。

---

## 九、附录：项目代码位置索引

| 模块 | 文件 |
|---|---|
| SGP 认证 | `src/main/sgp/auth.ts` |
| SGP 客户端 | `src/main/sgp/client.ts` |
| 大区映射 | `src/main/sgp/region.ts` |
| LCU 凭证 | `src/main/lcu/lockfile.ts` |
| LCU 客户端 | `src/main/lcu/client.ts` |
| 战绩查询主流程 | `src/main/match/matchService.ts` |
| 战绩字段映射 | `src/main/match/matchMapper.ts` |
| 实时对局 | `src/main/live/liveBattle.ts` |
| 资产预加载 | `src/main/lcu/gameData.ts` |
| 模式名映射 | `src/main/match/queueNames.ts` |
| LCU IPC handler | `src/main/ipc/handlers/lcu.ts` |
| 类型契约 | `src/shared/api.ts` |
| IPC 通道 | `src/shared/channels.ts` |
