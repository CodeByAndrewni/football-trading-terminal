# API-Football v3 端点总表与标准模型

**版本**: v2.0 (2026-03-01)
**基础URL**: https://v3.football.api-sports.io
**认证**: Header `x-apisports-key: YOUR_API_KEY`

---

## 📋 第 1 部分：主要端点总表

### 🏟️ 比赛/赛程/比分 (Fixtures)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /fixtures` | 按日期/联赛/球队查询比赛 | ❌ | ✅ 已实现 |
| `GET /fixtures?live=all` | 获取所有进行中比赛 | ⭐ 核心 | ✅ 已实现 |
| `GET /fixtures?id={id}` | 单场比赛详情 | ⭐ 核心 | ✅ 已实现 |
| `GET /fixtures?date={YYYY-MM-DD}` | 指定日期比赛 | ❌ | ✅ 已实现 |
| `GET /fixtures?team={id}&season={year}` | 球队赛季比赛 | ❌ | ❌ 待实现 |
| `GET /fixtures?from={date}&to={date}` | 日期范围比赛 | ❌ | ❌ 待实现 |
| `GET /fixtures/headtohead?h2h={t1}-{t2}` | 历史对战记录 (H2H) | ❌ | ✅ 已实现 |
| `GET /fixtures/rounds?league={id}&season={y}` | 联赛轮次列表 | ❌ | ❌ 待实现 |

### 📊 比赛统计 (Statistics)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /fixtures/statistics?fixture={id}` | 比赛实时统计 | ⭐ 核心 | ✅ 已实现 |
| `GET /fixtures/statistics?fixture={id}&team={id}` | 指定球队统计 | ⭐ 核心 | ✅ 已实现 |

### ⚡ 比赛事件 (Events)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /fixtures/events?fixture={id}` | 进球/牌/换人等事件 | ⭐ 核心 | ✅ 已实现 |
| `GET /fixtures/events?fixture={id}&type={type}` | 按类型筛选事件 | ⭐ 核心 | ✅ 已实现 |

### 👥 阵容 (Lineups)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /fixtures/lineups?fixture={id}` | 首发/替补阵容 | ⭐ 核心 | ✅ 已实现 |

### 👤 球员比赛统计 (Fixture Players)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /fixtures/players?fixture={id}` | 球员单场详细统计 | ⭐ 核心 | ✅ 已实现 |

### 💰 赔率 (Odds)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /odds?fixture={id}` | 赛前赔率 (Prematch) | ⭐ 核心 | ✅ 已实现 |
| `GET /odds/live?fixture={id}` | 滚球赔率 (Live) | ⭐ 核心 | ✅ 已实现 |
| `GET /odds/live` | 所有进行中比赛赔率 | ⭐ 核心 | ❌ 待实现 |
| `GET /odds/mapping` | 盘口类型映射表 | ❌ | ❌ 待实现 |
| `GET /odds/bookmakers` | 博彩公司列表 | ❌ | ❌ 待实现 |
| `GET /odds/bets` | 盘口类型列表 | ❌ | ❌ 待实现 |

### 🏆 联赛/积分榜 (Leagues & Standings)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /leagues` | 联赛列表 | ❌ | ✅ 已实现 |
| `GET /leagues?id={id}` | 联赛详情 | ❌ | ✅ 已实现 |
| `GET /leagues?current=true` | 当前活跃联赛 | ❌ | ✅ 已实现 |
| `GET /standings?league={id}&season={y}` | 联赛积分榜 | ❌ | ✅ 已实现 |
| `GET /standings?team={id}&season={y}` | 球队排名 | ❌ | ❌ 待实现 |

### ⚽ 球队 (Teams)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /teams?id={id}` | 球队详情 | ❌ | ✅ 已实现 |
| `GET /teams?league={id}&season={y}` | 联赛球队列表 | ❌ | ❌ 待实现 |
| `GET /teams/statistics?team={id}&league={l}&season={y}` | 球队赛季统计 | ❌ | ✅ 已实现 |
| `GET /teams/seasons?team={id}` | 球队参赛赛季 | ❌ | ❌ 待实现 |

### 👤 球员 (Players)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /players?id={id}&season={y}` | 球员详情/统计 | ❌ | ❌ 待实现 |
| `GET /players?team={id}&season={y}` | 球队球员列表 | ❌ | ❌ 待实现 |
| `GET /players/squads?team={id}` | 球队阵容 | ❌ | ❌ 待实现 |
| `GET /players/topscorers?league={id}&season={y}` | 射手榜 | ❌ | ❌ 待实现 |
| `GET /players/topassists?league={id}&season={y}` | 助攻榜 | ❌ | ❌ 待实现 |
| `GET /players/topyellowcards?league={id}&season={y}` | 黄牌榜 | ❌ | ❌ 待实现 |
| `GET /players/topredcards?league={id}&season={y}` | 红牌榜 | ❌ | ❌ 待实现 |

### 🏥 伤病/预测 (Injuries & Predictions)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /injuries?fixture={id}` | 比赛伤病情况 | ❌ | ✅ 已实现 |
| `GET /injuries?team={id}&season={y}` | 球队伤病列表 | ❌ | ✅ 已实现 |
| `GET /predictions?fixture={id}` | API官方预测 | ❌ | ✅ 已实现 |

### 📦 其他 (Miscellaneous)

| 端点 | 功能说明 | Live相关 | 项目状态 |
|------|---------|---------|---------|
| `GET /coachs?team={id}` | 教练信息 | ❌ | ❌ 待实现 |
| `GET /venues?id={id}` | 球场信息 | ❌ | ❌ 待实现 |
| `GET /transfers?player={id}` | 转会记录 | ❌ | ❌ 待实现 |
| `GET /trophies?player={id}` | 荣誉记录 | ❌ | ❌ 待实现 |
| `GET /sidelined?player={id}` | 缺阵记录 | ❌ | ❌ 待实现 |
| `GET /timezone` | 时区列表 | ❌ | ❌ 待实现 |
| `GET /countries` | 国家列表 | ❌ | ❌ 待实现 |
| `GET /seasons` | 赛季列表 | ❌ | ❌ 待实现 |

---

## ⭐ 第 2 部分：Live 强相关端点详解

### 2.1 GET /fixtures?live=all - 进行中比赛核心

**业务价值**: 所有滚球分析的数据基础，获取实时比分、分钟数、状态

#### 核心字段结构

```typescript
interface LiveFixtureResponse {
  fixture: {
    id: number;              // ⭐ 唯一标识
    referee: string | null;  // 裁判姓名
    timezone: string;        // 时区
    date: string;            // ISO 8601 日期
    timestamp: number;       // Unix 时间戳
    periods: {
      first: number | null;  // 上半场开始时间戳
      second: number | null; // 下半场开始时间戳
    };
    venue: {
      id: number | null;
      name: string;          // 球场名
      city: string;          // 城市
    };
    status: {
      long: string;          // "Second Half", "Half Time" 等
      short: string;         // ⭐ 状态码: 1H, HT, 2H, FT, NS, ET, P 等
      elapsed: number | null; // ⭐ 当前分钟数 (0-90+)
    };
  };
  league: {
    id: number;              // ⭐ 联赛ID
    name: string;            // 联赛名
    country: string;         // 国家
    logo: string;            // 联赛Logo URL
    flag: string | null;     // 国旗URL
    season: number;          // 赛季年份
    round: string;           // "Regular Season - 21"
  };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: {
    home: number | null;     // ⭐ 主队当前进球
    away: number | null;     // ⭐ 客队当前进球
  };
  score: {
    halftime: { home: number | null; away: number | null };   // 半场比分
    fulltime: { home: number | null; away: number | null };   // 全场比分(结束后)
    extratime: { home: number | null; away: number | null };  // 加时比分
    penalty: { home: number | null; away: number | null };    // 点球比分
  };
}
```

#### 状态码映射表

| status.short | 含义 | 交易价值 | 映射到内部状态 |
|--------------|------|---------|---------------|
| NS | 未开始 (Not Started) | 赛前分析 | `ns` |
| 1H | 上半场进行中 | 可滚球 | `1h` |
| HT | 中场休息 (Half Time) | 战术调整窗口 | `ht` |
| 2H | 下半场进行中 | 核心交易时段 | `2h` |
| ET | 加时赛 (Extra Time) | 高波动 | `live` |
| BT | 加时中场 (Break Time) | 等待 | `live` |
| P | 点球大战 (Penalty) | 高风险 | `live` |
| SUSP | 暂停 (Suspended) | 观望 | `live` |
| INT | 中断 (Interrupted) | 观望 | `live` |
| LIVE | 进行中(通用) | 可滚球 | `live` |
| FT | 全场结束 (Full Time) | 结算 | `ft` |
| AET | 加时结束 | 结算 | `aet` |
| PEN | 点球结束 | 结算 | `pen` |
| PST | 延期 | 排除 | - |
| CANC | 取消 | 排除 | - |
| ABD | 腰斩 | 特殊处理 | - |

### 2.2 GET /fixtures/statistics?fixture={id} - 比赛统计核心

**业务价值**: 进攻因子、动量因子的数据源，评估进球概率

#### 统计类型字段详解

| API type 字段 | 中文含义 | 值类型 | 交易价值 | 映射到内部字段 |
|--------------|---------|--------|---------|---------------|
| Shots on Goal | 射正数 | number | ⭐⭐⭐ 直接威胁 | `shotsOnTarget` |
| Shots off Goal | 射偏数 | number | ⭐⭐ 进攻意图 | (计算 shots) |
| Total Shots | 总射门 | number | ⭐⭐⭐ 进攻压力 | `shots` |
| Blocked Shots | 被封堵 | number | 防守压力指标 | - |
| Shots insidebox | 禁区内射门 | number | ⭐⭐⭐ 高质量机会 | - |
| Shots outsidebox | 禁区外射门 | number | 远射尝试 | - |
| Fouls | 犯规数 | number | 比赛激烈度 | `fouls` |
| Corner Kicks | 角球数 | number | ⭐⭐⭐ 进攻压力 | `corners` |
| Offsides | 越位数 | number | 进攻渗透 | - |
| Ball Possession | 控球率 | string ("55%") | ⭐⭐ 控制力 | `possession` |
| Yellow Cards | 黄牌数 | number | 纪律风险 | `yellowCards` |
| Red Cards | 红牌数 | number | ⭐⭐⭐ 人数变化 | `redCards` |
| Goalkeeper Saves | 扑救数 | number | 对方威胁程度 | - |
| Total passes | 总传球 | number | 比赛节奏 | `attacks` |
| Passes accurate | 成功传球 | number | 控制力 | `dangerousAttacks` |
| Passes % | 传球成功率 | string ("85%") | 传控质量 | - |
| expected_goals | xG期望进球 | number | ⭐⭐⭐ 进球概率 | `xG` |

**更多端点详解见完整文档...**

---

## 🔧 第 3 部分：系统标准数据模型

### 数据模型文件位置

所有标准数据模型定义在: `src/types/api-football-models.ts`

### 模型概览

| 模型名称 | 用途 | 数据来源 |
|---------|------|---------|
| LiveCore | 比分/时间/状态 | /fixtures?live=all |
| LiveStatsCore | 射门/角球/控球等 | /fixtures/statistics |
| LiveEventsCore | 进球/牌/换人 | /fixtures/events |
| LineupCore | 首发/替补/阵型 | /fixtures/lineups |
| OddsPrematchCore | 赛前赔率 | /odds |
| OddsLiveCore | 滚球赔率 | /odds/live |
| StandingsCore | 积分榜 | /standings |
| TeamSeasonStatsCore | 球队赛季数据 | /teams/statistics |
| H2HCore | 历史对战 | /fixtures/headtohead |

---

## 📚 参考资料

- [API-Football 官方文档](https://www.api-football.com/documentation-v3)
- [本项目类型定义](../src/types/index.ts)
- [数据聚合器](../api/lib/aggregator.ts)
