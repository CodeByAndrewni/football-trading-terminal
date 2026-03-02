## 初盘 vs 动态盘口 字段说明

本项目现在在「聚合层 `/api/matches` → 前端 UI」之间，明确区分了**赛前初始盘口**与**当前动态盘口**两套字段。

### 一、字段总览

- **赛前初盘快照（只来自 prematch odds，不随 live 变化）**
  - `initialHandicap: number | null`
  - `initialOverUnder: number | null`
- **当前动态盘口（live 优先，prematch 兜底）**
  - `odds.handicap.value: number | null`
  - `odds.overUnder.total: number | null`

### 二、聚合层 `/api/matches` 字段来源

- 文件：`api/lib/aggregator.ts`
- 类型：`AdvancedMatch`（聚合端）

#### 1. 当前盘口（动态）

- 解析逻辑：
  - `liveOddsInfo = parseLiveOdds(liveOdds)`（来源：`OddsLiveCore ← /odds/live`）
  - `prematchOddsInfo = parsePrematchOdds(prematchOdds)`（来源：`OddsPrematchCore ← /odds`）
  - 优先顺序：
    - 若 `liveOddsInfo` 存在 → 作为当前盘口；
    - 否则若 `prematchOddsInfo` 存在 → 作为当前盘口；
    - 否则 → `createEmptyOdds('暂无实时赔率')`。
- 写入字段：
  - `match.odds = liveOddsInfo || prematchOddsInfo || createEmptyOdds(...)`
  - `match._oddsSource = 'live' | 'prematch' | null`
- 说明：
  - `match.odds.handicap.value`、`match.odds.overUnder.total` 表示**当前主盘口线**，
  - 会随着 live odds 刷新而变化，是 UI 中「动态盘口」列的真实来源。

#### 2. 赛前初盘（只看 prematch）

- 解析逻辑：
  - 仅从 `prematchOddsInfo = parsePrematchOdds(prematchOdds)` 中读取主线：
    - 若 `prematchOddsInfo.handicap.value !== null` → 记为 `initialHandicap`；
    - 若 `prematchOddsInfo.overUnder.total !== null` → 记为 `initialOverUnder`；
    - 否则 → 两者为 `null`。
- 写入字段：
  - `match.initialHandicap = prematchOddsInfo.handicap.value ?? null`
  - `match.initialOverUnder = prematchOddsInfo.overUnder.total ?? null`
- 重要约束：
  - **不再**从 `match.odds.handicap.value` / `match.odds.overUnder.total` 回写到 `home.handicap` / `away.overUnder`；
  - live odds 不会覆盖 `initialHandicap` / `initialOverUnder`；
  - 每次聚合仅依据当时的 prematch 数据写入一次这两个字段（无持久化历史，但保证「只看 prematch，不看 live」）。

### 三、前端 `AdvancedMatch` 类型对齐

- 文件：`src/data/advancedMockData.ts`
- 类型：`AdvancedMatch`（前端）
- 新增字段：

```ts
initialHandicap?: number | null;
initialOverUnder?: number | null;
```

- 兼容说明：
  - 旧直连模式（`convertApiMatchToAdvanced`）仍然只写：
    - `home.handicap` / `away.overUnder`（来自 `parsePrematchOdds`）；
  - 新聚合模式通过 `/api/matches` 下发：
    - `initialHandicap` / `initialOverUnder`（pure prematch）；
    - `odds.*` 为当前盘口；
  - UI 组件在读取「初盘」时优先使用 `initial*`，在旧直连模式下则自动回退到 `home.handicap` / `away.overUnder`。

### 四、UI 显示映射

#### 1. 比赛主表 `MatchTableV2.tsx`

- **初盘列**
  - 让球初盘：
    - 字段：`match.initialHandicap ?? match.home.handicap`
    - 用于显示文本：`（初：...）`
  - 大小球初盘：
    - 字段：`match.initialOverUnder ?? match.away.overUnder`
    - 用于显示文本：`（初：...）`
- **动态盘口列**
  - 让球盘当前线：
    - 字段：`match.odds.handicap.value`
  - 大小球当前线：
    - 字段：`match.odds.overUnder.total`

#### 2. 卡片视图 `AdvancedMatchTable.tsx`

- 主队名后的括号让球：
  - 字段：`match.initialHandicap ?? match.home.handicap`
  - 语义：按「初盘」理解显示，不再跟随 live odds 变化。

#### 3. 移动端卡片 `MobileMatchCard.tsx`

- 底部信息栏：
  - 「让球」：
    - 字段：`match.odds.handicap.value ?? match.home.handicap`
    - 语义：当前盘口线（动态），prematch 仅作兜底。
  - 「大小」：
    - 字段：`match.odds.overUnder.total ?? match.away.overUnder`
    - 语义：当前大小球盘口线，prematch 仅作兜底。

### 五、行为总结

- **聚合模式下**：
  - 进入比赛时：
    - 「初盘」列读取 `initialHandicap` / `initialOverUnder` → 来自 prematch odds；
  - 比赛进行中、live odds 不断刷新时：
    - 「动态盘口」列 (`match.odds.*`) 跟随变化；
    - 「初盘」列保持不变，因为只看 `initial*` 字段，不看 live 数据。
- **直连模式下（本地开发 / 聚合不可用）**：
  - 仍由 `convertApiMatchToAdvanced` 负责：
    - `home.handicap` / `away.overUnder` ← 纯 prematch；
  - UI 读取：
    - 「初盘」列：自动回退到 `home.handicap` / `away.overUnder`，行为与之前一致。

这样，初盘列和动态盘口列在代码层面已经彻底解耦：  
**初盘 = `initialHandicap` / `initialOverUnder`（或旧路径的 `home/away` 字段）**，  
**动态盘 = `match.odds.handicap.value` / `match.odds.overUnder.total`**，  
live 盘口的任何变化都不会再影响「初盘」列的显示。

