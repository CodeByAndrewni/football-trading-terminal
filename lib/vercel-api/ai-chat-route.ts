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

const DEFAULT_TOP_N = 10;
const MIN_TOP_N = 3;
const MAX_TOP_N = 15;

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

  // 为了省额度：本地 AI 回退默认不拉赔率
  const liveOddsMap = new Map<number, any[]>();
  const prematchOddsMap = new Map<number, any[]>();

  const matches = aggregateMatches(candidates as any, statisticsMap as any, eventsMap as any, liveOddsMap as any, prematchOddsMap as any) as any as AdvancedMatch[];

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
    '你是足球数据分析助手。',
    '数据来源：通过工具读取——KV 相关工具返回 Vercel KV 中缓存的 live 聚合摘要；API-Football 相关工具实时请求 API-Football 接口。未调用工具时你没有赛场数据。',
    '记忆与复盘：聊天窗口内的多轮对话不会自动传给模型；与你的判断相关的长期记录来自 Supabase 表 ai_trade_journal。若上方附带了「历史判断记录」JSON，请结合它复盘；本条请求结束后若开启持久化且数据库已配置，将写入新记录便于日后核对赛果。',
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
    typeof body?.journalLimit === 'number' ? body.journalLimit : 40,
    1,
    100,
  );

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
    maxEventsPerMatch: 40,
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
    '你是足球数据分析助手。',
    '数据来源：随请求附带的「当前 live 聚合比赛上下文」JSON 由本应用后端生成。优先使用 Vercel KV 中缓存的滚球聚合（若已配置且命中）；否则在本次请求内调用 API-Football 拉取 live 并聚合成摘要；字段含义以 JSON 为准。',
    'JSON 内 generatedAt 为上下文生成时间；meta.cacheAgeSeconds 为 KV 缓存年龄（秒，仅在 KV 命中时有意义）。',
    '若消息中出现「Perplexity 补充参考」段落（仅 HYBRID 模式），其来自 Perplexity 检索/归纳，与上述 JSON 中的场次数据来源不同，引用时请区分。',
    '记忆与复盘：聊天窗口内的多轮对话不会自动传给模型；与你的判断相关的长期记录来自 Supabase 表 ai_trade_journal。若下方附带了「历史判断记录」JSON，请结合它做复盘与对照；本条请求结束后若开启持久化且数据库已配置，将写入新记录便于日后核对赛果与复盘。',
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

  // DEEPSEEK 模式
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

