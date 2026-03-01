// ============================================
// Odds Service - Phase 1.5
// 负责 odds/live 数据采集、解析、存储
// ============================================

import type {
  LiveOddsData,
  LiveOddsBet,
  OddsData,
  Bookmaker,
  Bet,
  OddValue,
} from '../types';
import { LIVE_BET_TYPE_IDS } from '../types';
import type { OddsInfo } from '../data/advancedMockData';
import { saveOddsSnapshot, type OddsSnapshotInsert } from './supabaseData';

// ============================================
// 类型定义
// ============================================

// 单个 O/U 线信息（与 advancedMockData 的 OULineInfo 匹配）
export interface ParsedOULine {
  line: number;        // 盘口线 (1.5, 2.0, 2.25, 2.5, etc.)
  over: number | null; // 大球赔率
  under: number | null; // 小球赔率
  isMain: boolean;     // 是否为主盘口
}

export interface ParsedLiveOdds {
  fixture_id: number;
  captured_at: string;
  is_live: boolean;
  bookmaker: string;
  minute?: number;

  // 胜平负
  home_win: number | null;
  draw: number | null;
  away_win: number | null;

  // 大小球 - 固定线
  over_1_5: number | null;
  under_1_5: number | null;
  over_2_5: number | null;
  under_2_5: number | null;
  over_3_5: number | null;
  under_3_5: number | null;

  // 大小球 - 主盘（动态线）
  main_ou_line: number | null;      // 主盘口线 (可能是 1.5, 1.75, 2.0, 2.25, 2.5, etc.)
  main_ou_over: number | null;      // 主盘大球赔率
  main_ou_under: number | null;     // 主盘小球赔率

  // 大小球 - 所有可用线（用于悬停提示）
  all_ou_lines: ParsedOULine[];     // 所有可用的 O/U 线，按盘口从小到大排序

  // 让球
  asian_handicap_line: number | null;
  asian_handicap_home: number | null;
  asian_handicap_away: number | null;

  // 数据状态
  _raw_available: boolean;
  _fetch_status: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FETCHED';
  _fetch_error?: string;
}

export interface OddsFetchResult {
  fixture_id: number;
  success: boolean;
  odds: ParsedLiveOdds | null;
  status: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FETCHED';
  error?: string;
}

// 优先使用的博彩公司 ID（按优先级排序）
const PREFERRED_BOOKMAKERS = [
  8,    // Bet365
  6,    // Bwin
  11,   // 1xBet
  3,    // Unibet
  1,    // Pinnacle
];

// 盘口类型 ID - 赛前赔率
const BET_TYPE_IDS = {
  MATCH_WINNER: 1,
  ASIAN_HANDICAP: 8,
  OVER_UNDER: 5,
};

// 盘口类型 ID - 滚球赔率 (从 types/index.ts 导入 LIVE_BET_TYPE_IDS)

// ============================================
// 解析函数
// ============================================

/**
 * 从博彩公司数据中找到特定盘口 (赛前赔率)
 */
function findBet(bookmaker: Bookmaker, betId: number): Bet | undefined {
  return bookmaker.bets.find(b => b.id === betId);
}

/**
 * 从盘口值中提取赔率 (赛前赔率)
 */
function findOddValue(values: OddValue[], searchValue: string): number | null {
  const found = values.find(v => v.value === searchValue || v.value.toLowerCase() === searchValue.toLowerCase());
  if (!found) return null;
  const parsed = Number.parseFloat(found.odd);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 从让球盘口提取盘口线和赔率 (赛前赔率)
 */
function parseAsianHandicap(bet: Bet | undefined): {
  line: number | null;
  home: number | null;
  away: number | null;
} {
  if (!bet || !bet.values || bet.values.length < 2) {
    return { line: null, home: null, away: null };
  }

  const homeValue = bet.values.find(v => v.value.includes('Home'));
  const awayValue = bet.values.find(v => v.value.includes('Away'));

  if (!homeValue || !awayValue) {
    return { line: null, home: null, away: null };
  }

  const lineMatch = homeValue.value.match(/(-?\d+\.?\d*)/);
  const line = lineMatch ? Number.parseFloat(lineMatch[1]) : null;

  return {
    line,
    home: Number.parseFloat(homeValue.odd) || null,
    away: Number.parseFloat(awayValue.odd) || null,
  };
}

/**
 * 从滚球赔率 odds 数组中找到特定盘口
 */
function findLiveBet(odds: LiveOddsBet[], betId: number): LiveOddsBet | undefined {
  return odds.find(o => o.id === betId);
}

/**
 * 从滚球大小球盘口提取赔率
 * 优化：同时提取主盘口（main: true）、固定线（1.5, 2.5, 3.5）和所有可用线
 */
function parseLiveOverUnder(bet: LiveOddsBet | undefined): {
  over_1_5: number | null;
  under_1_5: number | null;
  over_2_5: number | null;
  under_2_5: number | null;
  over_3_5: number | null;
  under_3_5: number | null;
  // 主盘口（动态线）
  main_line: number | null;
  main_over: number | null;
  main_under: number | null;
  // 所有可用的 O/U 线
  all_lines: ParsedOULine[];
} {
  const result = {
    over_1_5: null as number | null,
    under_1_5: null as number | null,
    over_2_5: null as number | null,
    under_2_5: null as number | null,
    over_3_5: null as number | null,
    under_3_5: null as number | null,
    main_line: null as number | null,
    main_over: null as number | null,
    main_under: null as number | null,
    all_lines: [] as ParsedOULine[],
  };

  if (!bet || !bet.values) return result;

  // 收集所有可用的盘口线（用 Map 聚合 Over/Under）
  const lineMap = new Map<string, { over: number | null; under: number | null; isMain: boolean }>();

  // 1. 提取所有 O/U 值，同时记录固定线
  for (const v of bet.values) {
    const handicap = v.handicap;
    const odd = Number.parseFloat(v.odd);
    if (!handicap || Number.isNaN(odd) || v.suspended) continue;

    // 初始化线信息
    if (!lineMap.has(handicap)) {
      lineMap.set(handicap, { over: null, under: null, isMain: !!v.main });
    }

    const lineInfo = lineMap.get(handicap)!;
    if (v.value === 'Over') {
      lineInfo.over = odd;
    }
    if (v.value === 'Under') {
      lineInfo.under = odd;
    }
    if (v.main) {
      lineInfo.isMain = true;
    }

    // 固定线赔率
    if (handicap === '1.5') {
      if (v.value === 'Over') result.over_1_5 = odd;
      if (v.value === 'Under') result.under_1_5 = odd;
    } else if (handicap === '2.5') {
      if (v.value === 'Over') result.over_2_5 = odd;
      if (v.value === 'Under') result.under_2_5 = odd;
    } else if (handicap === '3.5') {
      if (v.value === 'Over') result.over_3_5 = odd;
      if (v.value === 'Under') result.under_3_5 = odd;
    }
  }

  // 2. 转换为排序的数组
  result.all_lines = Array.from(lineMap.entries())
    .map(([lineStr, info]) => ({
      line: Number.parseFloat(lineStr),
      over: info.over,
      under: info.under,
      isMain: info.isMain,
    }))
    .filter(l => !Number.isNaN(l.line) && (l.over !== null || l.under !== null))
    .sort((a, b) => a.line - b.line);

  // 3. 提取主盘口（main: true）
  const mainLine = result.all_lines.find(l => l.isMain);
  if (mainLine) {
    result.main_line = mainLine.line;
    result.main_over = mainLine.over;
    result.main_under = mainLine.under;
  }

  // 4. 如果没有 main 标记，尝试推断主盘口（取第一对有效值）
  if (result.main_line === null) {
    // 按常见顺序检查
    const lineOrder = [2.5, 2.25, 2.0, 1.75, 1.5, 2.75, 3.0, 3.5];

    for (const targetLine of lineOrder) {
      const found = result.all_lines.find(l => l.line === targetLine && l.over !== null && l.under !== null);
      if (found) {
        result.main_line = found.line;
        result.main_over = found.over;
        result.main_under = found.under;
        // 标记为主盘
        found.isMain = true;
        break;
      }
    }
  }

  return result;
}

/**
 * 从滚球让球盘口提取主线赔率
 */
function parseLiveAsianHandicap(bet: LiveOddsBet | undefined): {
  line: number | null;
  home: number | null;
  away: number | null;
} {
  if (!bet || !bet.values) {
    return { line: null, home: null, away: null };
  }

  // 找到 main: true 的那对（主盘口）
  const mainValues = bet.values.filter(v => v.main && !v.suspended);

  if (mainValues.length < 2) {
    // 如果没有 main 标记，取第一对
    const firstValues = bet.values.filter(v => !v.suspended).slice(0, 2);
    if (firstValues.length < 2) {
      return { line: null, home: null, away: null };
    }
    const homeVal = firstValues.find(v => v.value === 'Home');
    const awayVal = firstValues.find(v => v.value === 'Away');
    if (!homeVal || !awayVal) {
      return { line: null, home: null, away: null };
    }
    return {
      line: homeVal.handicap ? Number.parseFloat(homeVal.handicap) : null,
      home: Number.parseFloat(homeVal.odd) || null,
      away: Number.parseFloat(awayVal.odd) || null,
    };
  }

  const homeVal = mainValues.find(v => v.value === 'Home');
  const awayVal = mainValues.find(v => v.value === 'Away');

  if (!homeVal || !awayVal) {
    return { line: null, home: null, away: null };
  }

  return {
    line: homeVal.handicap ? Number.parseFloat(homeVal.handicap) : null,
    home: Number.parseFloat(homeVal.odd) || null,
    away: Number.parseFloat(awayVal.odd) || null,
  };
}

/**
 * 从滚球胜平负盘口提取赔率
 */
function parseLiveFulltimeResult(bet: LiveOddsBet | undefined): {
  home: number | null;
  draw: number | null;
  away: number | null;
} {
  if (!bet || !bet.values) {
    return { home: null, draw: null, away: null };
  }

  const homeVal = bet.values.find(v => v.value === 'Home' && !v.suspended);
  const drawVal = bet.values.find(v => v.value === 'Draw' && !v.suspended);
  const awayVal = bet.values.find(v => v.value === 'Away' && !v.suspended);

  return {
    home: homeVal ? Number.parseFloat(homeVal.odd) || null : null,
    draw: drawVal ? Number.parseFloat(drawVal.odd) || null : null,
    away: awayVal ? Number.parseFloat(awayVal.odd) || null : null,
  };
}

/**
 * 创建空的 ParsedLiveOdds 对象
 */
function createEmptyParsedOdds(fixtureId: number, minute?: number): ParsedLiveOdds {
  return {
    fixture_id: fixtureId,
    captured_at: new Date().toISOString(),
    is_live: true,
    bookmaker: 'N/A',
    minute,
    home_win: null,
    draw: null,
    away_win: null,
    over_1_5: null,
    under_1_5: null,
    over_2_5: null,
    under_2_5: null,
    over_3_5: null,
    under_3_5: null,
    main_ou_line: null,
    main_ou_over: null,
    main_ou_under: null,
    all_ou_lines: [],
    asian_handicap_line: null,
    asian_handicap_home: null,
    asian_handicap_away: null,
    _raw_available: false,
    _fetch_status: 'EMPTY',
  };
}

/**
 * 解析单场比赛的 live odds
 * 支持两种结构：
 * 1. 赛前赔率: bookmakers 数组
 * 2. 滚球赔率: odds 数组 (直接在响应中)
 */
export function parseLiveOdds(
  oddsData: LiveOddsData | OddsData,
  minute?: number
): ParsedLiveOdds {
  // 🔥 第一行就打印，确保被调用
  console.log(`[parseLiveOdds] === FUNCTION CALLED === minute=${minute}`);

  // 🔥 增强日志：检查输入数据
  if (!oddsData) {
    console.warn('[parseLiveOdds] No oddsData provided');
    return createEmptyParsedOdds(0, minute);
  }

  const fixtureId = oddsData.fixture?.id;
  if (!fixtureId) {
    console.warn('[parseLiveOdds] Invalid oddsData - no fixture.id');
    return createEmptyParsedOdds(0, minute);
  }

  const capturedAt = new Date().toISOString();

  // 🔥 增强日志：显示输入数据结构
  const liveOddsCount = (oddsData as LiveOddsData).odds?.length ?? 0;
  const bookmakersCount = (oddsData as OddsData).bookmakers?.length ?? 0;
  console.log(`[parseLiveOdds] fixture=${fixtureId} | liveOdds=${liveOddsCount} | bookmakers=${bookmakersCount}`);

  // 基础结果（无数据）
  const emptyResult: ParsedLiveOdds = {
    fixture_id: fixtureId,
    captured_at: capturedAt,
    is_live: true,
    bookmaker: 'N/A',
    minute,
    home_win: null,
    draw: null,
    away_win: null,
    over_1_5: null,
    under_1_5: null,
    over_2_5: null,
    under_2_5: null,
    over_3_5: null,
    under_3_5: null,
    main_ou_line: null,
    main_ou_over: null,
    main_ou_under: null,
    all_ou_lines: [],
    asian_handicap_line: null,
    asian_handicap_home: null,
    asian_handicap_away: null,
    _raw_available: false,
    _fetch_status: 'EMPTY',
  };

  // ============================================
  // 检测并处理滚球赔率结构 (odds 数组)
  // ============================================
  const liveResponse = oddsData as LiveOddsData;
  if (liveResponse.odds && Array.isArray(liveResponse.odds) && liveResponse.odds.length > 0) {
    const odds = liveResponse.odds;

    // 🔥 调试日志：显示可用盘口
    console.log(`[parseLiveOdds] Found ${odds.length} markets for fixture ${fixtureId}`);
    const marketIds = odds.map(o => o.id).join(',');
    console.log(`[parseLiveOdds] Market IDs: ${marketIds}`);

    // 解析大小球 - 支持多个可能的ID
    let ouBet = findLiveBet(odds, LIVE_BET_TYPE_IDS.OVER_UNDER_LINE); // id: 36
    console.log(`[parseLiveOdds] Looking for OU market (id=36): ${!!ouBet}`);
    if (!ouBet) {
      ouBet = findLiveBet(odds, LIVE_BET_TYPE_IDS.MATCH_GOALS); // id: 25 回退
      console.log(`[parseLiveOdds] Using Match Goals (25) as fallback: ${!!ouBet}`);
    }
    if (ouBet) {
      console.log(`[parseLiveOdds] OU market has ${ouBet.values?.length ?? 0} values`);
    }
    const ouResult = parseLiveOverUnder(ouBet);

    // 🔥 调试日志
    if (ouResult.main_line !== null) {
      console.log(`[parseLiveOdds] ✅ O/U parsed: line=${ouResult.main_line}, over=${ouResult.main_over}, under=${ouResult.main_under}`);
    } else {
      console.warn(`[parseLiveOdds] ❌ Failed to parse O/U line`);
    }

    // 解析让球
    const ahBet = findLiveBet(odds, LIVE_BET_TYPE_IDS.ASIAN_HANDICAP); // id: 33
    console.log(`[parseLiveOdds] Looking for AH market (id=33): ${!!ahBet}`);
    if (ahBet) {
      console.log(`[parseLiveOdds] AH market has ${ahBet.values?.length ?? 0} values`);
    }
    const ahResult = parseLiveAsianHandicap(ahBet);

    // 🔥 调试日志
    if (ahResult.line !== null) {
      console.log(`[parseLiveOdds] ✅ Handicap parsed: line=${ahResult.line}, home=${ahResult.home}, away=${ahResult.away}`);
    } else {
      console.warn(`[parseLiveOdds] ❌ Failed to parse Handicap`);
    }

    // 解析胜平负
    const ftBet = findLiveBet(odds, LIVE_BET_TYPE_IDS.FULLTIME_RESULT); // id: 59
    console.log(`[parseLiveOdds] Looking for FT market (id=59): ${!!ftBet}`);
    const ftResult = parseLiveFulltimeResult(ftBet);

    // 判断是否有实际数据
    const hasAnyOdds =
      ftResult.home !== null ||
      ouResult.over_2_5 !== null ||
      ahResult.line !== null ||
      ouResult.main_line !== null;

    // 🔥 调试日志
    console.log(`[parseLiveOdds] === FINAL RESULT === hasAnyOdds=${hasAnyOdds}, ftHome=${ftResult.home}, ou25=${ouResult.over_2_5}, ahLine=${ahResult.line}, ouMain=${ouResult.main_line}`);

    return {
      fixture_id: fixtureId,
      captured_at: capturedAt,
      is_live: true,
      bookmaker: 'API-Football Live',
      minute: liveResponse.fixture?.status?.elapsed ?? minute,
      home_win: ftResult.home,
      draw: ftResult.draw,
      away_win: ftResult.away,
      over_1_5: ouResult.over_1_5,
      under_1_5: ouResult.under_1_5,
      over_2_5: ouResult.over_2_5,
      under_2_5: ouResult.under_2_5,
      over_3_5: ouResult.over_3_5,
      under_3_5: ouResult.under_3_5,
      main_ou_line: ouResult.main_line,
      main_ou_over: ouResult.main_over,
      main_ou_under: ouResult.main_under,
      all_ou_lines: ouResult.all_lines, // 所有可用的 O/U 线
      asian_handicap_line: ahResult.line,
      asian_handicap_home: ahResult.home,
      asian_handicap_away: ahResult.away,
      _raw_available: hasAnyOdds,
      _fetch_status: hasAnyOdds ? 'SUCCESS' : 'EMPTY',
    };
  }

  // ============================================
  // 处理赛前赔率结构 (bookmakers 数组)
  // ============================================
  const preMatchData = oddsData as OddsData;
  const bookmakers = preMatchData.bookmakers;
  if (!bookmakers || bookmakers.length === 0) {
    return emptyResult;
  }

  // 选择最优先的博彩公司
  let selectedBookmaker: Bookmaker | null = null;
  for (const prefId of PREFERRED_BOOKMAKERS) {
    const found = bookmakers.find(b => b.id === prefId);
    if (found && found.bets && found.bets.length > 0) {
      selectedBookmaker = found;
      break;
    }
  }

  // 如果没有首选，使用第一个有数据的
  if (!selectedBookmaker) {
    selectedBookmaker = bookmakers.find(b => b.bets && b.bets.length > 0) || null;
  }

  if (!selectedBookmaker) {
    return emptyResult;
  }

  // 解析胜平负
  const matchWinnerBet = findBet(selectedBookmaker, BET_TYPE_IDS.MATCH_WINNER);
  const homeWin = matchWinnerBet ? findOddValue(matchWinnerBet.values, 'Home') : null;
  const draw = matchWinnerBet ? findOddValue(matchWinnerBet.values, 'Draw') : null;
  const awayWin = matchWinnerBet ? findOddValue(matchWinnerBet.values, 'Away') : null;

  // 解析大小球
  const overUnderBet = findBet(selectedBookmaker, BET_TYPE_IDS.OVER_UNDER);
  const over_1_5 = overUnderBet ? findOddValue(overUnderBet.values, 'Over 1.5') : null;
  const under_1_5 = overUnderBet ? findOddValue(overUnderBet.values, 'Under 1.5') : null;
  const over_2_5 = overUnderBet ? findOddValue(overUnderBet.values, 'Over 2.5') : null;
  const under_2_5 = overUnderBet ? findOddValue(overUnderBet.values, 'Under 2.5') : null;
  const over_3_5 = overUnderBet ? findOddValue(overUnderBet.values, 'Over 3.5') : null;
  const under_3_5 = overUnderBet ? findOddValue(overUnderBet.values, 'Under 3.5') : null;

  // 解析主盘口（主线） - 赛前赔率通常没有 main 标记，推断主盘口
  let main_ou_line: number | null = null;
  let main_ou_over: number | null = null;
  let main_ou_under: number | null = null;
  // 按常见顺序推断主盘口
  const lineOrder = [
    { line: 2.5, over: over_2_5, under: under_2_5 },
    { line: 2.25, over: null, under: null },
    { line: 2.0, over: null, under: null },
    { line: 1.75, over: null, under: null },
    { line: 1.5, over: over_1_5, under: under_1_5 },
    { line: 2.75, over: null, under: null },
    { line: 3.0, over: null, under: null },
    { line: 3.5, over: over_3_5, under: under_3_5 },
  ];
  for (const item of lineOrder) {
    if (item.over !== null && item.under !== null) {
      main_ou_line = item.line;
      main_ou_over = item.over;
      main_ou_under = item.under;
      break;
    }
  }

  // 解析让球
  const asianHandicapBet = findBet(selectedBookmaker, BET_TYPE_IDS.ASIAN_HANDICAP);
  const { line: ahLine, home: ahHome, away: ahAway } = parseAsianHandicap(asianHandicapBet);

  // 判断是否有实际数据
  const hasAnyOdds =
    homeWin !== null ||
    over_2_5 !== null ||
    ahLine !== null ||
    main_ou_line !== null;

  // 构建赛前赔率的 all_ou_lines（只有固定线 1.5, 2.5, 3.5）
  const preMatchAllLines: ParsedOULine[] = [];
  if (over_1_5 !== null || under_1_5 !== null) {
    preMatchAllLines.push({ line: 1.5, over: over_1_5, under: under_1_5, isMain: main_ou_line === 1.5 });
  }
  if (over_2_5 !== null || under_2_5 !== null) {
    preMatchAllLines.push({ line: 2.5, over: over_2_5, under: under_2_5, isMain: main_ou_line === 2.5 });
  }
  if (over_3_5 !== null || under_3_5 !== null) {
    preMatchAllLines.push({ line: 3.5, over: over_3_5, under: under_3_5, isMain: main_ou_line === 3.5 });
  }
  // 按盘口线排序
  preMatchAllLines.sort((a, b) => a.line - b.line);

  return {
    fixture_id: fixtureId,
    captured_at: capturedAt,
    is_live: false, // 赛前赔率
    bookmaker: selectedBookmaker.name,
    minute,
    home_win: homeWin,
    draw,
    away_win: awayWin,
    over_1_5,
    under_1_5,
    over_2_5,
    under_2_5,
    over_3_5,
    under_3_5,
    main_ou_line,
    main_ou_over,
    main_ou_under,
    all_ou_lines: preMatchAllLines, // 赛前赔率所有可用的 O/U 线
    asian_handicap_line: ahLine,
    asian_handicap_home: ahHome,
    asian_handicap_away: ahAway,
    _raw_available: hasAnyOdds,
    _fetch_status: hasAnyOdds ? 'SUCCESS' : 'EMPTY',
  };
}

/**
 * 将 ParsedLiveOdds 转换为 AdvancedMatch 的 OddsInfo 格式
 * Phase 2A: 不使用默认值，保留 null
 */
export function convertToOddsInfo(parsed: ParsedLiveOdds, prevOdds?: OddsInfo): OddsInfo {
  // 计算趋势（与前次比较）
  const calcTrend = (current: number | null, prev?: number | null): 'up' | 'down' | 'stable' => {
    if (current === null || prev === undefined || prev === null) return 'stable';
    if (current < prev - 0.02) return 'down';
    if (current > prev + 0.02) return 'up';
    return 'stable';
  };

  // Phase 2A: 保留 null 值，不使用默认值
  const ahLine = parsed.asian_handicap_line; // 不再 ?? 0

  // 优先使用主盘口线，如果没有则回退到 2.5, 1.5, 3.5
  let ouLine: number | null = parsed.main_ou_line;
  let ouOver: number | null = parsed.main_ou_over;
  let ouUnder: number | null = parsed.main_ou_under;
  if (ouLine === null) {
    if (parsed.over_2_5 !== null || parsed.under_2_5 !== null) {
      ouLine = 2.5;
      ouOver = parsed.over_2_5;
      ouUnder = parsed.under_2_5;
    } else if (parsed.over_1_5 !== null || parsed.under_1_5 !== null) {
      ouLine = 1.5;
      ouOver = parsed.over_1_5;
      ouUnder = parsed.under_1_5;
    } else if (parsed.over_3_5 !== null || parsed.under_3_5 !== null) {
      ouLine = 3.5;
      ouOver = parsed.over_3_5;
      ouUnder = parsed.under_3_5;
    }
  }

  return {
    handicap: {
      home: parsed.asian_handicap_home, // Phase 2A: 保留 null
      value: ahLine, // Phase 2A: 保留 null
      away: parsed.asian_handicap_away, // Phase 2A: 保留 null
      homeTrend: calcTrend(parsed.asian_handicap_home, prevOdds?.handicap?.home),
      awayTrend: calcTrend(parsed.asian_handicap_away, prevOdds?.handicap?.away),
    },
    overUnder: {
      over: ouOver, // 优先主盘口赔率
      total: ouLine, // 优先主盘口线
      under: ouUnder,
      overTrend: calcTrend(ouOver, prevOdds?.overUnder?.over),
      underTrend: calcTrend(ouUnder, prevOdds?.overUnder?.under),
      // 传递所有可用的 O/U 线（用于悬停提示）
      allLines: parsed.all_ou_lines.map(line => ({
        line: line.line,
        over: line.over,
        under: line.under,
        isMain: line.isMain,
      })),
    },
    matchWinner: {
      home: parsed.home_win,
      draw: parsed.draw,
      away: parsed.away_win,
    },
    // 元数据
    _source: 'API-Football',
    _bookmaker: parsed.bookmaker,
    _captured_at: parsed.captured_at,
    _is_live: parsed.is_live,
    _fetch_status: parsed._fetch_status,
  };
}

/**
 * 保存赔率到 Supabase
 */
export async function storeOddsSnapshot(parsed: ParsedLiveOdds): Promise<boolean> {
  // Skip if no actual odds data
  if (!parsed._raw_available) {
    return false;
  }

  const snapshot: OddsSnapshotInsert = {
    fixture_id: parsed.fixture_id,
    minute: parsed.minute ?? undefined,
    home_win: parsed.home_win ?? undefined,
    draw: parsed.draw ?? undefined,
    away_win: parsed.away_win ?? undefined,
    // 大小球 - 固定线
    over_1_5: parsed.over_1_5 ?? undefined,
    under_1_5: parsed.under_1_5 ?? undefined,
    over_2_5: parsed.over_2_5 ?? undefined,
    under_2_5: parsed.under_2_5 ?? undefined,
    over_3_5: parsed.over_3_5 ?? undefined,
    under_3_5: parsed.under_3_5 ?? undefined,
    // 大小球 - 主盘口（动态线）
    main_ou_line: parsed.main_ou_line ?? undefined,
    main_ou_over: parsed.main_ou_over ?? undefined,
    main_ou_under: parsed.main_ou_under ?? undefined,
    // 让球
    asian_handicap_line: parsed.asian_handicap_line ?? undefined,
    asian_handicap_home: parsed.asian_handicap_home ?? undefined,
    asian_handicap_away: parsed.asian_handicap_away ?? undefined,
    bookmaker: parsed.bookmaker,
    is_live: parsed.is_live,
  };

  try {
    const result = await saveOddsSnapshot(snapshot);
    // Log successful write (once per fixture)
    console.log(`[ODDS_DB_WRITE] fixture=${parsed.fixture_id} minute=${parsed.minute} is_live=${parsed.is_live} bookmaker=${parsed.bookmaker} result=${result ? 'OK' : 'FAIL'}`);
    return result !== null;
  } catch (error) {
    console.error(`[ODDS_DB_WRITE_ERROR] fixture=${parsed.fixture_id} error=${error instanceof Error ? error.message : 'unknown'}`);
    throw error; // Re-throw to make errors visible
  }
}

// ============================================
// 批量获取接口
// ============================================

/**
 * 批量获取多场比赛的 live odds
 * 注意：API-Football 有速率限制，需要控制并发
 */
export async function fetchLiveOddsForFixtures(
  fixtureIds: number[],
  getLiveOddsFn: (fixtureId: number) => Promise<LiveOddsData[]>,
  minuteMap?: Map<number, number>
): Promise<Map<number, ParsedLiveOdds>> {
  const results = new Map<number, ParsedLiveOdds>();

  // 分批处理，每批3个，避免速率限制
  const batchSize = 3;

  for (let i = 0; i < fixtureIds.length; i += batchSize) {
    const batch = fixtureIds.slice(i, i + batchSize);

    const batchPromises = batch.map(async (fixtureId) => {
      try {
        const oddsData = await getLiveOddsFn(fixtureId);
        const minute = minuteMap?.get(fixtureId);

        if (oddsData && oddsData.length > 0) {
          const parsed = parseLiveOdds(oddsData[0], minute);

          // 异步存储（不阻塞）
          storeOddsSnapshot(parsed).catch(err => {
            console.warn(`Failed to store odds for fixture ${fixtureId}:`, err);
          });

          return { fixtureId, parsed };
        }

        // 空返回
        return {
          fixtureId,
          parsed: {
            fixture_id: fixtureId,
            captured_at: new Date().toISOString(),
            is_live: true,
            bookmaker: 'N/A',
            minute,
            home_win: null,
            draw: null,
            away_win: null,
            over_1_5: null,
            under_1_5: null,
            over_2_5: null,
            under_2_5: null,
            over_3_5: null,
            under_3_5: null,
            main_ou_line: null,
            main_ou_over: null,
            main_ou_under: null,
            all_ou_lines: [],
            asian_handicap_line: null,
            asian_handicap_home: null,
            asian_handicap_away: null,
            _raw_available: false,
            _fetch_status: 'EMPTY' as const,
          } satisfies ParsedLiveOdds,
        };
      } catch (error) {
        console.warn(`Failed to fetch odds for fixture ${fixtureId}:`, error);
        const minute = minuteMap?.get(fixtureId);
        return {
          fixtureId,
          parsed: {
            fixture_id: fixtureId,
            captured_at: new Date().toISOString(),
            is_live: true,
            bookmaker: 'N/A',
            minute,
            home_win: null,
            draw: null,
            away_win: null,
            over_1_5: null,
            under_1_5: null,
            over_2_5: null,
            under_2_5: null,
            over_3_5: null,
            under_3_5: null,
            main_ou_line: null,
            main_ou_over: null,
            main_ou_under: null,
            all_ou_lines: [],
            asian_handicap_line: null,
            asian_handicap_home: null,
            asian_handicap_away: null,
            _raw_available: false,
            _fetch_status: 'ERROR' as const,
            _fetch_error: error instanceof Error ? error.message : 'Unknown error',
          } satisfies ParsedLiveOdds,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const { fixtureId, parsed } of batchResults) {
      results.set(fixtureId, parsed);
    }

    // 批次间延迟，避免速率限制
    if (i + batchSize < fixtureIds.length) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  return results;
}

// ============================================
// 统计接口（用于监控）
// ============================================

export interface OddsPipelineStats {
  total_fetched: number;
  with_any_odds: number;
  with_live_odds: number;
  with_prematch_odds: number;
  empty_responses: number;
  errors: number;
  coverage_percent: number;
}

/**
 * 计算 odds 覆盖率统计
 */
export function calculateOddsCoverage(results: Map<number, ParsedLiveOdds>): OddsPipelineStats {
  let total = 0;
  let withAnyOdds = 0;
  let withLiveOdds = 0;
  let emptyResponses = 0;
  let errors = 0;

  for (const parsed of results.values()) {
    total++;
    if (parsed._fetch_status === 'SUCCESS') {
      withAnyOdds++;
      if (parsed.is_live) withLiveOdds++;
    } else if (parsed._fetch_status === 'EMPTY') {
      emptyResponses++;
    } else if (parsed._fetch_status === 'ERROR') {
      errors++;
    }
  }

  return {
    total_fetched: total,
    with_any_odds: withAnyOdds,
    with_live_odds: withLiveOdds,
    with_prematch_odds: 0, // 需要单独获取
    empty_responses: emptyResponses,
    errors,
    coverage_percent: total > 0 ? Math.round((withAnyOdds / total) * 100) : 0,
  };
}
