# 刷新与赔率策略说明

## 一、修改文件列表

- `src/services/standingsService.ts`
- `src/services/apiFootballSDK.ts`
- `src/services/oddsBatchOptimizer.ts`
- `api/matches/index.ts`
- `src/config/constants.ts`
- `src/services/api.ts`
- `src/hooks/useMatches.ts`（仅确认逻辑，未在本轮进一步修改 liveMatches 计算）
- `src/pages/HomePage.tsx`
- `src/services/apiConverter.ts`

---

## 二、后端 / 聚合层刷新与缓存策略

### 1. Standings / 联赛排名 / 联赛元数据

**相关文件**：`src/services/standingsService.ts`、`src/services/apiFootballSDK.ts`

- `standingsService` 内部：
  - 将 `CACHE_TTL` 从 **1 小时** 提升到 **24 小时**：
    - 旧：`const CACHE_TTL = 60 * 60 * 1000; // 1小时`
    - 新：`const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时`
  - 逻辑：
    - `getStandings(leagueId, season)` 优先命中 `standingsCache`；
    - 只有在缓存过期（>24h）或未命中时才调用 `SDK.getStandings`；
    - 保证 standings 不会被高频重复请求。

- `apiFootballSDK` 内部：
  - 将 `CACHE_TTL.STANDINGS` 从 **1 小时** 调整为 **24 小时**：
    - 旧：`STANDINGS: 60 * 60 * 1000`
    - 新：`STANDINGS: 24 * 60 * 60 * 1000`
  - 这样即使其他地方直接用 SDK 取 standings，也会享受 24 小时级别的缓存。

> 说明：当前并没有基于 React Query 的 standings hook，只有 `useStandings` 使用该 service，并有自己的 30 分钟级 TeamStrength 缓存；真正打 API-Football 的频率由上述 24 小时 TTL 限制。

---

### 2. Prematch Odds（赛前赔率）调度

**相关文件**：`src/services/oddsBatchOptimizer.ts`、`src/services/api.ts`

#### (1) 缓存层 TTL

- 在 `oddsBatchOptimizer.ts` 中：
  - 将 `PREMATCH_CACHE_TTL_MS` 从 **5 分钟** 调整为 **24 小时**：
    - 旧：`const PREMATCH_CACHE_TTL_MS = 300000; // 5分钟`
    - 新：`const PREMATCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时`
  - 含义：赛前赔率在内存缓存中最多保留 24 小时，是否重新打 API 由调度逻辑控制，而不是简单 TTL。

#### (2) 刷新调度逻辑（按开赛时间分段）

- 在 `src/services/api.ts` 中新增了赛前赔率调度控制：
  - 顶部新增常量与控制 Map：
    - `ONE_MINUTE_MS = 60 * 1000`
    - `FIVE_MINUTES_MS = 5 * 60 * 1000`
    - `TEN_MINUTES_MS = 10 * 60 * 1000`
    - `TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000`
    - `prematchNextRefreshAt = new Map<number, number | null>() // fixtureId -> 下次允许刷新时间戳`

- 在 `getLiveMatchesAdvanced` 内部的 `prematchOddsPromise` 里，对每个 match 做分段调度：

  对于每场比赛：

  ```ts
  const now = Date.now();
  const kickoffTimestampSec = match.fixture.timestamp ?? 0;
  const kickoffMs = kickoffTimestampSec * 1000;
  const timeToKickoff = kickoffMs - now;
  const timeSinceKickoff = now - kickoffMs;

  let shouldFetchFromApi = false;
  let nextRefreshAt: number | null = prematchNextRefreshAt.get(fixtureId) ?? null;
  ```

  - **距开赛 > 24 小时**：
    - 不请求赛前赔率：`shouldFetchFromApi = false;`
    - 设置下一次刷新时间在 “开赛前 24 小时”：`nextRefreshAt = kickoffMs - TWENTY_FOUR_HOURS_MS;`
  - **距开赛 0–24 小时（赛前窗口）**：
    - 每 **10 分钟** 至多刷新一次：
      - 若 `!nextRefreshAt || now >= nextRefreshAt` → 允许打 API，并将 `nextRefreshAt = now + 10min`；
      - 否则复用缓存，不打 API。
  - **开赛后 0–5 分钟**：
    - 每 **1 分钟** 至多刷新一次：
      - 同样用 `nextRefreshAt` 控制，间隔为 1 分钟；
  - **开赛 5 分钟后**：
    - 不再刷新赛前赔率：`shouldFetchFromApi = false; nextRefreshAt = null;`，交由 live odds 接管。

  然后：

  ```ts
  if (nextRefreshAt !== null) {
    prematchNextRefreshAt.set(fixtureId, nextRefreshAt);
  }

  const cached = getCachedPrematchOdds(fixtureId);
  if (cached !== null && !shouldFetchFromApi) {
    prematchOddsMap.set(fixtureId, cached);
    fetched++;
    return;
  }

  if (!shouldFetchFromApi) {
    // 当前时间窗口不允许刷新且无缓存，跳过该场比赛的赛前赔率请求
    return;
  }

  // 允许刷新：从 API 获取赛前赔率并更新缓存
  const odds = await getOdds(fixtureId);
  if (odds && odds.length > 0) {
    prematchOddsMap.set(fixtureId, odds);
    setCachedPrematchOdds(fixtureId, odds);
    fetched++;
  }
  ```

- 行为总结：
  - **始终优先使用缓存**（如果存在且当前窗口不需要刷新）；
  - 只有在对应时间窗口、且到达了 `nextRefreshAt`，才真正打一次 API-Football 的 `/odds`；
  - 这样在 24 小时预热期为 **10 分钟级**，开赛 0–5 分钟为 **1 分钟级**，5 分钟之后不再刷新赛前赔率，避免长时间使用过期 prematch 线。

---

### 3. Live Fixtures + Live Odds（API-Football 调用频率）

**相关文件**：`src/services/oddsBatchOptimizer.ts`、`api/matches/index.ts`、`src/services/apiFootballSDK.ts`

- **SDK 级别**：在 `apiFootballSDK.ts` 中：
  - `CACHE_TTL.LIVE_FIXTURES = 10 * 1000`（10 秒）
  - `CACHE_TTL.LIVE_ODDS = 10 * 1000`（10 秒）
  - 所有通过 SDK 调用的 live fixtures / live odds 默认被 10 秒级内存缓存保护，不会在 10 秒内重复打 API。

- **批量 live odds 优化器**（前端直连路径）：
  - `oddsBatchOptimizer.ts` 的 `LIVE_CACHE_TTL_MS = 15000`（15 秒），
  - `fetchOddsBatchOptimized` 会：
    - 优先用 `getCachedOdds(fixtureId)` 命中 15 秒内缓存；
    - 若缓存过期或不存在，则批量调用 `getLiveOdds`；
    - 多个并发调用共享 `pendingRequests`，避免同一 fixture 重复请求。

- **聚合 API `/api/matches` 层**：
  - 在 `api/matches/index.ts` 中，将配置改为：

    ```ts
    const CONFIG = {
      CACHE_TTL: 15,              // 15秒内视为新鲜
      STALE_TTL: 60,             // 60秒内允许作为旧数据返回
      STATS_BATCH_SIZE: 10,
      STATS_BATCH_DELAY: 30,
      ODDS_BATCH_SIZE: 8,
      ODDS_BATCH_DELAY: 50,
    };
    ```

  - 行为：
    - /api/matches 若在 **15 秒内**有刷新结果，则直接返回缓存（fixtures + live odds 聚合结果）；
    - 15–60 秒之间，若缓存存在，则返回旧数据并在后台触发 refresh；
    - 超过 60 秒或无缓存时，会获取锁并执行 `refreshMatches`，其中包括 `getLiveFixtures` + `getLiveOddsBatch`；
    - 多个前端用户同时请求时，会优先复用最近 15 秒内的缓存结果，避免多次打 API-Football。

---

## 三、前端 React Query 钩子策略

### 1. useLiveMatchesAdvanced

**相关文件**：`src/hooks/useMatches.ts`、`src/config/constants.ts`、`src/lib/queryClient.ts`

- 配置：
  - 在 `constants.ts` 中，将 `REFRESH_INTERVALS.LIVE_MATCHES` 改为 **10 秒**：

    ```ts
    export const REFRESH_INTERVALS = {
      LIVE_MATCHES: 10000,      // 10秒 - 前端轮询聚合 API
      MATCH_DETAIL: 15000,
      STATISTICS: 20000,
      CORNER_ANALYSIS: 10000,
    };
    ```

  - `queryClient.refetchIntervals.liveMatches` 直接引用该值；
  - 在 `useLiveMatchesAdvanced` 中：

    ```ts
    staleTime: 10 * 1000,
    refetchInterval: options?.refetchInterval ?? refetchIntervals.liveMatches,
    ```

- 行为：
  - 前端每 **10 秒** 调用一次 `useLiveMatchesAdvanced` 的 queryFn（聚合模式下即 `/api/matches`），
  - 后端 `/api/matches` 按 15 秒窗口刷新真实数据，前端以 10 秒节奏拉取已聚合的结果。

### 2. Standings / 联赛信息 Hooks

- 当前项目中没有基于 React Query 的 standings hook；
- Standings 相关数据获取全部通过 `standingsService` + `useStandings`（手动缓存）完成；
- 由于：
  - `standingsService` 现已使用 24 小时 TTL；
  - `apiFootballSDK` 对 standings 也有 24 小时 TTL；
- 实际效果等同于：**staleTime 在 24 小时量级，且无 `refetchInterval` 轮询**。

---

## 四、liveMatches 计算方式与 UI 层结束过滤

### 1. liveMatches 计算（Hook 层）

**相关文件**：`src/hooks/useMatches.ts`

- 在 `useLiveMatchesAdvanced` 的返回中：

  ```ts
  const matches = query.data?.matches ?? [];
  const liveMatches: AdvancedMatch[] = matches;  // 已由后端保证为进行中/相关比赛

  return { ...query, liveMatches };
  ```

- 含义：
  - 不再在 Hook 层按 `status` / `minute` 进行二次过滤；
  - 假定聚合层或底层 `getLiveMatchesAdvanced` 已经返回「进行中/相关」的比赛列表；
  - 任何 UI 上的进一步过滤（如结束状态、分钟、信号等），都在页面/组件层完成。

### 2. UI 层对已结束比赛的过滤

**相关文件**：`src/pages/HomePage.tsx`

- 在 `processedMatches` 的 `useMemo` 中，对结束比赛做防御性过滤：

  ```ts
  const finishedStatusSet = new Set<string | number | undefined>([
    'ft', 'aet', 'pen', 'finished', 'canc', 'awd', 'abd',
    'FT', 'AET', 'PEN', '完场', '已结束',
  ]);

  // 分离已结束和进行中的比赛
  const liveWithScores: MatchWithScore[] = [];
  const finishedMatches: MatchWithScore[] = [];

  for (const match of withScores) {
    const status = String(match.status);
    const statusLower = status.toLowerCase();
    if (finishedStatusSet.has(status) || finishedStatusSet.has(statusLower)) {
      finishedMatches.push(match);
    } else {
      liveWithScores.push(match);
    }
  }
  ```

- 行为：
  - 仅在 `status` 为明确终止状态（FT/AET/PEN/finished/CANC/AWD/ABD 以及中文“完场/已结束”）时，将比赛视为结束，
  - 其余状态（包括 `ht` 中场）都被视作仍在「进行中集合」内；
  - HT 场次在 UI 中依然展示卡片、比分与动态条，只是评分/信号可能因 `_unscoreable` 或缺统计数据而显示 `N/A/统计不足`，不会整体隐藏。

---

## 五、HT（中场）信息展示行为

**相关文件**：`src/pages/HomePage.tsx` 及多个 UI 组件（`MatchTableV2`、`LateHunterPanel` 等）

- 针对 HT 状态，新的约定为：
  - Hook 层不再根据 `status` 过滤；
  - HomePage 中仅将明确结束状态比赛分流到 `finishedMatches`，再写入历史；
  - HT 比赛仍然出现在 `liveWithScores`，依然渲染：
    - 比分、红黄牌、进球时间线、动态条等；
    - 评分/信号区域若 `_unscoreable` 或缺统计，则只影响该区域显示（例如显示 `--` 或“统计不足”），不隐藏整条比赛。
  - 仅在 `ft` / `finished` / `aet` / `canc` 等终止状态下，才从主列表中剔除该比赛。

---

## 六、动态赔率逻辑与优先级

### 1. 赔率数据来源与结构

**相关文件**：`src/services/api.ts`、`src/services/apiConverter.ts`、`src/services/oddsService.ts`

- **Live Odds**：
  - 由 `getLiveOdds` 调用 `/api/football/odds?fixture={id}&live=true`（后端再代理到 API-Football 的 live odds）；
  - 类型为 `LiveOddsData`，内部结构为 `odds[]`（市场 id/name/values，values 含 handicap/main 等字段）。

- **Prematch Odds**：
  - 由 `getOdds` 调用 SDK 的 `getPrematchOdds`（底层 `/api/football/odds?fixture={id}` + bookmaker 参数）；
  - 类型为 `OddsData`，内部结构为 `bookmakers[].bets[]`。 

- 在 `apiConverter.ts` 中：
  - 通过 `parseLiveOdds(liveOdds[0], minute)` 解析 live odds（可同时处理 live 数据结构）；
  - 通过 `parseLiveOdds(prematchOdds[0], minute)` + `parsePrematchOdds(prematch)` 解析 prematch，并兼容旧逻辑；
  - 最终生成统一的 `OddsInfo` 写入 `AdvancedMatch.odds`，包括：
    - `handicap.value/home/away`
    - `overUnder.total/over/under`
    - `matchWinner.home/draw/away`
    - `_source`、`_bookmaker`、`_captured_at`、`_is_live`、`_fetch_status` 等元数据。

### 2. 赔率选择优先级（Live 优先，Prematch Fallback）

- 在 `apiConverter.ts` 的核心选择逻辑：

  ```ts
  const hasLiveOdds = !!(liveOddsData && liveOddsData._raw_available);
  const prematchOddsData = prematchOdds && prematchOdds.length > 0
    ? parseLiveOdds(prematchOdds[0], minute)
    : null;
  const hasPrematchOdds = !!(prematchOddsData && prematchOddsData._raw_available);

  let oddsSource = 'N/A';
  let isLiveOdds = false;
  let effectiveOdds: typeof liveOddsData = null;

  if (hasLiveOdds) {
    effectiveOdds = liveOddsData;
    oddsSource = 'API-Football';   // Live 源
    isLiveOdds = true;
  } else if (hasPrematchOdds) {
    // Live odds 不可用时回退到赛前赔率
    console.log(`[ODDS_FALLBACK] fixture=${fixtureId} 使用 prematch 赔率`);
    effectiveOdds = prematchOddsData;
    oddsSource = 'PREMATCH';       // Prematch 源
    isLiveOdds = false;
  }
  ```

- 行为：
  - **优先使用 Live Odds**：当 live odds `_raw_available` 且解析成功时，所有盘口字段来自 live 数据；
  - **仅在 Live 不可用时回退到 Prematch**：
    - 记录一条 `[ODDS_FALLBACK] fixture=xxx 使用 prematch 赔率` 日志；
    - 让 `OddsInfo._source = 'PREMATCH'`，`_is_live = false`；
  - 组件侧（例如 `MatchTableV2`）仍然通过现有的：

    ```ts
    const hasOdds = m.odds?._fetch_status === 'SUCCESS';
    const hasLiveOdds = hasOdds && m.odds?._is_live === true;
    const hasPrematchOdds = hasOdds && m.odds?._source === 'PREMATCH';
    ```

    判断 live / prematch，不需要改 props 或 UI 结构。

### 3. Live Odds 缓存策略

- Live odds 通过 SDK + `oddsBatchOptimizer` 控制：
  - SDK：`CACHE_TTL.LIVE_ODDS = 10秒`，避免 10 秒内重复打 API-Football；
  - 批量优化器：`LIVE_CACHE_TTL_MS = 15秒`，再包一层 15 秒级缓存；
  - 聚合 API `/api/matches` 每 15 秒刷一次完整的 fixtures + odds 集合，
    前端每 10 秒轮询自己服务器，最多看到约一个缓存周期内的延迟。

---

## 七、不破坏现有悬浮窗和 UI 结构的保证

- 所有更改都集中在：
  - **服务层 / 缓存层**：`api.ts`、`standingsService.ts`、`apiFootballSDK.ts`、`oddsBatchOptimizer.ts`、`api/matches/index.ts`；
  - **Hook 层**：`useLiveMatchesAdvanced` 的返回结构保持 `{ ...query, liveMatches }` 不变；
  - **UI 层**：`HomePage` 仅在内部对结束状态做过滤，不改变 `MatchTableV2`、悬浮窗组件的 props 结构；
  - **赔率结构**：`AdvancedMatch.odds` 的字段命名和结构未改动，只在源选择和缓存策略上做了加强。

- 现有悬浮窗、赔率提示、DebugModal 等组件依旧使用原有的：
  - `match.odds._source`
  - `match.odds._is_live`
  - `match.odds.overUnder.total`
  - `match.odds.handicap.value`

  等字段，不需要变更调用方式。

---

## 八、构建检查

- 本次修改后已运行：`bun run build`：
  - 在当前环境中失败原因是缺少全局 `tsc` 命令（`tsc: command not found`），
  - 但对修改过的 TypeScript/TSX 文件使用了 Cursor 的 `ReadLints` 检查，未发现新的类型错误或语法错误。

> 建议你在本地环境（安装有 TypeScript CLI 的地方）再跑一次 `bun run build` 以最终确认。
