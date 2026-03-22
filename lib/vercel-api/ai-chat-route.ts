import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseRequestJsonBody } from './parse-request-json.js';
import { getMatches } from './kv.js';
import { buildMatchContext, type AiChatContext } from '../../src/services/aiContext.js';
import type { AdvancedMatch } from '../../src/data/advancedMockData';
import {
  compactJournalForPrompt,
  fetchJournalForPrompt,
  insertAiTradeJournal,
  insertAiTradeJournalAgent,
} from './ai-journal-db.js';
import { aggregateMatches, calculateBasicKillScore } from './aggregator.js';
import { getLiveFixtures, getStatisticsBatch, getEventsBatch } from './api-football.js';
import {
  AI_AGENT_TOOLS,
  createFootballQuota,
  executeAgentTool,
  getDefaultMaxFootballCalls,
  getDefaultMaxToolRounds,
} from './ai-tool-executor.js';

const DEEPSEEK_CHAT_ENDPOINT =
  process.env.DEEPSEEK_CHAT_URL ?? 'https://api.deepseek.com/chat/completions';
const PERPLEXITY_SONAR_ENDPOINT = 'https://api.perplexity.ai/v1/sonar';

const DEFAULT_TOP_N = 20;
const MIN_TOP_N = 3;
const MAX_TOP_N = 30;

type DeepSeekChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type OpenAiToolCall = {
  id: string;
  type: string;
  function: { name: string; arguments: string };
};

type AgentChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: OpenAiToolCall[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function respondChatWithOptionalPersist(
  res: VercelResponse,
  payload: Record<string, unknown>,
  persist:
    | null
    | {
        enabled: boolean;
        message: string;
        answer: string;
        selected: AdvancedMatch[];
        context: AiChatContext;
        mode: string;
      },
): Promise<void> {
  if (persist?.enabled && persist.answer) {
    const id = await insertAiTradeJournal({
      message: persist.message,
      answer: persist.answer,
      selected: persist.selected,
      context: persist.context,
      mode: persist.mode,
    });
    if (id) payload.journalEntryId = id;
  }
  res.status(200).json(payload);
}

async function respondAgentWithOptionalPersist(
  res: VercelResponse,
  payload: Record<string, unknown>,
  opts: {
    persist: boolean;
    message: string;
    answer: string;
    agentMeta: { toolRounds: number; footballCallsUsed: number; maxFootballCalls: number };
  },
): Promise<void> {
  if (opts.persist && opts.answer) {
    const id = await insertAiTradeJournalAgent({
      message: opts.message,
      answer: opts.answer,
      agentMeta: opts.agentMeta,
    });
    if (id) payload.journalEntryId = id;
  }
  res.status(200).json(payload);
}

function extractJsonObject(text: string): unknown | null {
  // 尝试提取模型返回中的第一个 {...} JSON 对象
  const start = text.indexOf('{');
  if (start < 0) return null;
  const end = text.lastIndexOf('}');
  if (end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/** DeepSeek Chat Completions（OpenAI 兼容，支持 tools / tool_calls） */
async function callDeepSeekChat(args: {
  apiKey: string;
  model?: string;
  messages: AgentChatMessage[] | DeepSeekChatMessage[];
  tools?: typeof AI_AGENT_TOOLS;
  temperature?: number;
  timeoutMs?: number;
}): Promise<
  | { ok: true; content: string; message: Record<string, unknown> }
  | { ok: false; status: number; error: unknown }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 120000);

  try {
    const body: Record<string, unknown> = {
      model: args.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      messages: args.messages,
      temperature: typeof args.temperature === 'number' ? args.temperature : 0.6,
      stream: false,
    };
    if (args.tools && args.tools.length > 0) {
      body.tools = args.tools;
      body.tool_choice = 'auto';
    }

    const resp = await fetch(DEEPSEEK_CHAT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, error: json };
    }

    const message = json?.choices?.[0]?.message;
    if (!message || typeof message !== 'object') {
      return { ok: false as const, status: resp.status, error: { reason: 'NO_MESSAGE', json } };
    }

    const content = typeof message.content === 'string' ? message.content : '';
    return { ok: true as const, content, message: message as Record<string, unknown> };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** DeepSeek Chat Completions — streaming mode, returns raw Response for SSE piping */
async function callDeepSeekChatStreamRaw(args: {
  apiKey: string;
  model?: string;
  messages: DeepSeekChatMessage[];
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ ok: true; response: Response } | { ok: false; status: number; error: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 150000);

  try {
    const resp = await fetch(DEEPSEEK_CHAT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        messages: args.messages,
        temperature: typeof args.temperature === 'number' ? args.temperature : 0.6,
        stream: true,
      }),
    });

    if (!resp.ok) {
      clearTimeout(timeoutId);
      const json = await resp.json().catch(() => ({}));
      return { ok: false as const, status: resp.status, error: json };
    }

    // NOTE: we intentionally don't clearTimeout here — it will be cleared
    // when the caller finishes consuming the stream (or on abort).
    // Store cleanup reference on the response for the caller.
    (resp as any).__cleanupTimeout = () => clearTimeout(timeoutId);
    return { ok: true as const, response: resp };
  } catch (e) {
    clearTimeout(timeoutId);
    return { ok: false as const, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function callPerplexitySonar(args: {
  apiKey: string;
  messages: DeepSeekChatMessage[];
  model?: string;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 60000);

  try {
    const resp = await fetch(PERPLEXITY_SONAR_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model ?? 'sonar-pro',
        messages: args.messages,
        temperature: 0.2,
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, error: json };
    }

    const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text;
    if (typeof content !== 'string') {
      return { ok: false as const, status: resp.status, error: { reason: 'NO_CONTENT', json } };
    }

    return { ok: true as const, content };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchLiveMatchesForAi(params: { candidateCount: number }) {
  // 本地回退：不依赖 KV，直接从 API-Football 拉取少量 live fixtures
  // 注意：这会消耗 API-Football 查询额度，因此 candidateCount 需要控制。
  const fixtures = await getLiveFixtures();
  const sortedFixtures = [...fixtures].sort((a, b) => {
    const am = a.fixture?.status?.elapsed ?? 0;
    const bm = b.fixture?.status?.elapsed ?? 0;
    return bm - am;
  });

  const candidates = sortedFixtures.slice(0, params.candidateCount);
  const fixtureIds = candidates.map((f) => f.fixture.id);

  if (fixtureIds.length === 0) return [];

  const statisticsMap = await getStatisticsBatch(fixtureIds, {
    batchSize: 10,
    batchDelay: 0,
  });

  const eventsMap = await getEventsBatch(fixtureIds, {
    batchSize: 10,
    batchDelay: 0,
  });

  const liveOddsMap = new Map<number, any[]>();
  const prematchOddsMap = new Map<number, any[]>();

  const matches = aggregateMatches(candidates as any, statisticsMap as any, eventsMap as any, liveOddsMap as any, prematchOddsMap as any) as any as AdvancedMatch[];

  for (const m of matches) {
    (m as any).noOddsFromProvider = true;
  }

  for (const m of matches) {
    (m as any).killScore = calculateBasicKillScore(m as any);
  }

  matches.sort((a: any, b: any) => (b.killScore ?? 0) - (a.killScore ?? 0));
  return matches;
}

async function runAgentChat(
  res: VercelResponse,
  args: {
    message: string;
    deepseekKey: string;
    canUseKv: boolean;
    persistJournal: boolean;
    journalDays: number;
    journalLimit: number;
  },
): Promise<void> {
  const quota = createFootballQuota(getDefaultMaxFootballCalls());
  const maxRounds = getDefaultMaxToolRounds();
  let toolRounds = 0;

  const journalRows = await fetchJournalForPrompt({
    days: args.journalDays,
    limit: args.journalLimit,
  });
  const journalCompact = compactJournalForPrompt(journalRows);
  const journalPrefix =
    journalCompact.length > 0
      ? `历史判断记录（数据库 ai_trade_journal）：\n${JSON.stringify(journalCompact)}\n\n`
      : '';

  const systemPrompt = [
    '【角色】滚球大球（Over）与 Late Goal（70\'后进球）决策顾问。用户主打大球与后段进球；不要主动推荐小球 Under 作为主攻。',
    '',
    '【数据来源】工具：KV 为 live 聚合；API-Football 为实时接口。未调用工具则无数据。',
    '【记忆】长期判断见 ai_trade_journal。',
    '',
    '【逻辑】后段易出球：体能降、防守松、落后压上、换人攻、反击空间等。勿编造具体百分比。',
    '',
    '【场景】A压制落后 B高xG低比分 C易进球比分不匹配 D高压体能 E关键战 F红牌 G进球后风暴 H射门角球暴涨 I搏命换人。',
    '【排除】拖延、换下前锋、VAR碎片化等。',
    '',
    '【输出】每场：是否入场、大球/下一球方向、窗口止损、置信度+理由；不值得一行 ❌。标题行禁止 ** 粗体。',
  ].join('\n');

  const messages: AgentChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `${journalPrefix}用户问题：\n${args.message}` },
  ];

  let lastAssistantText: string | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const resp = await callDeepSeekChat({
      apiKey: args.deepseekKey,
      messages,
      tools: AI_AGENT_TOOLS,
    });

    if (!resp.ok) {
      res.status(200).json({
        success: true,
        answer:
          'Agent 模型调用失败。请检查 DEEPSEEK_API_KEY 与 DEEPSEEK_MODEL。',
        usedMatchIds: [],
        debug: { reason: 'AGENT_DEEPSEEK_CALL_FAILED', status: resp.status, details: resp.error },
        limitations: [`本请求已消耗 API-Football 调用：${quota.used}/${quota.max}`],
        agent: { toolRounds, footballCallsUsed: quota.used, maxFootballCalls: quota.max },
      });
      return;
    }

    const msg = resp.message;
    const toolCalls = msg.tool_calls as OpenAiToolCall[] | undefined;

    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      lastAssistantText = typeof msg.content === 'string' ? msg.content : '';
      break;
    }

    messages.push({
      role: 'assistant',
      content: typeof msg.content === 'string' ? msg.content : null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      if (!tc?.id || !tc.function?.name) continue;
      const execResult = await executeAgentTool({
        name: tc.function.name,
        argumentsJson: tc.function.arguments ?? '{}',
        quota,
        canUseKv: args.canUseKv,
      });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: execResult.content,
      });
    }

    toolRounds++;
  }

  const limitations: string[] = [`本请求 API-Football 调用次数：${quota.used}/${quota.max}`];

  if (!lastAssistantText) {
    res.status(200).json({
      success: true,
      answer:
        '未在允许轮次内得到最终文本回答（可能仍在工具循环中）。可缩小问题或提高 AI_AGENT_MAX_TOOL_ROUNDS。',
      usedMatchIds: [],
      limitations,
      debug: { reason: 'AGENT_NO_FINAL_MESSAGE' },
      agent: {
        toolRounds,
        footballCallsUsed: quota.used,
        maxFootballCalls: quota.max,
        maxToolRounds: maxRounds,
      },
    });
    return;
  }

  const parsed = extractJsonObject(lastAssistantText);
  const usedMatchIds =
    parsed && typeof parsed === 'object' && (parsed as any).usedMatchIds
      ? (parsed as any).usedMatchIds
      : [];

  if (parsed && typeof parsed === 'object' && (parsed as any).answer) {
    const extra = Array.isArray((parsed as any).limitations) ? (parsed as any).limitations : [];
    await respondAgentWithOptionalPersist(
      res,
      {
        success: true,
        ...(parsed as any),
        usedMatchIds,
        limitations: [...limitations, ...extra],
        agent: {
          toolRounds,
          footballCallsUsed: quota.used,
          maxFootballCalls: quota.max,
          maxToolRounds: maxRounds,
        },
      },
      {
        persist: args.persistJournal,
        message: args.message,
        answer: String((parsed as any).answer),
        agentMeta: {
          toolRounds,
          footballCallsUsed: quota.used,
          maxFootballCalls: quota.max,
        },
      },
    );
    return;
  }

  await respondAgentWithOptionalPersist(
    res,
    {
      success: true,
      answer: lastAssistantText,
      usedMatchIds,
      limitations,
      debug: { reason: 'JSON_PARSE_FAILED' },
      agent: {
        toolRounds,
        footballCallsUsed: quota.used,
        maxFootballCalls: quota.max,
        maxToolRounds: maxRounds,
      },
    },
    {
      persist: args.persistJournal,
      message: args.message,
      answer: lastAssistantText,
      agentMeta: {
        toolRounds,
        footballCallsUsed: quota.used,
        maxFootballCalls: quota.max,
      },
    },
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' }, success: false });
  }

  const body = await parseRequestJsonBody(req);
  const messageRaw = typeof body?.message === 'string' ? body.message : '';
  const message = messageRaw.trim();

  const topN = clamp(
    typeof body?.topN === 'number' ? body.topN : DEFAULT_TOP_N,
    MIN_TOP_N,
    MAX_TOP_N,
  );

  const persistJournal = body?.persistJournal !== false;
  const journalDays = clamp(
    typeof body?.journalDays === 'number' ? body.journalDays : 10,
    1,
    90,
  );
  const journalLimit = clamp(
    typeof body?.journalLimit === 'number' ? body.journalLimit : 20,
    1,
    100,
  );

  const wantStream = body?.stream === true;
  const usePerplexityLegacy = Boolean(body?.usePerplexity);
  const modeRaw = typeof body?.mode === 'string' ? body.mode : null;
  const modeUpper = modeRaw ? modeRaw.toUpperCase() : null;
  type AiMode = 'DEEPSEEK' | 'PERPLEXITY' | 'HYBRID';
  const aiMode: AiMode =
    modeUpper === 'PERPLEXITY'
      ? 'PERPLEXITY'
      : modeUpper === 'DEEPSEEK' || modeUpper === 'MINIMAX'
        ? 'DEEPSEEK'
        : modeUpper === 'HYBRID'
          ? 'HYBRID'
          : usePerplexityLegacy
            ? 'HYBRID'
            : 'DEEPSEEK';

  if (!message) {
    return res.status(400).json({
      success: false,
      error: { code: 'EMPTY_MESSAGE', message: 'message is required' },
    });
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  const useAgent =
    body?.agent === true ||
    (typeof body?.chatMode === 'string' && body.chatMode.toUpperCase() === 'AGENT');

  if (useAgent) {
    if (aiMode !== 'DEEPSEEK') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'AGENT_MODE_REQUIRES_DEEPSEEK',
          message:
            'Agent 模式仅支持 DEEPSEEK（多轮工具调用）。请改用 DEEPSEEK 或关闭 Agent。',
        },
      });
    }
    if (!deepseekKey) {
      return res.status(500).json({
        success: false,
        error: { code: 'DEEPSEEK_API_KEY_NOT_CONFIGURED', message: 'Missing DEEPSEEK_API_KEY' },
      });
    }
    const canUseKvAgent =
      typeof process.env.KV_REST_API_URL === 'string' &&
      process.env.KV_REST_API_URL.length > 0 &&
      typeof process.env.KV_REST_API_TOKEN === 'string' &&
      process.env.KV_REST_API_TOKEN.length > 0;

    return runAgentChat(res, {
      message,
      deepseekKey,
      canUseKv: canUseKvAgent,
      persistJournal,
      journalDays,
      journalLimit,
    });
  }

  if (aiMode !== 'PERPLEXITY' && !deepseekKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'DEEPSEEK_API_KEY_NOT_CONFIGURED', message: 'Missing DEEPSEEK_API_KEY' },
    });
  }

  if (aiMode === 'PERPLEXITY' && !perplexityKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'PERPLEXITY_API_KEY_NOT_CONFIGURED', message: 'Missing PERPLEXITY_API_KEY' },
    });
  }

  let matches: AdvancedMatch[] = [];
  let cacheAgeSeconds: number | null = null;
  let apiFootballError: string | null = null;

  // 1) 优先尝试 KV（生产/已部署时）
  const canUseKv =
    typeof process.env.KV_REST_API_URL === 'string' &&
    process.env.KV_REST_API_URL.length > 0 &&
    typeof process.env.KV_REST_API_TOKEN === 'string' &&
    process.env.KV_REST_API_TOKEN.length > 0;

  if (canUseKv) {
    const kvResult = await getMatches();
    if (kvResult && Array.isArray(kvResult.matches) && kvResult.matches.length > 0) {
      cacheAgeSeconds = kvResult.cacheAge;
      matches = kvResult.matches
        .filter((m: unknown): m is AdvancedMatch => !!m && typeof (m as any).id === 'number')
        .sort((a, b) => (Number((b as any).killScore) || 0) - (Number((a as any).killScore) || 0));
    }
  }

  if (matches.length === 0) {
    // 2) 回退：本地不依赖 KV，直接拉取少量 live fixtures 聚合（消耗 API-Football 配额）
    try {
      matches = await fetchLiveMatchesForAi({ candidateCount: Math.max(topN, 12) });
    } catch (e) {
      apiFootballError = e instanceof Error ? e.message : String(e);
      matches = [];
    }
  }

  if (matches.length === 0) {
    const limitations: string[] = [];
    if (apiFootballError) {
      // 常见：403 Forbidden
      limitations.push(`API-Football 拉取失败：${apiFootballError}`);
    } else {
      limitations.push('当前无法获取 live 比赛上下文（KV 与本地回退均失败）。');
    }

    return res.status(200).json({
      success: true,
      answer:
        '当前无法获取 live 比赛数据，因此无法基于真实数据给出交易/概率结论。\n\n请先检查 `FOOTBALL_API_KEY` 的权限/套餐/IP 风控是否正常（你当前环境里通常表现为 403 Forbidden）。',
      usedMatchIds: [],
      limitations,
      debug: { reason: 'NO_MATCH_CONTEXT' },
    });
  }

  const selected = matches.slice(0, topN);

  const context = buildMatchContext(selected, topN, {
    cacheAgeSeconds,
    includeEvents: true,
    maxEventsPerMatch: 30,
    allMatches: matches,
  });

  const journalRows = await fetchJournalForPrompt({ days: journalDays, limit: journalLimit });
  const journalCompact = compactJournalForPrompt(journalRows);
  const journalSection =
    journalCompact.length > 0
      ? `\n历史判断记录（数据库 ai_trade_journal，按时间顺序；outcome 赛后人工或任务更新）：\n${JSON.stringify(journalCompact)}\n`
      : '';

  const limitations: string[] = [];
  let perplexityBackground: string | null = null;

  const systemPrompt = [
    '【角色】你是滚球大球（Over）与 Late Goal（70 分钟后进球）方向的决策顾问。用户主打大球与后段进球机会；不要主动推荐小球（Under）作为主攻方向。若评估某场 Under 更有价值，仅简要说明并回到大球/下一球/胜负中更有利于「再进球」的方向。',
    '',
    '【为什么后段容易出球】体能下降、防守注意力下降、落后方压上、换人加强进攻、节奏碎片化后的反击等，会同时提高绝杀与大球概率。可用此逻辑解释，但不要编造具体百分比除非 JSON 中有。',
    '',
    '【数据来源】随请求附带「当前 live 聚合比赛上下文」JSON（Vercel KV + API-Football 聚合）。含 matches / allMatchIndex；单场可含 home.rank / away.rank（联赛排名）、enrichment（预测、伤病、阵容、对战、球队赛季统计等，可能截断）。',
    '当用户问到不在 matches 里的比赛时，先在 allMatchIndex 中查找；enrichment 缺字段时写「上下文未提供，勿编造」。',
    '若消息中出现「Perplexity 补充参考」，引用时请区分。',
    '',
    '【记忆】多轮对话不自动传入。长期判断来自 Supabase ai_trade_journal；若有「历史判断记录」JSON 请结合复盘。',
    '',
    '【字段说明】odds.* / killScore / stats / events 同前；rank 为联赛排名（可能为 null）；enrichment 为扩展采集。',
    '',
    '【单次回答结构】',
    '1）若未过中场或 JSON 有半场比分/事件：先给「上半场/阶段性形势」要点（3-6 条）。',
    '2）若比赛 ≥70\'：再给 Late Goal / 大球评估（是否追 Over、下一球、再进球窗口）。',
    '3）杯赛淘汰/保级/争冠等关键战：单独标注重要性；落后方可能全力进攻——提高大球与绝杀权重（若无法从 round/联赛名判断，标注「推断」）。',
    '',
    '【高潜力场景（对照 JSON；缺数据则写无法验证）】',
    'A 强队落后+射门/控球明显压制  B 高xG低比分效率还债  C 双方易进球但比分仍一边倒且非死守',
    'D 高压节奏+后段换人不补防  E 关键战+80\'仍平局或一球差  F 红牌后结构失衡且非摆大巴',
    'G 进球后5-10分钟风暴窗口  H 角球/射门暴涨但比分低  I 搏命换人/阵型前压（从换人事件推断）',
    '',
    '【排除/降权】拖延时间、换下前锋换后卫、长时间 VAR、犯规碎片化无连续进攻等。',
    '',
    '【每场比赛必须回答】',
    '1️⃣ 是否值得为大球/Late 方向入场？（✅ / ❌ / ⏳）',
    '2️⃣ 推荐方向？（优先：大球盘口线、下一球、再进球；避免主推 Under）',
    '3️⃣ 入场窗口与止损？',
    '4️⃣ 置信度 ⭐~⭐⭐⭐ + 理由链（→ 串联因素）',
    '不值得入场：❌ {联赛} {主队} vs {客队} — {原因}',
    '',
    '【过滤】前15\'样本不足标 🟡；stats 全空标 ⚠️；净胜≥3 且 >70\' 可跳过。',
    '',
    '【输出格式】标题行禁止 ** 粗体：',
    '⚽ {联赛} | {主队} vs {客队} | {比分} | ⏱️{分钟} | 排名 #{主} vs #{客}（若有）| 🟨 🟥 | 控球 | 射(正) vs 射(正)',
    '📊 赔率行同上。可用 Markdown 代码块输出 ASCII 框梳理要点。',
    '结论 emoji：✅ ⚠️ ❌ 🔴 🟡 ⭐',
  ].join('\n');

  if (aiMode === 'HYBRID') {
    if (!perplexityKey) {
      limitations.push('HYBRID 模式启用 Perplexity，但服务器端未配置 PERPLEXITY_API_KEY，因此无法获取背景要点。');
    } else {
      const perplexityResp = await callPerplexitySonar({
        apiKey: perplexityKey,
        model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
        messages: [
          {
            role: 'user',
            content: `用户问题：${message}\n\n可作与足球策略、数据解读相关的补充说明。`,
          },
        ],
      });

      if (perplexityResp.ok) {
        perplexityBackground = perplexityResp.content;
      } else {
        limitations.push(
          `Perplexity 调用失败：${
            perplexityResp.error instanceof Object
              ? JSON.stringify(perplexityResp.error).slice(0, 200)
              : String(perplexityResp.error)
          }`,
        );
      }
    }
  }

  const userPrompt = [
    `用户问题：${message}`,
    journalSection,
    '当前 live 聚合比赛上下文（JSON）：',
    JSON.stringify(context),
    '',
    aiMode === 'HYBRID'
      ? perplexityBackground
        ? `Perplexity 补充参考：\n${perplexityBackground}`
        : 'Perplexity 补充参考：未启用或不可用。'
      : undefined,
  ].filter((x) => typeof x === 'string').join('\n');

  if (aiMode === 'HYBRID') {
    const dsResp = await callDeepSeekChat({
      apiKey: deepseekKey!,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    if (!dsResp.ok) {
      return res.status(200).json({
        success: true,
        answer: '模型调用失败，请稍后再试。请检查 DEEPSEEK_API_KEY 是否配置正确。',
        usedMatchIds: selected.map((m) => m.id),
        debug: { reason: 'DEEPSEEK_CALL_FAILED', status: dsResp.status, details: dsResp.error },
        limitations: limitations.length > 0 ? limitations : undefined,
      });
    }

    const parsed = extractJsonObject(dsResp.content);
    const usedMatchIds =
      parsed && typeof parsed === 'object' && (parsed as any).usedMatchIds
        ? (parsed as any).usedMatchIds
        : selected.map((m) => m.id);

    if (parsed && typeof parsed === 'object' && (parsed as any).answer) {
      if (limitations.length > 0 && Array.isArray((parsed as any).limitations)) {
        (parsed as any).limitations = [...(parsed as any).limitations, ...limitations];
      } else if (limitations.length > 0) {
        (parsed as any).limitations = limitations;
      }
      await respondChatWithOptionalPersist(
        res,
        { success: true, ...(parsed as any), usedMatchIds },
        persistJournal
          ? { enabled: true, message, answer: String((parsed as any).answer), selected, context, mode: 'HYBRID' }
          : null,
      );
      return;
    }

    await respondChatWithOptionalPersist(
      res,
      { success: true, answer: dsResp.content, usedMatchIds, debug: { reason: 'JSON_PARSE_FAILED' }, limitations: limitations.length > 0 ? limitations : undefined },
      persistJournal
        ? { enabled: true, message, answer: dsResp.content, selected, context, mode: 'HYBRID' }
        : null,
    );
    return;
  }

  if (aiMode === 'PERPLEXITY') {
    const perplexityResp = await callPerplexitySonar({
      apiKey: perplexityKey!,
      model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      timeoutMs: 60000,
    });

    if (!perplexityResp.ok) {
      return res.status(200).json({
        success: true,
        answer: '模型调用失败，请稍后再试。（如果你在本地测试可检查 PERPLEXITY_API_KEY 是否配置正确）',
        usedMatchIds: selected.map((m) => m.id),
        debug: {
          reason: 'PERPLEXITY_CALL_FAILED',
          status: perplexityResp.status,
          details: perplexityResp.error,
        },
        limitations: limitations.length > 0 ? limitations : undefined,
      });
    }

    const parsed = extractJsonObject(perplexityResp.content);
    const usedMatchIds =
      parsed && typeof parsed === 'object' && (parsed as any).usedMatchIds
        ? (parsed as any).usedMatchIds
        : selected.map((m) => m.id);

    if (parsed && typeof parsed === 'object' && (parsed as any).answer) {
      if (limitations.length > 0 && Array.isArray((parsed as any).limitations)) {
        (parsed as any).limitations = [...(parsed as any).limitations, ...limitations];
      } else if (limitations.length > 0) {
        (parsed as any).limitations = limitations;
      }
      await respondChatWithOptionalPersist(
        res,
        {
          success: true,
          ...(parsed as any),
          usedMatchIds,
        },
        persistJournal
          ? {
              enabled: true,
              message,
              answer: String((parsed as any).answer),
              selected,
              context,
              mode: 'PERPLEXITY',
            }
          : null,
      );
      return;
    }

    await respondChatWithOptionalPersist(
      res,
      {
        success: true,
        answer: perplexityResp.content,
        usedMatchIds,
        debug: { reason: 'JSON_PARSE_FAILED' },
        limitations: limitations.length > 0 ? limitations : undefined,
      },
      persistJournal
        ? {
            enabled: true,
            message,
            answer: perplexityResp.content,
            selected,
            context,
            mode: 'PERPLEXITY',
          }
        : null,
    );
    return;
  }

  // ---- DEEPSEEK streaming 模式 ----
  if (wantStream && aiMode === 'DEEPSEEK' && deepseekKey) {
    const streamResult = await callDeepSeekChatStreamRaw({
      apiKey: deepseekKey,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    if (!streamResult.ok) {
      return res.status(200).json({
        success: true,
        answer: '模型调用失败，请稍后再试。请检查 DEEPSEEK_API_KEY 是否配置正确。',
        usedMatchIds: selected.map((m) => m.id),
        debug: { reason: 'DEEPSEEK_STREAM_FAILED', status: streamResult.status, details: streamResult.error },
        limitations: limitations.length > 0 ? limitations : undefined,
      });
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const upstream = streamResult.response;
    const reader = upstream.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'NO_STREAM_BODY' })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            // Send final metadata event
            const journalId = persistJournal && fullContent
              ? await insertAiTradeJournal({ message, answer: fullContent, selected, context, mode: 'DEEPSEEK' })
              : null;
            res.write(`data: ${JSON.stringify({ done: true, journalEntryId: journalId, usedMatchIds: selected.map((m) => m.id), limitations: limitations.length > 0 ? limitations : undefined })}\n\n`);
            continue;
          }
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              fullContent += delta;
              res.write(`data: ${JSON.stringify({ t: delta })}\n\n`);
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : 'stream_error' })}\n\n`);
    } finally {
      (upstream as any).__cleanupTimeout?.();
      reader.releaseLock();
      res.end();
    }
    return;
  }

  // ---- DEEPSEEK 非流式模式 ----
  const dsResp = await callDeepSeekChat({
    apiKey: deepseekKey!,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  if (!dsResp.ok) {
    return res.status(200).json({
      success: true,
      answer: '模型调用失败，请稍后再试。请检查 DEEPSEEK_API_KEY 是否配置正确。',
      usedMatchIds: selected.map((m) => m.id),
      debug: { reason: 'DEEPSEEK_CALL_FAILED', status: dsResp.status, details: dsResp.error },
      limitations: limitations.length > 0 ? limitations : undefined,
    });
  }

  const parsed = extractJsonObject(dsResp.content);
  const usedMatchIds =
    parsed && typeof parsed === 'object' && (parsed as any).usedMatchIds
      ? (parsed as any).usedMatchIds
      : selected.map((m) => m.id);

  if (parsed && typeof parsed === 'object' && (parsed as any).answer) {
    if (limitations.length > 0 && Array.isArray((parsed as any).limitations)) {
      (parsed as any).limitations = [...(parsed as any).limitations, ...limitations];
    } else if (limitations.length > 0) {
      (parsed as any).limitations = limitations;
    }
    await respondChatWithOptionalPersist(
      res,
      { success: true, ...(parsed as any), usedMatchIds },
      persistJournal
        ? { enabled: true, message, answer: String((parsed as any).answer), selected, context, mode: 'DEEPSEEK' }
        : null,
    );
    return;
  }

  await respondChatWithOptionalPersist(
    res,
    { success: true, answer: dsResp.content, usedMatchIds, debug: { reason: 'JSON_PARSE_FAILED' }, limitations: limitations.length > 0 ? limitations : undefined },
    persistJournal
      ? { enabled: true, message, answer: dsResp.content, selected, context, mode: 'DEEPSEEK' }
      : null,
  );
}

