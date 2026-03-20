import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseRequestJsonBody } from './parse-request-json.js';
import { getMatches } from './kv.js';
import { buildMatchContext } from '../../src/services/aiContext.js';
import type { AdvancedMatch } from '../../src/data/advancedMockData';
import { aggregateMatches, calculateBasicKillScore } from './aggregator.js';
import { getLiveFixtures, getStatisticsBatch, getEventsBatch } from './api-football.js';
import {
  AI_AGENT_TOOLS,
  createFootballQuota,
  executeAgentTool,
  getDefaultMaxFootballCalls,
  getDefaultMaxToolRounds,
} from './ai-tool-executor.js';

const MINIMAX_CHAT_ENDPOINT = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
/** OpenAI 兼容 Chat Completions（支持 tools / tool_calls），用于 Agent 模式 */
const MINIMAX_OPENAI_CHAT =
  process.env.MINIMAX_CHAT_COMPLETIONS_URL ?? 'https://api.minimaxi.com/v1/chat/completions';
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

async function callMinimaxOpenAIChat(args: {
  apiKey: string;
  model?: string;
  messages: AgentChatMessage[];
  tools?: typeof AI_AGENT_TOOLS;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<
  | { ok: true; message: Record<string, unknown> }
  | { ok: false; status: number; error: unknown }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 60000);

  try {
    const body: Record<string, unknown> = {
      model: args.model ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7',
      messages: args.messages,
      temperature: typeof args.temperature === 'number' ? args.temperature : 0.6,
      max_tokens: args.maxTokens ?? 2048,
      stream: false,
    };
    if (args.tools && args.tools.length > 0) {
      body.tools = args.tools;
      body.tool_choice = 'auto';
    }

    const resp = await fetch(MINIMAX_OPENAI_CHAT, {
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

    return { ok: true as const, message: message as Record<string, unknown> };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callDeepSeekChat(args: {
  apiKey: string;
  model?: string;
  messages: DeepSeekChatMessage[];
  temperature?: number;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 25000);

  try {
    const resp = await fetch(MINIMAX_CHAT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`, // MiniMax uses Bearer auth
      },
      body: JSON.stringify({
        model: args.model ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7',
        messages: args.messages,
        stream: false,
        // MiniMax temperature 取值范围 (0,1]，尽量保持稳定输出（我们要求 JSON）
        temperature: typeof args.temperature === 'number' ? args.temperature : 0.6,
        top_p: 0.95,
        max_completion_tokens: 1024,
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, error: json };
    }

    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return { ok: false as const, status: resp.status, error: { reason: 'NO_CONTENT', json } };
    }

    return { ok: true as const, content };
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
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 20000);

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
        max_tokens: 800,
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
    minimaxKey: string;
    canUseKv: boolean;
  },
): Promise<void> {
  const quota = createFootballQuota(getDefaultMaxFootballCalls());
  const maxRounds = getDefaultMaxToolRounds();
  let toolRounds = 0;

  const systemPrompt = [
    '你是足球数据分析助手。你可以调用工具读取 KV 缓存或 API-Football 端点。',
    '先按需要调用工具获取数据，再给出结论。',
    '不要编造工具未返回的数据或时间点。',
    'API-Football 的角球数据通常只有角球总数，没有角球发生的具体分钟/时间戳。',
    '若无法从工具得到数据，请说明原因。',
    '最终回答必须是严格 JSON（不要 Markdown），不要输出 JSON 以外的文本。',
    'JSON 结构：{ "answer": string, "usedMatchIds": number[], "limitations"?: string[] }',
  ].join('\n');

  const messages: AgentChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: args.message },
  ];

  let lastAssistantText: string | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const resp = await callMinimaxOpenAIChat({
      apiKey: args.minimaxKey,
      model: process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7',
      messages,
      tools: AI_AGENT_TOOLS,
      maxTokens: 2048,
      timeoutMs: 90000,
    });

    if (!resp.ok) {
      res.status(200).json({
        success: true,
        answer:
          'Agent 模型调用失败（OpenAI Chat Completions）。请检查 MINIMAX_CHAT_COMPLETIONS_URL、MINIMAX_MODEL 与 MINIMAX_API_KEY。',
        usedMatchIds: [],
        debug: { reason: 'AGENT_MINIMAX_CALL_FAILED', status: resp.status, details: resp.error },
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
    res.status(200).json({
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
    });
    return;
  }

  res.status(200).json({
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
  });
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

  const usePerplexityLegacy = Boolean(body?.usePerplexity);
  const modeRaw = typeof body?.mode === 'string' ? body.mode : null;
  const modeUpper = modeRaw ? modeRaw.toUpperCase() : null;
  type AiMode = 'MINIMAX' | 'PERPLEXITY' | 'HYBRID';
  const aiMode: AiMode =
    modeUpper === 'PERPLEXITY'
      ? 'PERPLEXITY'
      : modeUpper === 'MINIMAX'
        ? 'MINIMAX'
        : modeUpper === 'HYBRID'
          ? 'HYBRID'
          : usePerplexityLegacy
            ? 'HYBRID'
            : 'MINIMAX';

  if (!message) {
    return res.status(400).json({
      success: false,
      error: { code: 'EMPTY_MESSAGE', message: 'message is required' },
    });
  }

  const minimaxKey = process.env.MINIMAX_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  const useAgent =
    body?.agent === true ||
    (typeof body?.chatMode === 'string' && body.chatMode.toUpperCase() === 'AGENT');

  if (useAgent) {
    if (aiMode !== 'MINIMAX') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'AGENT_MODE_REQUIRES_MINIMAX',
          message:
            'Agent 模式仅支持 MINIMAX（多轮工具调用）。请改用 MINIMAX 或关闭 Agent。',
        },
      });
    }
    if (!minimaxKey) {
      return res.status(500).json({
        success: false,
        error: { code: 'MINIMAX_API_KEY_NOT_CONFIGURED', message: 'Missing MINIMAX_API_KEY' },
      });
    }
    const canUseKvAgent =
      typeof process.env.KV_REST_API_URL === 'string' &&
      process.env.KV_REST_API_URL.length > 0 &&
      typeof process.env.KV_REST_API_TOKEN === 'string' &&
      process.env.KV_REST_API_TOKEN.length > 0;

    return runAgentChat(res, {
      message,
      minimaxKey,
      canUseKv: canUseKvAgent,
    });
  }

  if (aiMode !== 'PERPLEXITY' && !minimaxKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'MINIMAX_API_KEY_NOT_CONFIGURED', message: 'Missing MINIMAX_API_KEY' },
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

  // 构建上下文时默认不塞完整 events，避免 token 爆炸。
  const context = buildMatchContext(selected, topN, {
    cacheAgeSeconds,
    includeEvents: false,
  });

  const limitations: string[] = [];
  let perplexityBackground: string | null = null;

  // 生成 JSON 的系统约束（无论 Minimax 还是 Perplexity）
  const systemPrompt = [
    '你是“足球数据分析助手”。',
    '只基于用户提供的 JSON 上下文作答，不要编造上下文中没有的数据或时间点。',
    'API-Football 的角球数据目前仅提供“角球总数”，不提供“角球发生的具体分钟/时间戳”。',
    '如果用户的问题需要角球的分钟级概率，请明确说明：由于缺少角球时间戳，无法直接计算，只能给出基于总角球的合理推断与改进建议。',
    '输出必须是严格 JSON，不要输出 Markdown，也不要输出除 JSON 以外的任何文本。',
    'JSON 结构：{ "answer": string, "usedMatchIds": number[], "limitations"?: string[] }',
  ].join('\n');

  const userPrompt = [
    `用户问题：${message}`,
    '',
    '当前 live 聚合比赛上下文（JSON，可能包含缺失字段；缺失=无法下结论）：',
    JSON.stringify(context),
    '',
    aiMode === 'HYBRID'
      ? perplexityBackground
        ? `Perplexity 背景要点（用于方法论/知识补充，不代表比赛真实数据）：\n${perplexityBackground}`
        : 'Perplexity 背景要点：未启用或不可用。'
      : undefined,
    '',
    '请给出结论：如果需要“交易/机会”，请结合每场的 killScore、比分、射门/射正/控球、红牌与数据健康描述风险；如果角球分钟级概率无法计算，请按限制规则说明。',
  ].filter((x) => typeof x === 'string').join('\n');

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
            content:
              '你是足球策略知识助手。只给“方法论/背景要点/注意事项”，不要输出最终交易结论。\n' +
              '已知：API-Football 的角球只提供角球总数，没有分钟级时间戳。\n' +
              '请基于一般足球统计直觉，给出：如果用户问“某分钟后角球更可能吗/概率怎么估计”，在缺失时间戳时有哪些可行近似方法。\n\n' +
              `用户问题：${message}`,
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

    const minimaxResp = await callDeepSeekChat({
      apiKey: minimaxKey!,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
    });

    if (!minimaxResp.ok) {
      return res.status(200).json({
        success: true,
        answer: '模型调用失败，请稍后再试。（如果你在本地测试可检查 MINIMAX_API_KEY 是否配置正确）',
        usedMatchIds: selected.map((m) => m.id),
        debug: {
          reason: 'MINIMAX_CALL_FAILED',
          status: minimaxResp.status,
          details: minimaxResp.error,
        },
        limitations: limitations.length > 0 ? limitations : undefined,
      });
    }

    const parsed = extractJsonObject(minimaxResp.content);
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
      return res.status(200).json({
        success: true,
        ...(parsed as any),
        usedMatchIds,
      });
    }

    return res.status(200).json({
      success: true,
      answer: minimaxResp.content,
      usedMatchIds,
      debug: { reason: 'JSON_PARSE_FAILED' },
      limitations: limitations.length > 0 ? limitations : undefined,
    });
  }

  if (aiMode === 'PERPLEXITY') {
    const perplexityResp = await callPerplexitySonar({
      apiKey: perplexityKey!,
      model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      timeoutMs: 25000,
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
      return res.status(200).json({
        success: true,
        ...(parsed as any),
        usedMatchIds,
      });
    }

    return res.status(200).json({
      success: true,
      answer: perplexityResp.content,
      usedMatchIds,
      debug: { reason: 'JSON_PARSE_FAILED' },
      limitations: limitations.length > 0 ? limitations : undefined,
    });
  }

  // MINIMAX 模式：只调用 Minimax
  const minimaxResp = await callDeepSeekChat({
    apiKey: minimaxKey!,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
  });

  if (!minimaxResp.ok) {
    return res.status(200).json({
      success: true,
      answer: '模型调用失败，请稍后再试。（如果你在本地测试可检查 MINIMAX_API_KEY 是否配置正确）',
      usedMatchIds: selected.map((m) => m.id),
      debug: { reason: 'MINIMAX_CALL_FAILED', status: minimaxResp.status, details: minimaxResp.error },
      limitations: limitations.length > 0 ? limitations : undefined,
    });
  }

  const parsed = extractJsonObject(minimaxResp.content);
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
    return res.status(200).json({
      success: true,
      ...(parsed as any),
      usedMatchIds,
    });
  }

  return res.status(200).json({
    success: true,
    answer: minimaxResp.content,
    usedMatchIds,
    debug: { reason: 'JSON_PARSE_FAILED' },
    limitations: limitations.length > 0 ? limitations : undefined,
  });
}

