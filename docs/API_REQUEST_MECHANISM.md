# 🔄 API 请求机制完整说明

**当前问题**: 数据不对齐 + 赔率不更新
**诊断时间**: 2026-03-01

---

## 📊 当前架构总览

```
┌──────────────┐
│  用户浏览器   │
└──────┬───────┘
       │ (每15秒轮询)
       ↓
┌──────────────────────┐
│  React Query         │
│  - 自动轮询          │
│  - 本地缓存          │
│  - 失败重试          │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────────────────────────────┐
│  双模式选择 (useMatches.ts)                   │
│  1. 优先: 后端聚合 API                        │
│  2. Fallback: 直连 API-Football              │
└──────┬───────────────────────────────────────┘
       │
       ├─── 模式1: 后端聚合 ────────┐
       │                            ↓
       │                    ┌───────────────┐
       │                    │ /api/matches  │
       │                    │ (Vercel Edge) │
       │                    └───────┬───────┘
       │                            │ (60秒缓存)
       │                            ↓
       │                    ┌───────────────────┐
       │                    │  Vercel KV 缓存    │
       │                    │  - 60秒 TTL       │
       │                    │  - 分布式锁       │
       │                    └───────┬───────────┘
       │                            │
       │                            ↓
       │                    ┌────────────────────────┐
       │                    │  批量调用 API-Football │
       │                    │  - Fixtures           │
       │                    │  - Statistics (批量)   │
       │                    │  - Events (批量)       │
       │                    │  - Live Odds (批量)    │
       │                    │  - Prematch Odds      │
       │                    └────────────────────────┘
       │
       └─── 模式2: 直连 (Fallback) ──┐
                                      ↓
                              ┌───────────────────┐
                              │  API-Football SDK │
                              │  - 单个请求        │
                              │  - 前端缓存        │
                              └───────────────────┘
```

---

## ⏱️ 轮询间隔配置

### 前端轮询 (React Query)

**配置文件**: `src/config/constants.ts`

```typescript
export const REFRESH_INTERVALS = {
  LIVE_MATCHES: 30000,      // ✅ 30秒 (Live 比赛列表)
  MATCH_DETAIL: 15000,      // ✅ 15秒 (单场比赛详情)
  STATISTICS: 20000,        // ✅ 20秒 (比赛统计)
  CORNER_ANALYSIS: 10000,   // ✅ 10秒 (角球分析)
};
```

**实际使用** (`src/hooks/useMatches.ts`):

```typescript
// 1. Live 比赛高级格式
useLiveMatchesAdvanced({
  refetchInterval: 15 * 1000  // ⚠️ 15秒！(不是30秒)
})

// 2. Today 比赛高级格式
useTodayMatchesAdvanced({
  refetchInterval: 30 * 1000  // ✅ 30秒
})

// 3. 单场比赛详情
useMatchAdvanced({
  refetchInterval: REFRESH_INTERVALS.MATCH_DETAIL  // ✅ 15秒
})

// 4. 比赛统计
useMatchStatistics({
  refetchInterval: REFRESH_INTERVALS.STATISTICS  // ✅ 20秒
})
```

### 后端缓存 (Vercel KV)

**配置文件**: `api/matches/index.ts`

```typescript
const CONFIG = {
  CACHE_TTL: 60,        // ⚠️ 60秒缓存！
  STALE_TTL: 300,       // 5分钟过期
  STATS_BATCH_SIZE: 10,
  STATS_BATCH_DELAY: 30,
  ODDS_BATCH_SIZE: 8,
  ODDS_BATCH_DELAY: 50,
};
```

---

## 🚨 问题根源分析

### 问题1: 多层缓存叠加延迟

```
用户看到的数据年龄 = React Query缓存 + Vercel KV缓存 + API响应时间

最坏情况：
  React Query 刚拿到数据 (0秒)
  ↓
  Vercel KV 即将过期 (59秒旧数据)
  ↓
  API-Football 响应延迟 (5秒)

= 用户看到的是 64秒前的数据！
```

**实际案例**:
- 比赛在第80分钟进球 (4-1)
- React Query 在第79分钟55秒获取数据 (比分 3-1)
- Vercel KV 缓存是第19分钟的数据 (比分 1-0, 大小球 2.5)
- 用户在第80分钟5秒看到: **1-0, 大2.5** ❌

### 问题2: Live Odds 不跟随比分

**当前逻辑** (`api/lib/aggregator.ts`):

```typescript
// ❌ 问题: 没有验证赔率是否匹配当前比分
function parseLiveOdds(liveOdds: LiveOddsData[]): OddsInfo {
  // ...解析盘口线...
  result.overUnder.total = 2.5;  // 直接使用API返回值

  // ⚠️ 缺失: 没有检查已进球数 vs 盘口线
  // ⚠️ 缺失: 没有检查封盘/暂停状态
  // ⚠️ 缺失: 没有验证数据新鲜度
}
```

**为什么会出现"已进5球但显示大2.5"**:

1. **API-Football 封盘**: 博彩公司暂停该比赛投注
   ```json
   {
     "status": {
       "stopped": true,  // ⚠️ 已暂停
       "blocked": true   // ⚠️ 已封盘
     },
     "odds": [...]  // ⚠️ 返回的是封盘前的旧赔率！
   }
   ```

2. **回退到 Prematch Odds**: 当 Live Odds 获取失败时
   ```typescript
   // api/lib/aggregator.ts Line 926
   let odds = parseLiveOdds(liveOdds);
   if (!odds) {
     odds = parsePrematchOdds(prematchOdds);  // ⚠️ 回退到赛前赔率！
   }
   ```

3. **缓存未失效**: Vercel KV 仍在返回旧数据

### 问题3: 前后端轮询不同步

```
时间轴:
0s   - 前端请求1 → 后端缓存 (比分1-0, 大2.5)
15s  - 前端请求2 → 后端缓存 (命中, 返回旧数据)
30s  - 前端请求3 → 后端缓存 (命中, 返回旧数据)
45s  - 前端请求4 → 后端缓存 (命中, 返回旧数据)
60s  - 前端请求5 → 后端缓存过期，刷新中...
61s  - ⚠️ 此时比赛已进5球，但用户仍看到 1-0！
75s  - 前端请求6 → 后端缓存刷新完成 (比分5-0, 但大小球已封盘)
```

---

## 🛠 优化方案

### 方案1: 减少缓存时间（立即实施）✅

**修改**: `api/matches/index.ts`

```typescript
const CONFIG = {
  CACHE_TTL: 10,        // ✅ 从 60 → 10 秒
  STALE_TTL: 30,        // ✅ 从 300 → 30 秒
  STATS_BATCH_SIZE: 10,
  STATS_BATCH_DELAY: 30,
  ODDS_BATCH_SIZE: 8,
  ODDS_BATCH_DELAY: 50,
};
```

**效果**:
- 最大数据延迟: 10s (后端) + 15s (前端) = 25秒
- 减少 API 调用: 保持批量处理

### 方案2: 智能赔率验证（今天实施）✅

**新增**: `api/lib/aggregator.ts` 增强 `parseLiveOdds`

```typescript
function parseLiveOdds(
  liveOdds: LiveOddsData[] | undefined,
  currentGoals: { home: number; away: number }  // 🔥 新增参数
): OddsInfo | null {
  // ... 原有逻辑 ...

  // 🔥 新增: 验证封盘状态
  if (data.status?.stopped || data.status?.blocked) {
    console.warn('[Odds] Market is stopped/blocked');
    result._fetch_status = 'STOPPED';
    result._is_stopped = true;
  }

  // 🔥 新增: 验证大小球合理性
  if (result.overUnder.total !== null) {
    const totalGoals = currentGoals.home + currentGoals.away;

    if (totalGoals >= result.overUnder.total) {
      console.error(
        `[Odds] Invalid O/U: line=${result.overUnder.total}, goals=${totalGoals}`
      );

      // 自动修正
      result.overUnder.total = Math.ceil(totalGoals + 0.5);
      result.overUnder._validation_failed = true;
    }
  }

  return result;
}
```

### 方案3: 前端显示优化（本周实施）

**新增**: 前端显示验证警告

```typescript
// src/components/OddsDisplay.tsx
function OddsDisplay({ match }: { match: AdvancedMatch }) {
  const totalGoals = match.home.score + match.away.score;
  const ouLine = match.odds?.overUnder?.total;

  // 🔥 检测荒谬的赔率
  if (ouLine && totalGoals >= ouLine) {
    return (
      <div className="text-red-500">
        ⚠️ 赔率异常 (已{totalGoals}球，盘口{ouLine})
      </div>
    );
  }

  // 🔥 检测封盘状态
  if (match.odds?._is_stopped) {
    return (
      <div className="text-amber-500">
        🚫 盘口已暂停
      </div>
    );
  }

  return <div>大{ouLine}</div>;
}
```

### 方案4: 考虑 WebSocket（未来）

**优点**:
- ⚡ 实时推送，0延迟
- 💰 减少轮询，节省API调用

**缺点**:
- ⚠️ API-Football 不提供 WebSocket
- ⚠️ 需要自建中转服务器
- ⚠️ 开发成本高

**决策**: 暂不实施，优先修复当前问题

---

## 📋 修复检查清单

### Phase 1: 紧急修复（今天完成）✅
- [ ] 修改 CACHE_TTL: 60s → 10s
- [ ] 增强 `parseLiveOdds` 函数
  - [ ] 添加比分验证
  - [ ] 检测封盘状态
  - [ ] 智能修正异常盘口
- [ ] 添加日志输出

### Phase 2: 前端增强（本周）
- [ ] 显示赔率验证警告
- [ ] 显示封盘/暂停状态
- [ ] 显示数据年龄（cacheAge）
- [ ] 添加手动刷新按钮

### Phase 3: 监控优化（下周）
- [ ] 记录异常赔率到日志
- [ ] 创建数据质量仪表板
- [ ] 设置 Sentry 错误追踪
- [ ] API 调用统计分析

---

## 🧪 验证方法

### 测试场景1: 高比分比赛
1. 找一场进5+球的比赛
2. 检查大小球盘口是否 > 当前进球数
3. 检查是否显示"封盘"警告

### 测试场景2: 数据延迟
1. 记录比赛进球时间
2. 检查前端显示更新时间
3. 验证延迟 < 30秒

### 测试场景3: 缓存失效
1. 清空 Vercel KV 缓存
2. 刷新页面
3. 验证数据正确

---

## 📊 当前状态 vs 目标状态

| 指标 | 当前 | 目标 | 改进 |
|------|------|------|------|
| 最大数据延迟 | 64秒 | 25秒 | ⬇️ 61% |
| 后端缓存 TTL | 60秒 | 10秒 | ⬇️ 83% |
| 前端轮询间隔 | 15秒 | 15秒 | 保持 |
| 赔率验证 | ❌ 无 | ✅ 有 | 🆕 新增 |
| 封盘检测 | ❌ 无 | ✅ 有 | 🆕 新增 |
| 异常拦截 | ❌ 无 | ✅ 有 | 🆕 新增 |

---

## 💡 长期优化建议

1. **引入 Server-Sent Events (SSE)**
   - 单向推送，比 WebSocket 简单
   - Vercel Edge Functions 支持

2. **多数据源对比验证**
   - API-Football + The Odds API
   - 交叉验证赔率准确性

3. **本地状态预测**
   - 根据比赛分钟数预测盘口变化
   - 当API数据异常时显示预测值

4. **CDN 边缘缓存**
   - 使用 Cloudflare Workers KV
   - 全球分布式缓存，延迟更低

---

**下一步**: 立即开始修复 `api/matches/index.ts` 和 `api/lib/aggregator.ts`

**预期修复时间**: 1-2 小时
**验证时间**: 找一场进行中的高比分比赛测试
