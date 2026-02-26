# LivePro Data Sources Map

> 数据来源映射表 - UI 每一列对应的 API-Football 端点与 JSON 路径

---

## 主表格列映射

| UI列名 | 来源端点 | JSON路径 | 刷新频率 | 为空时显示规则 |
|--------|----------|----------|----------|----------------|
| **赛事** | `/fixtures?live=all` | `response[].league.name` | 实时 | 显示 league.country 缩写 |
| **时间 ⏱** | `/fixtures?live=all` | `response[].fixture.status.elapsed` | 实时 (15s) | 显示 "N/A" |
| **主队** | `/fixtures?live=all` | `response[].teams.home.name` | 实时 | - |
| **客队** | `/fixtures?live=all` | `response[].teams.away.name` | 实时 | - |
| **比分** | `/fixtures?live=all` | `response[].goals.home`, `response[].goals.away` | 实时 | 显示 "0-0" |
| **初盘让球(主)** | `/odds?fixture={id}&bookmaker=8` | `response[].bookmakers[].bets[type=Asian Handicap].values` | 赛前 | 显示 N/A |
| **初盘让球(客)** | `/odds?fixture={id}&bookmaker=8` | (同上) | 赛前 | 显示 N/A |
| **比赛动态** | 组合 `/fixtures/statistics` + `/fixtures/events` | 见下方详解 | 30s | 显示灰色条 |
| **让球盘** | `/odds/live?fixture={id}` | `response[].odds[name=Asian Handicap]` | 实时 | 显示 N/A |
| **大小球** | `/odds/live?fixture={id}` | `response[].odds[name=Over/Under]` | 实时 | 显示 N/A |
| **评分(Score)** | 本地计算 | Module A 引擎输出 | 实时 | 不显示（无法计算） |
| **置信度(Confidence)** | 本地计算 | Module A 引擎输出 | 实时 | 不显示 |

---

## 比赛动态 (Match Dynamics) 详解

比赛动态条由以下数据组合渲染：

| 数据项 | 来源端点 | JSON路径 |
|--------|----------|----------|
| 射门数 | `/fixtures/statistics?fixture={id}` | `response[].statistics[type="Total Shots"].value` |
| 射正数 | `/fixtures/statistics?fixture={id}` | `response[].statistics[type="Shots on Goal"].value` |
| 控球率 | `/fixtures/statistics?fixture={id}` | `response[].statistics[type="Ball Possession"].value` |
| 角球数 | `/fixtures/statistics?fixture={id}` | `response[].statistics[type="Corner Kicks"].value` |
| 危险进攻 | `/fixtures/statistics?fixture={id}` | `response[].statistics[type="Dangerous Attacks"].value` |
| 进球事件 | `/fixtures/events?fixture={id}` | `response[].type="Goal"` |
| 红牌事件 | `/fixtures/events?fixture={id}` | `response[].type="Card", detail="Red Card"` |

---

## 赔率数据映射

| 赔率类型 | 来源端点 | JSON路径 | 说明 |
|----------|----------|----------|------|
| **赛前赔率** | `/odds?fixture={id}&bookmaker=8` | `response[].bookmakers[].bets[]` | Bet365 (bookmaker=8) |
| **滚球赔率** | `/odds/live?fixture={id}` | `response[].odds[]` | 实时滚球 |
| 大球赔率 | `/odds/live` | `odds[name="Over/Under"].values[value="Over 2.5"].odd` | |
| 小球赔率 | `/odds/live` | `odds[name="Over/Under"].values[value="Under 2.5"].odd` | |
| 亚盘主 | `/odds/live` | `odds[name="Asian Handicap"].values[0]` | |
| 亚盘客 | `/odds/live` | `odds[name="Asian Handicap"].values[1]` | |
| 胜平负 | `/odds/live` | `odds[name="Match Winner"].values` | Home/Draw/Away |

---

## 统计数据映射 (Statistics)

| UI字段 | API type 值 | 单位 | 空值处理 |
|--------|-------------|------|----------|
| shots_home | "Total Shots" | 次 | 0 |
| shots_away | "Total Shots" | 次 | 0 |
| shots_on_home | "Shots on Goal" | 次 | 0 |
| shots_on_away | "Shots on Goal" | 次 | 0 |
| corners_home | "Corner Kicks" | 次 | 0 |
| corners_away | "Corner Kicks" | 次 | 0 |
| possession_home | "Ball Possession" | % | 50 |
| possession_away | "Ball Possession" | % | 50 |
| dangerous_home | "Dangerous Attacks" | 次 | 0 |
| dangerous_away | "Dangerous Attacks" | 次 | 0 |
| passes_home | "Total Passes" | 次 | 0 |
| fouls_home | "Fouls" | 次 | 0 |
| offsides_home | "Offsides" | 次 | 0 |
| yellow_cards_home | "Yellow Cards" | 次 | 0 |
| goalkeeper_saves | "Goalkeeper Saves" | 次 | 0 |

---

## xG (预期进球) 数据

| 数据项 | 来源端点 | JSON路径 | 说明 |
|--------|----------|----------|------|
| xG_home | `/fixtures/statistics?fixture={id}` | `response[team=home].statistics[type="Expected Goals (xG)"].value` | 非所有比赛都有 |
| xG_away | `/fixtures/statistics?fixture={id}` | `response[team=away].statistics[type="Expected Goals (xG)"].value` | 需 API-Football Pro 订阅 |

> **注意**: xG 数据并非所有比赛都有，缺失时设为 0 并降低 confidence。

---

## 事件数据映射 (Events)

| 事件类型 | API type | API detail | 时间字段 |
|----------|----------|------------|----------|
| 进球 | "Goal" | "Normal Goal" / "Own Goal" / "Penalty" | `time.elapsed` |
| 黄牌 | "Card" | "Yellow Card" | `time.elapsed` |
| 红牌 | "Card" | "Red Card" | `time.elapsed` |
| 换人 | "subst" | - | `time.elapsed` |
| VAR | "Var" | "Goal Disallowed" / "Goal Confirmed" | `time.elapsed` |

---

## 数据新鲜度要求

| 数据类型 | 最大允许延迟 | 超时处理 |
|----------|-------------|----------|
| 比分 | 30 秒 | 显示上次数据 |
| 统计 | 2 分钟 | confidence -10 |
| 赔率 | 1 分钟 | confidence -15 |
| 事件 | 1 分钟 | 不影响评分 |

---

## Debug 弹窗显示字段

点击比赛行的 🐞 按钮，显示以下原始数据：

```json
{
  "fixture_id": 123456,
  "fetched_at": "2026-02-25T10:00:00Z",
  "source_endpoints": [
    "/fixtures?live=all",
    "/fixtures/statistics?fixture=123456",
    "/fixtures/events?fixture=123456",
    "/odds/live?fixture=123456"
  ],
  "raw_fixture": {
    "fixture": { "id": 123456, "status": { "elapsed": 75 } },
    "goals": { "home": 1, "away": 1 },
    "teams": { "home": { "name": "..." }, "away": { "name": "..." } }
  },
  "raw_statistics": {
    "home": { "shots": 12, "shots_on": 5, "corners": 6, "possession": 55 },
    "away": { "shots": 8, "shots_on": 3, "corners": 4, "possession": 45 }
  },
  "raw_events": [
    { "type": "Goal", "time": 23, "team": "home" },
    { "type": "Goal", "time": 45, "team": "away" }
  ],
  "raw_odds": {
    "over_2_5": 1.85,
    "under_2_5": 1.95,
    "ah_line": -0.5,
    "ah_home": 1.92,
    "ah_away": 1.88
  },
  "mapped_view_model": {
    "minute": 75,
    "score_home": 1,
    "score_away": 1,
    "shots_total": 20,
    "xg_total": 2.35,
    "corners_total": 10
  },
  "module_a_signal": {
    "score": 78,
    "confidence": 65,
    "action": "WATCH"
  }
}
```

---

## 空值/缺失数据处理规则

| 数据类型 | 缺失原因 | UI显示 | 评分影响 |
|----------|----------|--------|----------|
| 统计数据 | 联赛不支持 | 灰色 "N/A" | confidence -15, score 不计算 Edge |
| 赔率数据 | API 限制/联赛不支持 | 灰色 "N/A" | confidence -20, Market=0 |
| xG 数据 | 非 Pro 订阅 | 不显示 | confidence -5 |
| 事件数据 | 延迟/缺失 | 空时间轴 | 不影响评分 |

---

## API-Football 端点汇总

| 端点 | 用途 | 调用频率 |
|------|------|----------|
| `GET /fixtures?live=all` | 获取所有进行中比赛 | 每 15 秒 |
| `GET /fixtures/statistics?fixture={id}` | 比赛统计数据 | 每 30 秒 |
| `GET /fixtures/events?fixture={id}` | 比赛事件 | 每 30 秒 |
| `GET /odds/live?fixture={id}` | 滚球赔率 | 每 60 秒 |
| `GET /odds?fixture={id}&bookmaker=8` | 赛前赔率 (Bet365) | 赛前一次 |
| `GET /standings?league={id}&season=2025` | 积分榜 | 每日 |
| `GET /fixtures/headtohead?h2h={t1}-{t2}` | 历史对战 | 赛前一次 |

---

*最后更新: 2026-02-25*
*版本: P0_EXECUTION_V1*
