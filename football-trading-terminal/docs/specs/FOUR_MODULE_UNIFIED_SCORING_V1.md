############################################################
# FOUR-MODULE UNIFIED SCORING FRAMEWORK  (A/B/C/D)
# v1.0  | 目标：同一套"评分+置信度+理由"框架，支撑不同模块信号
############################################################

核心理念（必须统一）：
- Score（热度/触发强度）：0-100，越高越"值得盯/值得下"
- Confidence（置信度）：0-100，越高越"数据充分+市场验证+模型一致"
- Reasons（可解释理由）：结构化JSON，UI直接展示"为什么"
- Strict：缺数据=降置信度，不是乱给高分（除非模块规则允许）

统一输出格式（所有模块必须返回同结构）：
{
  fixture_id,
  module: "A|B|C|D",
  minute,
  score: 0-100,
  confidence: 0-100,
  action: "WATCH|PREPARE|BET|IGNORE",
  bet_plan: { market, line, selection, odds_min, stake_pct, ttl_minutes },
  reasons: {
    state: {...},          # 比赛态势摘要
    stats: {...},          # 射门/射正/xG/角球等关键数
    market: {...},         # 盘口/水位/隐含概率/波动
    deltas: {...},         # 最近N分钟变化（动量）
    tags: [...],           # 场景标签
    checks: {...}          # 数据质量与一致性检查
  }
}

------------------------------------------------------------
# 1) "评分 Score"统一拆解：Score = Base + Edge + Timing + Market + Quality
------------------------------------------------------------

Score ∈ [0,100]，建议权重（可调但先固定）：
- Base（基础态势）      0-20
- Edge（优势/压制）      0-30
- Timing（时间窗口）     0-20
- Market（盘口验证）     0-20
- Quality（数据质量加成/扣分） -10~+10

注意：
- 之前"基础分30"太玄学，改成 Base 0-20，用可量化变量映射
- 射门不到20就0分这种"硬阈值"全部改为"连续函数/分段函数"

------------------------------------------------------------
# 2) "置信度 Confidence"统一拆解：Confidence = Data + Stability + Consistency + MarketConfirm
------------------------------------------------------------

Confidence ∈ [0,100]：
- DataCompleteness（数据完整）     0-35
- Freshness/Stability（数据新鲜/稳定）0-20
- CrossSourceConsistency（交叉一致） 0-25
- MarketConfirmation（市场确认）      0-20

规则：
- 缺少 stats/events/odds 任意关键项 -> 降置信度，不直接判0分
- 如果"数据异常"（例如10分钟后shots=0但比分在变）-> 置信度大幅扣分并标红

------------------------------------------------------------
# 3) 四模块各自"Edge定义"，其它项复用统一逻辑
------------------------------------------------------------

############################
# Module A：大球冲刺 (Over Sprint)
############################
适用：70'~90'+ 重点（也支持HT前小窗口）
目标：预测"后段进球/大球方向"机会

A.Edge（0-30）由以下连续指标合成：
- PressureIndex（压制强度）0-12
  示例：最近15分钟 (shots + 2*shots_on + 1.5*xg_delta + corners_delta) 归一化
- xGVelocity（xG增长速度）0-8
  xg_last15 / 15min 的分段映射（不是阈值0/满）
- ShotQuality（射正率/转化潜力）0-6
  shots_on / max(shots,1) + big_chances(可选)
- GameStateBias（比分结构）0-4
  0-0/1-0/0-1/1-1 等不同状态给予不同上限（例如落后方压上更利大球）

A.Market（0-20）：
- OU line movement toward over（0-10）
- Over price drift (下降=更被买入)（0-6）
- 盘口/水位与统计同向（0-4）

A.Timing（0-20）：
- minute in [78,90] 给最高（比如钟形/梯形函数）
- 补时阶段如果压制持续 -> 额外加成

############################
# Module B：强队反扑 (Strong Team Comeback)
############################
为什么叫反扑：定义是"强队在落后/被逼平情况下，末段显著提高进攻强度并且市场开始重新定价"
适用：60'~90'
输入：team_strength（赛季强弱）、排名、初盘让球、即时让球变化

B.Edge（0-30）：
- StrengthGap（强弱差）0-10
  来自 model_team_strength 或 standings/rank 差异 + 初盘让球（让球越深强队越强）
- TrailingState（落后/平局压力）0-6
  强队未领先时 + 分
- RallyMomentum（反扑动量）0-10
  最近20分钟强队shots/xg占比上升、控球回升、危险进攻提升（有则用）
- FinishingSupport（阵容/换人）0-4
  若有 players/lineups 可加，否则忽略不硬扣

B.Market（0-20）：
- 强队方向水位下调/让球回拉（0-12）
- 1X2隐含概率回升（0-8）

B.Timing（0-20）：
- 70'后强队持续压制+盘口确认 -> 峰值
- 若强队早段压制但市场未动 -> 置信度不高

############################
# Module C：盘口错位 (Line Mispricing)
############################
定义：统计态势显示A，但盘口/隐含概率定价仍偏向B（或变化滞后）
适用：任何时间段（更偏 20'~80'）

C.Edge（0-30）：
- ModelVsMarketGap（模型-市场差）0-20
  用 stats/xg/pressure 估计 goal_prob_next15 或 over_prob
  与 market implied prob 比较（差越大分越高）
- LagScore（盘口滞后）0-10
  统计已经连续多个窗口偏一边，但盘口未响应

C.Market（0-20）：
- 多博彩公司一致性（若用 OddsAPI）（0-10）
- 盘口深度/流动性指标（0-10）

C.Timing（0-20）：
- 选择"市场最容易修正的窗口"加分（例如进球前5-10分钟的强压）

############################
# Module D：水位异常 (Odds Anomaly)
############################
定义：盘口/水位出现异常跳变，且无法被比分/红牌等显性事件解释
适用：任何时间段

D.Edge（0-30）：
- JumpMagnitude（跳变幅度）0-12
- JumpSpeed（跳变速度）0-8
- UnexplainedFactor（不可解释性）0-10
  若 events无红牌/进球且 stats无突变 -> 分更高

D.Market（0-20）：
- 多源一致（API-Football odds vs OddsAPI 多book）（0-12）
- 历史异常频率（0-8）（需要历史赔率）

D.Timing（0-20）：
- 关键时段（临近HT/80+）异常更危险/更有价值（按策略）

------------------------------------------------------------
# 4) 统一"连续函数"替代硬阈值（解决你说的"射门<20=0分"）
------------------------------------------------------------

推荐统一映射函数（示例）：

1) shots_score(shots_total):
- 0-5   -> 0~2分（线性）
- 5-15  -> 2~8分（线性）
- 15-25 -> 8~12分（线性）
- 25+   -> 12分封顶

2) xg_score(xg_last15):
- 0-0.2 -> 0~2
- 0.2-0.6 -> 2~7
- 0.6-1.2 -> 7~10
- 1.2+ -> 10封顶

3) momentum_score(delta_shots_15, delta_xg_15):
- 用"最近15min - 前15min"的差值做S型函数
- 避免突然从0跳到满分

------------------------------------------------------------
# 5) 统一 Action 输出（给你"一目了然"）
------------------------------------------------------------

基于 score & confidence：

- BET：score>=85 且 confidence>=70
- PREPARE：score>=80 且 confidence>=55
- WATCH：score>=70 或 (score>=80但confidence<55)
- IGNORE：其它

并输出 bet_plan（只给建议，不自动下注）：
- market: "OU"|"AH"|"1X2"
- line: 2.5 / -0.5 ...
- selection: "OVER"|"HOME"...
- odds_min: 最低可接受赔率
- stake_pct: 建议本金比例（例如0.5%~2%）
- ttl_minutes: 信号有效期（例如5-10分钟）

------------------------------------------------------------
# 6) UI 显示统一（表格列与你的需求对齐）
------------------------------------------------------------

- "评分"= score（热度）
- "热度/置信"列：显示 confidence
- "赔率趋势"只展示与 bet_plan 同方向的趋势
- 点击"评分/置信"弹出 Reasons 面板（结构化解释）

------------------------------------------------------------
# 7) 实施状态
------------------------------------------------------------

## 已完成
- [x] 规范文档创建
- [x] 统一类型定义 (UnifiedSignal, ModuleSignalReasons) - src/types/unified-scoring.ts
- [x] 连续映射函数库 (ContinuousMappers) - src/services/continuousMappers.ts
- [x] Module A 实现 (大球冲刺) - src/services/modules/moduleA.ts
- [x] 统一评分引擎 - src/services/unifiedScoringEngine.ts
- [x] UI 组件 (SignalCard/ReasonsPanel) - src/components/home/SignalCard.tsx
- [ ] Module B 实现 (强队反扑) - Phase 2
- [ ] Module C 实现 (盘口错位) - Phase 2
- [ ] Module D 实现 (水位异常) - Phase 2
- [ ] OddsAPI 多book接入 - Phase 2

############################################################
# END
############################################################
