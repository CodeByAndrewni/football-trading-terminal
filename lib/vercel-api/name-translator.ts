/**
 * 球队 & 联赛名称中文翻译器
 * - KV 永久缓存（单个 JSON blob）
 * - Perplexity 搜索翻译（非直译，使用中文足球媒体惯用译名）
 * - 异步翻译：首次遇到用英文，后台翻译完下次刷新即为中文
 */

import { kv } from '@vercel/kv';

const KV_KEY_TEAM_NAMES = 'names:teams:zh';
const KV_KEY_LEAGUE_NAMES = 'names:leagues:zh';

const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/v1/sonar';
const BATCH_SIZE = 30;

// In-memory cache (lives for the duration of the serverless invocation)
let teamCache: Record<string, string> = {};
let leagueCache: Record<string, string> = {};
let cacheLoaded = false;

/** 下次 loadNameCache 时强制从 KV 重读（避免同实例内用过期内存） */
export function invalidateNameTranslatorLoadFlag(): void {
  cacheLoaded = false;
}

// ---------------------------------------------------------------------------
// Seed data — mirrors aggregator LEAGUE_NAME_MAP + top-league teams
// KV values always take precedence; seeds are fallback only
// ---------------------------------------------------------------------------

const SEED_LEAGUES: Record<string, string> = {
  '39': '英格兰超级联赛|英超', '140': '西班牙足球甲级联赛|西甲', '135': '意大利足球甲级联赛|意甲',
  '78': '德国足球甲级联赛|德甲', '61': '法国足球甲级联赛|法甲', '2': '欧洲冠军联赛|欧冠',
  '3': '欧洲联赛|欧联', '4': '欧洲超级杯|欧超杯', '848': '欧洲国家联赛|欧国联',
  '94': '葡萄牙超级联赛|葡超', '88': '荷兰足球甲级联赛|荷甲', '144': '比利时甲级联赛|比甲',
  '203': '土耳其超级联赛|土超', '235': '俄罗斯超级联赛|俄超', '169': '瑞典超级联赛|瑞超',
  '197': '挪威超级联赛|挪超', '113': '瑞士超级联赛|瑞士超', '179': '苏格兰超级联赛|苏超',
  '262': '墨西哥联赛|墨西联', '128': '阿根廷甲级联赛|阿甲', '71': '巴西足球甲级联赛|巴甲',
  '253': '美国职业足球大联盟|美职联', '288': '韩国K联赛|韩K联', '17': '世界杯|世界杯',
  '239': '哥伦比亚甲级联赛|哥甲', '242': '厄瓜多尔甲级联赛|厄甲',
  '265': '巴拉圭甲级联赛|巴拉甲', '268': '乌拉圭甲级联赛|乌甲', '266': '秘鲁甲级联赛|秘甲',
  '73': '巴西足球乙级联赛|巴乙', '40': '英格兰冠军联赛|英冠', '41': '英格兰甲级联赛|英甲',
  '42': '英格兰乙级联赛|英乙', '141': '西班牙乙级联赛|西乙', '79': '德国乙级联赛|德乙',
  '136': '意大利乙级联赛|意乙', '62': '法国乙级联赛|法乙', '172': '丹麦超级联赛|丹超',
  '188': '奥地利甲级联赛|奥甲', '218': '希腊超级联赛|希超', '307': '沙特职业联赛|沙特联',
  '333': '塞尔维亚超级联赛|塞尔超', '345': '捷克甲级联赛|捷甲', '103': '芬兰超级联赛|芬超',
  '98': '日本J联赛|日职', '292': '澳大利亚超级联赛|澳超', '119': '以色列超级联赛|以超',
  '106': '波兰甲级联赛|波甲', '283': '中国超级联赛|中超', '207': '克罗地亚甲级联赛|克甲',
};

const SEED_TEAMS: Record<string, string> = {
  // ---- 英超 ----
  '33': '曼联', '34': '纽卡斯尔联', '35': '伯恩茅斯', '36': '富勒姆', '38': '沃特福德',
  '39': '狼队', '40': '利物浦', '41': '南安普顿', '42': '阿森纳', '45': '埃弗顿',
  '46': '莱斯特城', '47': '热刺', '48': '西汉姆联', '49': '切尔西', '50': '曼城',
  '51': '布莱顿', '52': '水晶宫', '55': '布伦特福德', '62': '谢菲尔德联',
  '63': '利兹联', '65': '诺丁汉森林', '66': '阿斯顿维拉', '71': '诺维奇城',
  '76': '伍尔弗汉普顿', '1359': '伊普斯维奇',
  // ---- 西甲 ----
  '529': '巴塞罗那', '530': '马德里竞技', '531': '毕尔巴鄂竞技',
  '532': '瓦伦西亚', '533': '比利亚雷亚尔', '536': '塞维利亚', '541': '皇家马德里',
  '543': '皇家贝蒂斯', '548': '皇家社会', '540': '西班牙人', '546': '赫塔费',
  '542': '赫罗纳', '547': '马略卡', '538': '塞尔塔', '539': '莱万特',
  '727': '奥萨苏纳', '728': '拉斯帕尔马斯', '798': '阿拉维斯', '720': '巴列卡诺',
  '723': '莱加内斯', '724': '巴拉多利德',
  // ---- 意甲 ----
  '487': '拉齐奥', '488': '萨索洛', '489': '亚特兰大', '492': '那不勒斯',
  '494': '尤文图斯', '496': 'AC米兰', '497': '罗马', '498': '桑普多利亚',
  '499': '都灵', '500': '博洛尼亚', '502': '佛罗伦萨', '503': '乌迪内斯',
  '504': '维罗纳', '505': '国际米兰', '511': '恩波利', '514': '弗洛西诺内',
  '515': '卡利亚里', '517': '威尼斯', '519': '热那亚', '520': '莱切',
  '867': '科莫', '1579': '蒙扎',
  // ---- 德甲 ----
  '157': '拜仁慕尼黑', '165': '多特蒙德', '159': '柏林赫塔', '160': '弗赖堡',
  '161': '勒沃库森', '162': '云达不莱梅', '163': '门兴格拉德巴赫', '164': '奥格斯堡',
  '166': '霍芬海姆', '167': '法兰克福', '168': '科隆', '169': '沃尔夫斯堡',
  '170': '斯图加特', '171': '美因茨', '172': '莱比锡RB', '173': '柏林联合',
  '174': '波鸿', '176': '达姆施塔特', '192': '海登海姆', '178': '圣保利',
  '180': '荷尔斯泰因基尔',
  // ---- 法甲 ----
  '77': '安格斯', '79': '里尔', '80': '里昂', '81': '马赛',
  '82': '蒙彼利埃', '83': '南特', '84': '尼斯', '85': '巴黎圣日耳曼',
  '91': '摩纳哥', '93': '雷恩', '94': '朗斯', '95': '斯特拉斯堡',
  '96': '图卢兹', '97': '布雷斯特', '99': '兰斯', '108': '勒阿弗尔',
  '116': '昂热', '1063': '欧塞尔',
  // ---- 其他热门球队 ----
  '211': '本菲卡', '212': '波尔图', '214': '里斯本竞技', '194': '阿贾克斯',
  '197': '费耶诺德', '195': '埃因霍温',
  '601': '安德莱赫特', '554': '加拉塔萨雷', '556': '费内巴切', '549': '贝西克塔斯',
  '228': '凯尔特人', '229': '流浪者', '1376': '博卡青年', '435': '河床',
  '131': '弗拉门戈', '121': '帕尔梅拉斯', '126': '科林蒂安斯',
};

function mergeSeeds(): void {
  for (const [k, v] of Object.entries(SEED_LEAGUES)) {
    if (!leagueCache[k]) leagueCache[k] = v;
  }
  for (const [k, v] of Object.entries(SEED_TEAMS)) {
    if (!teamCache[k]) teamCache[k] = v;
  }
}

// ---------------------------------------------------------------------------
// Load cache from KV
// ---------------------------------------------------------------------------

export async function loadNameCache(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const [teams, leagues] = await Promise.all([
      kv.get<Record<string, string>>(KV_KEY_TEAM_NAMES),
      kv.get<Record<string, string>>(KV_KEY_LEAGUE_NAMES),
    ]);
    teamCache = teams ?? {};
    leagueCache = leagues ?? {};
    mergeSeeds();
    cacheLoaded = true;
    console.log(`[NameTranslator] loaded ${Object.keys(teamCache).length} teams, ${Object.keys(leagueCache).length} leagues (incl. seeds)`);
  } catch (e) {
    console.error('[NameTranslator] failed to load KV cache:', e);
    mergeSeeds();
    cacheLoaded = true;
  }
}

// ---------------------------------------------------------------------------
// Lookup (synchronous, from in-memory cache)
// ---------------------------------------------------------------------------

export function getTeamZh(teamId: number): string | null {
  return teamCache[String(teamId)] ?? null;
}

export function getLeagueZh(leagueId: number): { name: string; short: string } | null {
  const v = leagueCache[String(leagueId)];
  if (!v) return null;
  const parts = v.split('|');
  return { name: parts[0], short: parts[1] ?? parts[0] };
}

// ---------------------------------------------------------------------------
// Collect untranslated entries from a batch of fixtures
// ---------------------------------------------------------------------------

interface PendingTeam { id: number; name: string; league: string }
interface PendingLeague { id: number; name: string; country: string }

export function collectUntranslatedTeams(
  fixtures: Array<{ teams: { home: { id: number; name: string }; away: { id: number; name: string } }; league: { name: string } }>,
): PendingTeam[] {
  const seen = new Set<number>();
  const result: PendingTeam[] = [];
  for (const f of fixtures) {
    for (const t of [f.teams.home, f.teams.away]) {
      if (seen.has(t.id) || teamCache[String(t.id)]) continue;
      seen.add(t.id);
      result.push({ id: t.id, name: t.name, league: f.league.name });
    }
  }
  return result;
}

export function collectUntranslatedLeagues(
  fixtures: Array<{ league: { id: number; name: string; country?: string } }>,
): PendingLeague[] {
  const seen = new Set<number>();
  const result: PendingLeague[] = [];
  for (const f of fixtures) {
    const l = f.league;
    if (seen.has(l.id) || leagueCache[String(l.id)]) continue;
    seen.add(l.id);
    result.push({ id: l.id, name: l.name, country: (l as any).country ?? '' });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Perplexity batch translation (fire-and-forget, called after aggregation)
// ---------------------------------------------------------------------------

const TEAM_PROMPT = `你是足球翻译专家。将下列足球球队英文名翻译为中文足球媒体（懂球帝、虎扑、新浪体育、ESPN中文）惯用的中文名称。

重要规则：
- 使用中文足球圈公认的惯用译名，不要直译
- 例如：Manchester United → 曼联（不是"曼彻斯特联合"）
  Tottenham Hotspur → 热刺（不是"托特纳姆热刺"）
  Bayern Munich → 拜仁慕尼黑
  Real Madrid → 皇家马德里
  Wolverhampton → 狼队
  Sheffield United → 谢菲尔德联
  Inter Miami → 迈阿密国际
  Club América → 美洲（墨西哥）
- 小联赛球队如果没有惯用译名，按照音译+所在城市的方式翻译
- 不要加括号注释、不要解释，每行只输出：ID=中文名

请翻译以下球队（格式：ID|英文名|所在联赛）：
`;

const LEAGUE_PROMPT = `你是足球翻译专家。将下列足球联赛英文名翻译为中文惯用名称和简称。

重要规则：
- 使用中文足球圈惯用名称，例如：
  Premier League → 英格兰超级联赛|英超
  La Liga → 西班牙甲级联赛|西甲
  Serie A → 意大利甲级联赛|意甲
  Eredivisie → 荷兰甲级联赛|荷甲
  J1 League → 日本J1联赛|日职
  K League 1 → 韩国K1联赛|韩K联
  A-League → 澳大利亚超级联赛|澳超
- 每行输出：ID=全称|简称

请翻译以下联赛（格式：ID|英文名|国家）：
`;

async function callPerplexity(prompt: string): Promise<string | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(PERPLEXITY_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.PERPLEXITY_MODEL ?? 'sonar',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    clearTimeout(timeout);

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[NameTranslator] Perplexity error:', resp.status, json);
      return null;
    }

    return json?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error('[NameTranslator] Perplexity call failed:', e);
    return null;
  }
}

function parseTranslationResponse(text: string): Map<number, string> {
  const result = new Map<number, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const id = parseInt(trimmed.slice(0, eqIdx).trim(), 10);
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!isNaN(id) && value && value.length > 0 && value.length < 50) {
      result.set(id, value);
    }
  }
  return result;
}

export interface TranslateTeamsOptions {
  /** 每批成功后立即写 KV，避免 Cron 超时时丢已译条目 */
  persistEachBatch?: boolean;
  /** 超过此时间戳（Date.now()）则停止后续批次，返回 partial */
  deadlineMs?: number;
}

export interface TranslateTeamsResult {
  translated: number;
  /** 因 deadline 未处理的球队数（仍可在后续 /api/matches 或下次 Cron 继续） */
  skippedByDeadline: number;
}

export async function translatePendingTeams(
  teams: PendingTeam[],
  opts?: TranslateTeamsOptions,
): Promise<TranslateTeamsResult> {
  if (teams.length === 0) return { translated: 0, skippedByDeadline: 0 };

  let translated = 0;
  let skippedByDeadline = 0;

  for (let i = 0; i < teams.length; i += BATCH_SIZE) {
    if (opts?.deadlineMs != null && Date.now() >= opts.deadlineMs) {
      skippedByDeadline = teams.length - i;
      break;
    }

    const batch = teams.slice(i, i + BATCH_SIZE);
    const lines = batch.map((t) => `${t.id}|${t.name}|${t.league}`).join('\n');
    const content = await callPerplexity(TEAM_PROMPT + lines);
    if (!content) continue;

    const parsed = parseTranslationResponse(content);
    let batchAdded = 0;
    for (const [id, zh] of parsed) {
      teamCache[String(id)] = zh;
      translated++;
      batchAdded++;
    }

    if (opts?.persistEachBatch && batchAdded > 0) {
      try {
        await kv.set(KV_KEY_TEAM_NAMES, teamCache);
      } catch (e) {
        console.error('[NameTranslator] persistEachBatch save failed:', e);
      }
    }
  }

  if (translated > 0 && !opts?.persistEachBatch) {
    try {
      await kv.set(KV_KEY_TEAM_NAMES, teamCache);
      console.log(`[NameTranslator] saved ${translated} new team translations to KV (total: ${Object.keys(teamCache).length})`);
    } catch (e) {
      console.error('[NameTranslator] failed to save team cache:', e);
    }
  } else if (translated > 0 && opts?.persistEachBatch) {
    console.log(
      `[NameTranslator] teams done: +${translated} (total keys: ${Object.keys(teamCache).length}), skippedByDeadline=${skippedByDeadline}`,
    );
  }

  return { translated, skippedByDeadline };
}

export async function translatePendingLeagues(leagues: PendingLeague[]): Promise<number> {
  if (leagues.length === 0) return 0;

  const lines = leagues.map((l) => `${l.id}|${l.name}|${l.country}`).join('\n');
  const content = await callPerplexity(LEAGUE_PROMPT + lines);
  if (!content) return 0;

  const parsed = parseTranslationResponse(content);
  let translated = 0;
  for (const [id, zh] of parsed) {
    leagueCache[String(id)] = zh;
    translated++;
  }

  if (translated > 0) {
    try {
      await kv.set(KV_KEY_LEAGUE_NAMES, leagueCache);
      console.log(`[NameTranslator] saved ${translated} new league translations to KV (total: ${Object.keys(leagueCache).length})`);
    } catch (e) {
      console.error('[NameTranslator] failed to save league cache:', e);
    }
  }

  return translated;
}

// ---------------------------------------------------------------------------
// Apply cached translations to aggregated matches (mutates in place)
// ---------------------------------------------------------------------------

function looksLatin(s: string): boolean {
  return /^[\x00-\x7F]+$/.test(s);
}

export function applyTranslations(
  matches: Array<{
    leagueId?: number;
    league: string;
    leagueShort: string;
    home: { id?: number; name: string };
    away: { id?: number; name: string };
  }>,
): void {
  for (const m of matches) {
    if (m.home.id) {
      const zh = teamCache[String(m.home.id)];
      if (zh) m.home.name = zh;
    }
    if (m.away.id) {
      const zh = teamCache[String(m.away.id)];
      if (zh) m.away.name = zh;
    }
    // Only override league name if it's still in English (not already set by LEAGUE_NAME_MAP)
    if (m.leagueId && looksLatin(m.league)) {
      const lz = leagueCache[String(m.leagueId)];
      if (lz) {
        const parts = lz.split('|');
        m.league = parts[1] ?? parts[0];       // prefer short name for consistency
        m.leagueShort = parts[1] ?? parts[0];
      }
    }
  }
}
