# 🔍 数据对齐诊断报告

**问题**: 已进5球但动态赔率还显示大2.5
**根本原因**: API Football 字段映射错误 + Live Odds 未正确更新
**严重程度**: 🚨 致命 - 直接影响交易决策

---

## 🚨 问题现象

### 症状
1. ❌ **初始盘口数值不对** - 赛前赔率未正确解析
2. ❌ **Live odds 不对** - 滚球赔率未实时更新
3. ❌ **盘口不跟随比分** - 已进5球仍显示大2.5

### 影响范围
- ⚠️ 用户看到的所有赔率数据都不可信
- ⚠️ 基于赔率的交易信号失效
- ⚠️ EV 计算完全错误

---

## 🔬 根因分析

### 问题1: Live Odds 响应结构不一致

**API Football 的设计陷阱**:
```typescript
// ❌ 错误理解: Live Odds 和 Prematch Odds 结构相同
// ✅ 真相: 它们完全不同！

// Prematch Odds 结构
{
  bookmakers: [{
    bets: [{
      id: 5,
      values: [{ value: "Over 2.5", odd: "1.85" }]
    }]
  }]
}

// Live Odds 结构 (完全不同！)
{
  odds: [{              // ⚠️ 是 odds 不是 bookmakers！
    id: 36,
    name: "Over/Under Line",
    values: [{
      value: "Over",    // ⚠️ 是 "Over" 不是 "Over 2.5"
      odd: "1.85",
      handicap: "2.5",  // ⚠️ 盘口线在 handicap 字段！
      main: true        // ⚠️ 主盘口标记
    }]
  }]
}
```

### 问题2: 当前代码的错误假设

**错误位置**: `lib/vercel-api/aggregator.ts` Line 553-612

```typescript
// ❌ 当前逻辑问题
const ouMarket = data.odds.find(o =>
  o.name === 'Over/Under Line' ||  // ✅ 正确
  o.id === 36 ||                   // ✅ 正确
  o.id === 25 ||                   // ✅ 正确
  o.id === 5                       // ❌ 错误！5 是赛前ID
);

// ❌ 问题: 没有验证数据是否最新
// ❌ 问题: 没有检查 data.status.stopped (暂停投注)
// ❌ 问题: 回退到赛前赔率时没有警告
```

### 问题3: 缓存未失效

**缓存策略问题**:
```typescript
// lib/vercel-api/matches-route.ts
const CONFIG = {
  CACHE_TTL: 60,  // ❌ 60秒缓存太长！
  // 问题: 比赛可能在60秒内进3球，但用户看到的是旧赔率
};
```

### 问题4: 数据验证缺失

**当前代码没有验证**:
1. ❌ Live Odds 时间戳是否新鲜
2. ❌ 赔率是否与当前比分匹配
3. ❌ 是否被博彩公司封盘/暂停

---

## 🛠 修复方案

### 方案1: 增强 Live Odds 解析（立即修复）

**文件**: `lib/vercel-api/aggregator.ts`

```typescript
// ✅ 修复后的 parseLiveOdds 函数
function parseLiveOdds(
  liveOdds: LiveOddsData[] | undefined,
  currentGoals: { home: number; away: number }  // 🔥 新增: 当前比分
): OddsInfo | null {
  if (!liveOdds || liveOdds.length === 0) {
    console.warn('[parseLiveOdds] No liveOdds data');
    return null;
  }

  const data = liveOdds[0];

  // 🔥 新增: 验证数据新鲜度
  const updateTime = new Date(data.update).getTime();
  const now = Date.now();
  const ageSeconds = (now - updateTime) / 1000;

  if (ageSeconds > 120) {  // 2分钟以上视为过期
    console.warn(`[parseLiveOdds] Stale data: ${ageSeconds}s old`);
  }

  // 🔥 新增: 检查封盘/暂停状态
  if (data.status?.stopped || data.status?.blocked) {
    console.warn('[parseLiveOdds] Odds are stopped/blocked');
    return {
      ...result,
      _is_stopped: true,
      _is_blocked: data.status.blocked,
      _fetch_status: 'STOPPED',
    };
  }

  // ... 原有解析逻辑 ...

  // 🔥 新增: 大小球合理性验证
  if (result.overUnder.total !== null) {
    const totalGoals = currentGoals.home + currentGoals.away;

    // 已进球数 > 盘口线，说明数据错误
    if (totalGoals >= result.overUnder.total) {
      console.error(
        `[parseLiveOdds] Invalid O/U line: ${result.overUnder.total} ` +
        `but game has ${totalGoals} goals! Using fallback.`
      );

      // 🔥 智能修正: 自动上调盘口线
      const suggestedLine = Math.ceil(totalGoals + 0.5);
      result.overUnder = {
        ...result.overUnder,
        total: suggestedLine,
        _validation_failed: true,
        _original_line: result.overUnder.total,
      };
    }
  }

  return result;
}
```

### 方案2: 修复赛前赔率解析

**文件**: `lib/vercel-api/aggregator.ts`

```typescript
// ✅ 修复 parsePrematchOdds 函数
function parsePrematchOdds(prematchOdds: OddsData[] | undefined): OddsInfo | null {
  if (!prematchOdds || prematchOdds.length === 0) return null;

  const data = prematchOdds[0];
  if (!data.bookmakers || data.bookmakers.length === 0) return null;

  // 🔥 优先选择 Bet365 (id=8) 或 Pinnacle (id=1)
  let bookmaker = data.bookmakers.find(b => b.id === 8 || b.id === 1);
  if (!bookmaker) {
    bookmaker = data.bookmakers[0];
  }

  const result: OddsInfo = { /* ... */ };

  for (const bet of bookmaker.bets) {
    // 大小球 - bet.id: 5 (赛前)
    if (bet.id === 5 || bet.name === 'Goals Over/Under') {
      // 🔥 修复: 优先查找 2.5 盘口
      const targetLines = [2.5, 2.75, 2.25, 3.0, 2.0, 3.5];

      for (const targetLine of targetLines) {
        const overVal = bet.values.find(v =>
          v.value.toLowerCase().includes('over') &&
          v.value.includes(targetLine.toString())
        );
        const underVal = bet.values.find(v =>
          v.value.toLowerCase().includes('under') &&
          v.value.includes(targetLine.toString())
        );

        if (overVal && underVal) {
          result.overUnder = {
            over: parseFloat(overVal.odd) || null,
            under: parseFloat(underVal.odd) || null,
            total: targetLine,
            overTrend: 'stable',
            underTrend: 'stable',
          };
          console.log(`[parsePrematchOdds] Found O/U ${targetLine}: Over=${overVal.odd}, Under=${underVal.odd}`);
          break;
        }
      }
    }

    // 让球盘 - bet.id: 8
    if (bet.id === 8 || bet.name === 'Asian Handicap') {
      const homeVal = bet.values.find(v => v.value.includes('Home'));
      const awayVal = bet.values.find(v => v.value.includes('Away'));

      if (homeVal && awayVal) {
        // 🔥 修复: 正确解析盘口线 "Home -0.5" → -0.5
        const lineMatch = homeVal.value.match(/-?\d+\.?\d*/);
        const line = lineMatch ? parseFloat(lineMatch[0]) : null;

        result.handicap = {
          home: parseFloat(homeVal.odd) || null,
          away: parseFloat(awayVal.odd) || null,
          value: line,
          homeTrend: 'stable',
          awayTrend: 'stable',
        };

        console.log(`[parsePrematchOdds] Found Handicap ${line}: Home=${homeVal.odd}, Away=${awayVal.odd}`);
      }
    }
  }

  return result;
}
```

### 方案3: 减少缓存时间

**文件**: `lib/vercel-api/matches-route.ts`

```typescript
const CONFIG = {
  CACHE_TTL: 10,        // ✅ 从 60 → 10 秒
  STALE_TTL: 30,        // ✅ 从 300 → 30 秒
  ODDS_BATCH_SIZE: 8,
  ODDS_BATCH_DELAY: 50,
};
```

### 方案4: 添加数据验证中间件

**新建文件**: `lib/vercel-api/odds-validator.ts`

```typescript
/**
 * 赔率数据验证器
 * 防止显示明显错误的赔率
 */

export interface OddsValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  suggestedFix?: Partial<OddsInfo>;
}

export function validateOdds(
  odds: OddsInfo,
  match: { goals: { home: number; away: number }; minute: number }
): OddsValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let suggestedFix: Partial<OddsInfo> | undefined;

  // 验证1: 大小球盘口合理性
  if (odds.overUnder.total !== null) {
    const totalGoals = match.goals.home + match.goals.away;

    if (totalGoals >= odds.overUnder.total) {
      errors.push(
        `O/U line ${odds.overUnder.total} invalid: game already has ${totalGoals} goals`
      );

      // 建议修正
      suggestedFix = {
        overUnder: {
          ...odds.overUnder,
          total: Math.ceil(totalGoals + 0.5),
          _validation_failed: true,
        },
      };
    }

    // 晚期比赛应该有更高的盘口
    if (match.minute >= 75 && odds.overUnder.total < totalGoals + 0.5) {
      warnings.push(
        `Late game (${match.minute}') but O/U line only ${odds.overUnder.total}`
      );
    }
  }

  // 验证2: 赔率数值合理性
  if (odds.overUnder.over && (odds.overUnder.over < 1.01 || odds.overUnder.over > 100)) {
    errors.push(`Over odds ${odds.overUnder.over} out of range`);
  }

  // 验证3: 时间戳新鲜度
  if (odds._captured_at) {
    const ageMs = Date.now() - new Date(odds._captured_at).getTime();
    if (ageMs > 120000) {  // 2分钟
      warnings.push(`Odds data is ${Math.round(ageMs / 1000)}s old`);
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
    suggestedFix,
  };
}
```

---

## 🧪 测试用例

### 测试场景1: 高比分游戏

```typescript
// 输入
const match = {
  goals: { home: 3, away: 2 },  // 5-2，总进球 5
  minute: 85
};

const liveOdds = {
  overUnder: { total: 2.5 }  // ❌ 错误！已经5球了
};

// 期望输出
const validated = validateOdds(liveOdds, match);
// validated.isValid === false
// validated.errors[0] === "O/U line 2.5 invalid: game already has 5 goals"
// validated.suggestedFix.overUnder.total === 5.5
```

### 测试场景2: 封盘状态

```typescript
const liveOdds = {
  _is_stopped: true,
  _is_blocked: false
};

// 期望: 前端显示 "盘口已暂停"
```

---

## 📋 修复检查清单

### Phase 1: 紧急修复（今天）✅
- [ ] 修改 `parseLiveOdds` 函数增加比分验证
- [ ] 修改 `parsePrematchOdds` 提高准确性
- [ ] 减少缓存时间 60s → 10s
- [ ] 添加日志输出诊断

### Phase 2: 增强验证（明天）
- [ ] 创建 `odds-validator.ts`
- [ ] 集成到 aggregator 中
- [ ] 前端显示验证警告
- [ ] 添加 E2E 测试

### Phase 3: 监控告警（本周）
- [ ] 记录赔率异常到日志
- [ ] 创建数据质量仪表板
- [ ] 设置 Sentry 错误追踪

---

## 🔗 相关文件清单

| 文件 | 需要修改 | 优先级 |
|------|---------|--------|
| `lib/vercel-api/aggregator.ts` | ✅ 是 | 🔥 最高 |
| `lib/vercel-api/matches-route.ts` | ✅ 是 | 🔥 最高 |
| `lib/vercel-api/odds-validator.ts` | ✅ 新建 | ⭐ 高 |
| `src/services/oddsService.ts` | ⚠️ 检查 | ⭐ 高 |
| `src/services/apiConverter.ts` | ⚠️ 检查 | ⭐ 中 |

---

**下一步**: 立即开始修复 `lib/vercel-api/aggregator.ts` 中的 `parseLiveOdds` 函数

**预期效果**:
- ✅ Live Odds 准确反映当前比分
- ✅ 封盘/暂停状态正确显示
- ✅ 数据过期时自动警告
- ✅ 明显错误的赔率被拦截

**修复时间**: 1-2小时
**验证方法**: 找一场高比分比赛，检查赔率是否正确跟随
