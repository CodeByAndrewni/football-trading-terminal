import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE_URL = 'https://v3.football.api-sports.io';

/**
 * 合并端点: 比赛数据
 *
 * GET /api/football/fixtures
 *
 * 用法:
 * - ?live=all              获取所有进行中比赛
 * - ?id=123                获取单场比赛详情
 * - ?id=123&stats=true     包含统计数据
 * - ?id=123&events=true    包含事件数据
 * - ?type=rounds&league=39&season=2023  获取联赛轮次
 * - ?type=lineups&fixture=123           获取比赛阵容
 * - ?type=statistics&fixture=123        获取比赛统计
 * - ?type=events&fixture=123            获取比赛事件
 * - ?date=2024-01-15       获取指定日期比赛
 * - ?league=39&season=2023 获取联赛比赛
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 405, message: 'Method Not Allowed' });
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ status: 500, message: 'API Key not configured on server' });
  }

  const { live, id, stats, events, type, fixture, league, season, date, team, current } = req.query;

  try {
    const dataType = Array.isArray(type) ? type[0] : type;

    // ============================================
    // 特殊端点处理
    // ============================================

    // 获取联赛轮次
    if (dataType === 'rounds') {
      const leagueId = Array.isArray(league) ? league[0] : league;
      const seasonYear = Array.isArray(season) ? season[0] : season;
      const currentRound = current === 'true';

      if (!leagueId || !seasonYear) {
        return res.status(400).json({ status: 400, message: 'league and season required for rounds' });
      }

      const url = new URL(`${API_BASE_URL}/fixtures/rounds`);
      url.searchParams.append('league', leagueId);
      url.searchParams.append('season', seasonYear);
      if (currentRound) url.searchParams.append('current', 'true');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-apisports-key': apiKey },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          status: response.status,
          message: `Upstream API error: ${response.statusText}`,
        });
      }

      const data = await response.json();
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).json(data);
    }

    // 获取比赛阵容
    if (dataType === 'lineups') {
      const fixtureId = Array.isArray(fixture) ? fixture[0] : fixture;

      if (!fixtureId) {
        return res.status(400).json({ status: 400, message: 'fixture required for lineups' });
      }

      const url = new URL(`${API_BASE_URL}/fixtures/lineups`);
      url.searchParams.append('fixture', fixtureId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-apisports-key': apiKey },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          status: response.status,
          message: `Upstream API error: ${response.statusText}`,
        });
      }

      const data = await response.json();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(data);
    }

    // 获取比赛统计
    if (dataType === 'statistics') {
      const fixtureId = Array.isArray(fixture) ? fixture[0] : fixture;

      if (!fixtureId) {
        return res.status(400).json({ status: 400, message: 'fixture required for statistics' });
      }

      const url = new URL(`${API_BASE_URL}/fixtures/statistics`);
      url.searchParams.append('fixture', fixtureId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-apisports-key': apiKey },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          status: response.status,
          message: `Upstream API error: ${response.statusText}`,
        });
      }

      const data = await response.json();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(data);
    }

    // 获取比赛事件
    if (dataType === 'events') {
      const fixtureId = Array.isArray(fixture) ? fixture[0] : fixture;

      if (!fixtureId) {
        return res.status(400).json({ status: 400, message: 'fixture required for events' });
      }

      const url = new URL(`${API_BASE_URL}/fixtures/events`);
      url.searchParams.append('fixture', fixtureId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-apisports-key': apiKey },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          status: response.status,
          message: `Upstream API error: ${response.statusText}`,
        });
      }

      const data = await response.json();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(data);
    }

    // 获取指定日期/联赛的比赛
    if (date || (league && season)) {
      const url = new URL(`${API_BASE_URL}/fixtures`);

      const dateStr = Array.isArray(date) ? date[0] : date;
      const leagueId = Array.isArray(league) ? league[0] : league;
      const seasonYear = Array.isArray(season) ? season[0] : season;
      const teamId = Array.isArray(team) ? team[0] : team;

      if (dateStr) url.searchParams.append('date', dateStr);
      if (leagueId) url.searchParams.append('league', leagueId);
      if (seasonYear) url.searchParams.append('season', seasonYear);
      if (teamId) url.searchParams.append('team', teamId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-apisports-key': apiKey },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          status: response.status,
          message: `Upstream API error: ${response.statusText}`,
        });
      }

      const data = await response.json();
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return res.status(200).json(data);
    }

    // ============================================
    // 原有端点处理
    // ============================================

    // 模式1: 获取所有进行中比赛
    if (live === 'all') {
      const url = new URL(`${API_BASE_URL}/fixtures`);
      url.searchParams.append('live', 'all');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-apisports-key': apiKey },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          status: response.status,
          message: `Upstream API error: ${response.statusText}`,
        });
      }

      const data = await response.json();
      if (data.errors && Object.keys(data.errors).length > 0) {
        return res.status(400).json({
          status: 400,
          message: Object.values(data.errors).join(', '),
        });
      }

      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
      return res.status(200).json(data);
    }

    // 模式2: 获取单场比赛详情
    const fixtureId = Array.isArray(id) ? id[0] : id;
    if (!fixtureId || !/^\d+$/.test(fixtureId)) {
      return res.status(400).json({
        status: 400,
        message: 'Use ?live=all for live matches or ?id=xxx for single fixture'
      });
    }

    const includeStats = stats === 'true';
    const includeEvents = events === 'true';

    const requests: Promise<Response>[] = [];

    // 基础比赛信息
    const fixtureUrl = new URL(`${API_BASE_URL}/fixtures`);
    fixtureUrl.searchParams.append('id', fixtureId);
    requests.push(
      fetch(fixtureUrl.toString(), {
        method: 'GET',
        headers: { 'x-apisports-key': apiKey },
      })
    );

    // 统计数据
    if (includeStats) {
      const statsUrl = new URL(`${API_BASE_URL}/fixtures/statistics`);
      statsUrl.searchParams.append('fixture', fixtureId);
      requests.push(
        fetch(statsUrl.toString(), {
          method: 'GET',
          headers: { 'x-apisports-key': apiKey },
        })
      );
    }

    // 比赛事件
    if (includeEvents) {
      const eventsUrl = new URL(`${API_BASE_URL}/fixtures/events`);
      eventsUrl.searchParams.append('fixture', fixtureId);
      requests.push(
        fetch(eventsUrl.toString(), {
          method: 'GET',
          headers: { 'x-apisports-key': apiKey },
        })
      );
    }

    const responses = await Promise.all(requests);

    for (const response of responses) {
      if (!response.ok) {
        return res.status(response.status).json({
          status: response.status,
          message: `Upstream API error: ${response.statusText}`,
        });
      }
    }

    const results = await Promise.all(responses.map((r) => r.json()));
    const fixtureData = results[0];

    if (fixtureData.errors && Object.keys(fixtureData.errors).length > 0) {
      return res.status(400).json({
        status: 400,
        message: Object.values(fixtureData.errors).join(', '),
      });
    }

    const responseData: {
      fixture: unknown;
      statistics?: unknown;
      events?: unknown;
    } = {
      fixture: fixtureData,
    };

    let resultIndex = 1;
    if (includeStats) {
      responseData.statistics = results[resultIndex];
      resultIndex++;
    }
    if (includeEvents) {
      responseData.events = results[resultIndex];
    }

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json(responseData);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ status: 500, message });
  }
}
