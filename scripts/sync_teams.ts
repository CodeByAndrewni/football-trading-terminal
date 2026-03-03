import { createClient } from '@supabase/supabase-js';

// ============================================================
// 配置
// ============================================================

const CONFIG = {
  API_HOST: 'v3.football.api-sports.io',
  API_KEY: process.env.API_FOOTBALL_KEY || process.env.API_FOOTBALL_KEY_READONLY || '',

  // Supabase：统一 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY，旧变量仅作兼容
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '',

  REQUEST_DELAY_MS: 300,
  MAX_RETRIES: 3,
};

if (!CONFIG.API_KEY) {
  console.warn('[sync_teams] API_FOOTBALL_KEY 未配置，无法从 API-Football 拉取球队数据。');
}

if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[sync_teams] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置，无法写入 Supabase。');
}

// ============================================================
// 初始化 Supabase 客户端（服务端 Service Role）
// ============================================================

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ============================================================
// 工具函数
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAPI<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://${CONFIG.API_HOST}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  for (let i = 0; i < CONFIG.MAX_RETRIES; i++) {
    const res = await fetch(url.toString(), {
      headers: { 'x-apisports-key': CONFIG.API_KEY },
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') || '2');
      console.warn(`[sync_teams] API 429，${retryAfter}s 后重试 (${i + 1}/${CONFIG.MAX_RETRIES})`);
      await delay(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`[sync_teams] API Error ${res.status}: ${text}`);
      if (i === CONFIG.MAX_RETRIES - 1) {
        throw new Error(`API Error: ${res.status}`);
      }
      await delay(2000);
      continue;
    }

    return (await res.json()) as T;
  }

  throw new Error('API 请求重试次数耗尽');
}

// ============================================================
// 类型
// ============================================================

interface ApiTeamCountryResponse {
  response: Array<{
    code: string;
    name: string;
  }>;
}

interface ApiTeamsResponse {
  response: Array<{
    team: {
      id: number;
      name: string;
      code: string | null;
      country: string | null;
      logo: string | null;
      founded: number | null;
      national: boolean | null;
    };
    venue: {
      name: string | null;
      city: string | null;
    };
    league?: {
      id: number;
    };
  }>;
  paging: {
    current: number;
    total: number;
  };
}

// ============================================================
// 主逻辑
// ============================================================

async function syncTeams(): Promise<void> {
  if (!CONFIG.API_KEY) {
    console.error('[sync_teams] 缺少 API_FOOTBALL_KEY，退出。');
    return;
  }

  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[sync_teams] 缺少 SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY，退出。');
    return;
  }

  console.log('[sync_teams] 开始同步 Teams 维表...');

  // 1. 获取所有国家列表
  const countriesData = await fetchAPI<ApiTeamCountryResponse>('/teams/countries');
  const countries = countriesData.response;
  console.log(`[sync_teams] 获取到 ${countries.length} 个国家`);

  // 2. 按国家拉取球队列表并 upsert
  for (const country of countries) {
    console.log(`[sync_teams] 同步国家: ${country.name} (${country.code})`);
    let page = 1;
    let totalPages = 1;

    do {
      const data = await fetchAPI<ApiTeamsResponse>('/teams', {
        country: country.name,
        page: String(page),
      });

      totalPages = data.paging.total || 1;

      const rows = data.response.map(item => {
        const leagueId = (item as any).league?.id as number | undefined;
        return {
          id: item.team.id,
          name: item.team.name,
          country: item.team.country,
          code: item.team.code,
          logo: item.team.logo,
          founded: item.team.founded,
          national: item.team.national,
          venue_name: item.venue.name,
          venue_city: item.venue.city,
          league_ids: leagueId ? [leagueId] : [],
          updated_at: new Date().toISOString(),
        };
      });

      if (rows.length > 0) {
        const { error } = await supabase
          .from('teams')
          .upsert(rows, { onConflict: 'id' });

        if (error) {
          console.error(`[sync_teams] 写入 Supabase 失败 (country=${country.name}, page=${page}):`, error);
        } else {
          console.log(`[sync_teams] 已同步 ${country.name} 第 ${page}/${totalPages} 页，${rows.length} 条记录`);
        }
      }

      page += 1;
      await delay(CONFIG.REQUEST_DELAY_MS);
    } while (page <= totalPages);
  }

  console.log('[sync_teams] 同步完成，开始统计行数与示例记录...');

  // 同步完成后，输出行数与部分示例，方便确认
  const { count, error: countError } = await supabase
    .from('teams')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    console.error('[sync_teams] 统计 teams 行数失败:', countError);
  } else {
    console.log('[sync_teams] teams 行数 =', count ?? 0);
  }

  const { data: sampleRows, error: sampleError } = await supabase
    .from('teams')
    .select('id, name, country, venue_name')
    .order('id', { ascending: true })
    .limit(5);

  if (sampleError) {
    console.error('[sync_teams] 获取示例记录失败:', sampleError);
  } else {
    console.log('[sync_teams] 示例记录前 5 行:', sampleRows);
  }
}

// 入口
if (require.main === module) {
  syncTeams().catch(err => {
    console.error('[sync_teams] 运行失败:', err);
    process.exit(1);
  });
}

