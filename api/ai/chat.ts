import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMatches } from '../lib/kv.js';
import { buildMatchContext } from '../../src/services/aiContext.js';
import type { AdvancedMatch } from '../../src/data/advancedMockData';

const MINIMAX_CHAT_ENDPOINT = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
const PERPLEXITY_SONAR_ENDPOINT = 'https://api.perplexity.ai/v1/sonar';

const DEFAULT_TOP_N = 10;
const MIN_TOP_N = 3;
const MAX_TOP_N = 15;

type DeepSeekChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' }, success: false });
  }

  const body = await req.json().catch(() => null);
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

  const kvResult = await getMatches();
  if (!kvResult || !Array.isArray(kvResult.matches) || kvResult.matches.length === 0) {
    return res.status(200).json({
      success: true,
      answer: '当前没有可用的 live 聚合比赛数据，请稍后再试。',
      usedMatchIds: [],
      debug: { reason: 'NO_KV_MATCHES' },
    });
  }

  const matches = kvResult.matches
    .filter((m: unknown): m is AdvancedMatch => !!m && typeof (m as any).id === 'number')
    .sort((a, b) => (Number((b as any).killScore) || 0) - (Number((a as any).killScore) || 0));

  const selected = matches.slice(0, topN);

  // 构建上下文时默认不塞完整 events，避免 token 爆炸。
  const context = buildMatchContext(selected, topN, {
    cacheAgeSeconds: kvResult.cacheAge,
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

