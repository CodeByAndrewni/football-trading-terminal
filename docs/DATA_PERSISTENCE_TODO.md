# 数据持久化 / 后续待办

已落地：`raw_fixtures.raw.persist_tier` / `persist_tier_reason`（gold / silver / bronze），与 `persistLiveToSupabase` 的日志行统计。

## 可选下一步（未实现）

1. **按档降频**：银档对 `raw_statistics` 降低插入频率（例如每 2～3 次 refresh 写一条），金档保持现状或更密；需与「复盘粒度」需求对齐。
2. **按档查询**：Supabase 视图或 RPC，按 `persist_tier` / 时间过滤，便于「只看有盘口样本」做统计。
3. **赔率快照策略**：金档单独 Cron 或独立 `captured_at` 间隔，与全量 refresh 解耦（省 API）。
4. **中文队名表**：`lib/vercel-api/ai-team-focus.ts` 中 `TEAM_NAME_COMPACT_SNIPPETS` 按需扩充联赛/球队。

## 相关文件

- `lib/vercel-api/supabase-live-persist.ts` — 金/银/铜档与写入
- `lib/vercel-api/ai-team-focus.ts` — AI 焦点中文队名
- `src/services/scoringEngine.ts` — `SCORING_VERBOSE_LOGS` 与不可评分日志
