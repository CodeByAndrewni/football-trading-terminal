// ============================================
// 足球交易决策终端 - 常量配置
// ============================================

// API 配置
export const API_CONFIG = {
  BASE_URL: 'https://v3.football.api-sports.io',
  HEADERS: {
    'x-rapidapi-host': 'v3.football.api-sports.io',
  },
};

// 刷新间隔（毫秒）
export const REFRESH_INTERVALS = {
  LIVE_MATCHES: 10000,      // 10秒 - 前端轮询聚合 API
  MATCH_DETAIL: 15000,      // 15秒
  STATISTICS: 20000,        // 20秒
  CORNER_ANALYSIS: 10000,   // 10秒
};

// 比赛状态映射
export const MATCH_STATUS = {
  TBD: { label: '待定', color: 'muted' },
  NS: { label: '未开始', color: 'muted' },
  '1H': { label: '上半场', color: 'success' },
  HT: { label: '中场休息', color: 'warning' },
  '2H': { label: '下半场', color: 'success' },
  ET: { label: '加时赛', color: 'danger' },
  BT: { label: '点球休息', color: 'warning' },
  P: { label: '点球大战', color: 'danger' },
  SUSP: { label: '暂停', color: 'warning' },
  INT: { label: '中断', color: 'danger' },
  FT: { label: '完场', color: 'muted' },
  AET: { label: '加时完', color: 'muted' },
  PEN: { label: '点球完', color: 'muted' },
  PST: { label: '延期', color: 'warning' },
  CANC: { label: '取消', color: 'danger' },
  ABD: { label: '腰斩', color: 'danger' },
  AWD: { label: '判负', color: 'danger' },
  WO: { label: '弃权', color: 'danger' },
  LIVE: { label: '进行中', color: 'success' },
} as const;

// 进球概率评分阈值
export const SCORE_THRESHOLDS = {
  STRONG_BUY: 80,
  BUY: 60,
  HOLD: 40,
  AVOID: 0,
};

// ============================================
// 作战室配置 (BattleRoom)
// ============================================

// 信号强度分档阈值 (基于 0-100 分数)
// 注意：这是"信号强度"而非校准后的概率
export const BATTLE_ROOM_THRESHOLDS = {
  HIGH: 70,         // >= 70 为高概率区
  WATCH: 50,        // 50-69 为观望区
  LOW: 0,           // < 50 为低概率区
} as const;

// Hysteresis 配置：防止档位抖动
export const BATTLE_ROOM_HYSTERESIS = {
  // 连续N次刷新满足条件才升级档位
  UPGRADE_REQUIRED: 2,
  // 连续N次刷新不满足条件才降级档位
  DOWNGRADE_REQUIRED: 2,
  // 信号去重时间窗口（毫秒）
  SIGNAL_DEDUP_WINDOW_MS: 5 * 60 * 1000, // 5分钟
  // 同一信号在此强度变化内不重复记录
  SIGNAL_STRENGTH_DELTA: 8,
} as const;

// 信号命中/错失判定
export const BATTLE_ROOM_SIGNAL_RULES = {
  // 触发后N分钟内进球算命中
  HIT_WINDOW_MINUTES: 10,
  // 最低信号强度阈值才记录
  MIN_SIGNAL_STRENGTH: 65,
} as const;

// Kelly 缩放配置
export const KELLY_CONFIG = {
  // 保守倍数（使用凯利值的 1/fraction）
  FRACTION: 4,
  // 最大建议投注比例 %
  MAX_BET_PCT: 5,
  // 最小可用赔率（低于此不给建议）
  MIN_ODDS: 1.10,
  // 默认赔率（仅用于演示模式，实战必须有真实赔率）
  DEMO_ODDS: 1.85,
} as const;

// 评分到信号强度映射表（分桶校准）
// TODO: 用历史数据进行校准，目前是经验值
// 格式：{ score区间下限: 输出信号强度 }
export const SCORE_TO_STRENGTH_MAP: Array<[number, number]> = [
  [95, 88],  // score >= 95 → 88% 强度
  [90, 82],  // score >= 90 → 82%
  [85, 75],  // score >= 85 → 75%
  [80, 68],  // score >= 80 → 68%
  [75, 58],  // score >= 75 → 58%
  [70, 50],  // score >= 70 → 50%
  [65, 42],  // score >= 65 → 42%
  [60, 35],  // score >= 60 → 35%
  [55, 28],  // score >= 55 → 28%
  [0, 20],   // score < 55 → 20% (默认)
];

// 使用校准表转换评分到信号强度
export function scoreToSignalStrength(score: number): number {
  for (const [threshold, strength] of SCORE_TO_STRENGTH_MAP) {
    if (score >= threshold) return strength;
  }
  return 20; // 默认值
}

// 联赛优先级（用于排序）
export const LEAGUE_PRIORITY: Record<number, number> = {
  39: 1,   // 英超
  140: 2,  // 西甲
  78: 3,   // 德甲
  135: 4,  // 意甲
  61: 5,   // 法甲
  2: 6,    // 欧冠
  3: 7,    // 欧联
  848: 8,  // 欧协联
};

// 热门联赛
export const POPULAR_LEAGUES = [
  { id: 39, name: '英超', country: 'England' },
  { id: 140, name: '西甲', country: 'Spain' },
  { id: 78, name: '德甲', country: 'Germany' },
  { id: 135, name: '意甲', country: 'Italy' },
  { id: 61, name: '法甲', country: 'France' },
  { id: 2, name: '欧冠', country: 'World' },
  { id: 3, name: '欧联', country: 'World' },
  { id: 94, name: '葡超', country: 'Portugal' },
  { id: 88, name: '荷甲', country: 'Netherlands' },
  { id: 144, name: '比甲', country: 'Belgium' },
];

// 有滚球赔率覆盖的联赛 (API-Football Live Odds)
// 基于 API 查询结果，共 335 个联赛有赔率覆盖
// 最后更新: 2026-02-26
export const LEAGUES_WITH_LIVE_ODDS = new Set([
  // ========== 国际赛事 ==========
  2,    // UEFA Champions League
  3,    // UEFA Europa League
  10,   // Friendlies
  13,   // CONMEBOL Libertadores
  14,   // UEFA Youth League
  16,   // CONCACAF Champions League
  17,   // AFC Champions League
  18,   // AFC Cup
  525,  // UEFA Champions League Women
  541,  // CONMEBOL Recopa
  667,  // Friendlies Clubs
  848,  // UEFA Europa Conference League
  897,  // Asian Cup Women
  1162, // AGCFF Gulf Champions League
  1191, // UEFA Europa Cup - Women
  1214, // Ofc Pro League

  // ========== 英格兰 ==========
  39,   // Premier League
  40,   // Championship
  41,   // League One
  42,   // League Two
  43,   // National League
  46,   // EFL Trophy
  50,   // National League - North
  51,   // National League - South
  58,   // Non League Premier - Isthmian
  59,   // Non League Premier - Northern
  60,   // Non League Premier - Southern South
  699,  // Women's Championship
  702,  // Premier League 2 Division One
  703,  // Professional Development League
  871,  // Premier League Cup
  931,  // Non League Premier - Southern Central
  1156, // National League Cup

  // ========== 西班牙 ==========
  140,  // La Liga
  141,  // Segunda División
  142,  // Primera División Femenina
  143,  // Copa del Rey
  435,  // Primera División RFEF - Group 1
  436,  // Primera División RFEF - Group 2
  439,  // Tercera División RFEF - Group 1
  440,  // Tercera División RFEF - Group 2
  441,  // Tercera División RFEF - Group 3
  442,  // Tercera División RFEF - Group 4
  444,  // Tercera División RFEF - Group 6
  445,  // Tercera División RFEF - Group 7
  446,  // Tercera División RFEF - Group 8
  447,  // Tercera División RFEF - Group 9
  448,  // Tercera División RFEF - Group 10
  450,  // Tercera División RFEF - Group 12
  451,  // Tercera División RFEF - Group 13
  452,  // Tercera División RFEF - Group 14
  453,  // Tercera División RFEF - Group 15
  454,  // Tercera División RFEF - Group 16
  455,  // Tercera División RFEF - Group 17
  456,  // Tercera División RFEF - Group 18
  875,  // Segunda División RFEF - Group 1
  876,  // Segunda División RFEF - Group 2
  877,  // Segunda División RFEF - Group 3
  878,  // Segunda División RFEF - Group 4
  879,  // Segunda División RFEF - Group 5

  // ========== 德国 ==========
  78,   // Bundesliga
  79,   // 2. Bundesliga
  80,   // 3. Liga
  82,   // Frauen Bundesliga
  83,   // Regionalliga - Bayern
  84,   // Regionalliga - Nord
  85,   // Regionalliga - Nordost
  86,   // Regionalliga - SudWest
  87,   // Regionalliga - West

  // ========== 意大利 ==========
  135,  // Serie A
  136,  // Serie B
  137,  // Coppa Italia
  138,  // Serie C - Girone A
  139,  // Serie A Women
  426,  // Serie D - Girone A
  427,  // Serie D - Girone B
  428,  // Serie D - Girone C
  429,  // Serie D - Girone D
  430,  // Serie D - Girone E
  431,  // Serie D - Girone F
  432,  // Serie D - Girone G
  433,  // Serie D - Girone H
  434,  // Serie D - Girone I
  705,  // Campionato Primavera - 1
  706,  // Campionato Primavera - 2
  892,  // Coppa Italia Serie D
  942,  // Serie C - Girone B
  943,  // Serie C - Girone C

  // ========== 法国 ==========
  61,   // Ligue 1
  62,   // Ligue 2
  63,   // National 1
  64,   // Feminine Division 1
  67,   // National 2 - Group A
  68,   // National 2 - Group B
  69,   // National 2 - Group C

  // ========== 葡萄牙 ==========
  94,   // Primeira Liga
  95,   // Segunda Liga
  457,  // Campeonato de Portugal Prio - Group A
  458,  // Campeonato de Portugal Prio - Group B
  459,  // Campeonato de Portugal Prio - Group C
  460,  // Campeonato de Portugal Prio - Group D
  701,  // Liga Revelação U23
  865,  // Liga 3
  1041, // Júniores U19

  // ========== 荷兰 ==========
  88,   // Eredivisie
  89,   // Eerste Divisie
  91,   // Eredivisie Women
  92,   // Derde Divisie - Saturday
  93,   // Derde Divisie - Sunday
  492,  // Tweede Divisie

  // ========== 比利时 ==========
  144,  // Jupiler Pro League
  145,  // Challenger Pro League
  146,  // Super League Women
  150,  // Second Amateur Division - VFV B
  487,  // First Amateur Division
  518,  // Reserve Pro League

  // ========== 土耳其 ==========
  203,  // Süper Lig
  204,  // 1. Lig
  205,  // 2. Lig
  552,  // 3. Lig - Group 1
  554,  // 3. Lig - Group 3
  1027, // 3. Lig - Group 4

  // ========== 希腊 ==========
  197,  // Super League 1
  494,  // Super League 2
  580,  // Gamma Ethniki - Group 5
  581,  // Gamma Ethniki - Group 6

  // ========== 苏格兰 ==========
  179,  // Premiership
  180,  // Championship
  181,  // FA Cup
  182,  // Challenge Cup
  183,  // League One
  184,  // League Two
  730,  // Football League - Highland League
  731,  // Football League - Lowland League

  // ========== 俄罗斯 ==========
  235,  // Premier League
  236,  // First League

  // ========== 乌克兰 ==========
  333,  // Premier League

  // ========== 波兰 ==========
  106,  // Ekstraklasa
  107,  // I Liga
  109,  // II Liga - East

  // ========== 捷克 ==========
  345,  // Czech Liga
  346,  // FNL
  685,  // 3. liga - CFL B

  // ========== 奥地利 ==========
  218,  // Bundesliga
  219,  // 2. Liga
  221,  // Regionalliga - Ost
  484,  // Frauenliga

  // ========== 瑞士 ==========
  207,  // Super League
  208,  // Challenge League
  510,  // 1. Liga Promotion

  // ========== 丹麦 ==========
  119,  // Superliga
  120,  // 1. Division
  121,  // DBU Pokalen

  // ========== 挪威 ==========
  115,  // Eliteserien (from full list)

  // ========== 克罗地亚 ==========
  210,  // HNL
  211,  // 1. NL

  // ========== 罗马尼亚 ==========
  283,  // Liga I
  284,  // Liga II

  // ========== 塞尔维亚 ==========
  286,  // Super Liga
  287,  // Prva Liga

  // ========== 保加利亚 ==========
  172,  // First Professional League
  173,  // Second Professional League

  // ========== 匈牙利 ==========
  271,  // NB I
  272,  // NB II

  // ========== 斯洛伐克 ==========
  332,  // Super Liga
  680,  // Cup

  // ========== 斯洛文尼亚 ==========
  373,  // 1. SNL

  // ========== 波黑 ==========
  314,  // Cup
  315,  // Premijer Liga

  // ========== 黑山 ==========
  355,  // First League

  // ========== 北马其顿 ==========
  371,  // First League
  756,  // Cup

  // ========== 阿尔巴尼亚 ==========
  310,  // Superliga
  311,  // 1st Division

  // ========== 科索沃 ==========
  664,  // Superliga
  665,  // Cup

  // ========== 塞浦路斯 ==========
  318,  // 1. Division
  319,  // 2. Division

  // ========== 爱尔兰 ==========
  357,  // Premier Division
  358,  // First Division

  // ========== 北爱尔兰 ==========
  407,  // Championship
  408,  // Premiership
  757,  // Irish Cup

  // ========== 威尔士 ==========
  110,  // Premier League
  111,  // FAW Championship

  // ========== 冰岛 ==========
  168,  // League Cup

  // ========== 立陶宛 ==========
  362,  // A Lyga

  // ========== 卢森堡 ==========
  261,  // National Division

  // ========== 安道尔 ==========
  312,  // 1a Divisió

  // ========== 直布罗陀 ==========
  758,  // Premier Division

  // ========== 马耳他 ==========
  392,  // Challenge League
  393,  // Premier League
  821,  // FA Trophy

  // ========== 圣马力诺 ==========
  404,  // Campionato

  // ========== 以色列 ==========
  382,  // Liga Leumit
  383,  // Ligat Ha'al
  496,  // Liga Alef

  // ========== 阿塞拜疆 ==========
  418,  // Birinci Dasta
  419,  // Premyer Liqa

  // ========== 巴西 ==========
  71,   // Serie A
  73,   // Copa Do Brasil
  77,   // Alagoano
  475,  // Paulista - A1
  476,  // Paulista - A2
  477,  // Gaúcho - 1
  520,  // Acreano
  521,  // Amapaense
  522,  // Amazonense
  602,  // Baiano - 1
  603,  // Paraibano
  604,  // Catarinense - 1
  605,  // Paulista - A3
  606,  // Paranaense - 1
  608,  // Maranhense
  609,  // Cearense - 1
  610,  // Brasiliense
  611,  // Capixaba
  621,  // Piauiense
  622,  // Pernambucano - 1
  624,  // Carioca - 1
  626,  // Sergipano
  627,  // Paraense
  628,  // Goiano - 1
  629,  // Mineiro - 1
  630,  // Matogrossense
  631,  // Tocantinense
  740,  // Brasileiro U20 A
  1062, // Paulista - A4

  // ========== 阿根廷 ==========
  128,  // Liga Profesional Argentina
  129,  // Primera Nacional
  130,  // Copa Argentina
  131,  // Primera B Metropolitana
  132,  // Primera C
  906,  // Reserve League

  // ========== 哥伦比亚 ==========
  239,  // Primera A
  240,  // Primera B

  // ========== 智利 ==========
  265,  // Primera División
  266,  // Primera B

  // ========== 秘鲁 ==========
  281,  // Primera División

  // ========== 乌拉圭 ==========
  268,  // Primera División - Apertura

  // ========== 巴拉圭 ==========
  250,  // Division Profesional - Apertura

  // ========== 厄瓜多尔 ==========
  242,  // Liga Pro

  // ========== 委内瑞拉 ==========
  299,  // Primera División

  // ========== 玻利维亚 ==========
  1172, // Torneo Amistoso de Verano

  // ========== 墨西哥 ==========
  262,  // Liga MX
  263,  // Liga de Expansión MX
  673,  // Liga MX Femenil
  722,  // Liga Premier Serie A
  872,  // Liga Premier Serie B
  1200, // Liga MX U21

  // ========== 美国 ==========
  253,  // Major League Soccer
  1130, // USL Super League

  // ========== 中美洲/加勒比 ==========
  162,  // Costa Rica - Primera División
  163,  // Costa Rica - Liga de Ascenso
  234,  // Honduras - Liga Nacional
  304,  // Panama - Liga Panameña de Fútbol
  322,  // Jamaica - Premier League
  339,  // Guatemala - Liga Nacional
  370,  // El Salvador - Primera Division
  396,  // Nicaragua - Primera Division
  421,  // Aruba - Division di Honor
  422,  // Barbados - Premier League
  591,  // Trinidad And Tobago - Pro League
  759,  // Dominican Republic - Liga Mayor
  1219, // El Salvador - Copa Presidente

  // ========== 日本 ==========
  98,   // J1 League
  99,   // J2 League

  // ========== 韩国 ==========
  292,  // K League 1
  293,  // K League 2

  // ========== 中国 ==========
  // (暂无覆盖)

  // ========== 东南亚 ==========
  274,  // Indonesia - Liga 1
  275,  // Indonesia - Liga 2
  278,  // Malaysia - Super League
  296,  // Thailand - Thai League 1
  297,  // Thailand - Thai League 2
  298,  // Thailand - FA Cup
  340,  // Vietnam - V.League 1
  368,  // Singapore - Premier League
  410,  // Cambodia - C-League
  588,  // Myanmar - National League
  765,  // Philippines - PFL

  // ========== 南亚 ==========
  323,  // India - Indian Super League

  // ========== 西亚/中东 ==========
  290,  // Iran - Persian Gulf Pro League
  291,  // Iran - Azadegan League
  301,  // UAE - Pro League
  303,  // UAE - Division 1
  305,  // Qatar - Stars League
  307,  // Saudi Arabia - Pro League
  308,  // Saudi Arabia - Division 1
  330,  // Kuwait - Premier League
  331,  // Kuwait - Division 1
  380,  // Hong Kong - Premier League
  387,  // Jordan - League
  406,  // Oman - Professional League
  417,  // Bahrain - Premier League
  425,  // Syria - Premier League
  542,  // Iraq - Iraqi League
  716,  // Hong Kong - Senior Shield
  1218, // UAE - Pro League U23

  // ========== 澳洲 ==========
  188,  // A-League
  192,  // New South Wales NPL
  195,  // Victoria NPL
  481,  // Northern NSW NPL
  482,  // Queensland NPL
  835,  // New South Wales NPL 2
  836,  // Victoria NPL 2

  // ========== 非洲 ==========
  186,  // Algeria - Ligue 1
  187,  // Algeria - Ligue 2
  200,  // Morocco - Botola Pro
  201,  // Morocco - Botola 2
  202,  // Tunisia - Ligue 1
  233,  // Egypt - Premier League
  276,  // Kenya - FKF Premier League
  277,  // Kenya - Super League
  288,  // South Africa - Premier Soccer League
  363,  // Ethiopia - Premier League
  386,  // Ivory Coast - Ligue 1
  397,  // Angola - Girabola
  399,  // Nigeria - NPFL
  400,  // Zambia - Super League
  403,  // Senegal - Ligue 1
  405,  // Rwanda - National Soccer League
  411,  // Cameroon - Elite One
  423,  // Burkina Faso - Ligue 1
  507,  // South Africa - Cup
  567,  // Tanzania - Ligi kuu Bara
  570,  // Ghana - Premier League
  585,  // Uganda - Premier League
  598,  // Mali - Première Division
  714,  // Egypt - Cup
  823,  // (reserved)
  828,  // Tunisia - Ligue 2
  845,  // Gambia - GFA League
  887,  // Egypt - Second League
  899,  // (reserved)
  946,  // (reserved)
]);

// 检查联赛是否有滚球赔率覆盖
export function hasLiveOddsCoverage(leagueId: number | undefined): boolean {
  if (leagueId === undefined) return false;
  return LEAGUES_WITH_LIVE_ODDS.has(leagueId);
}

// 本地存储键名
export const STORAGE_KEYS = {
  WATCHLIST: 'ftt_watchlist',
  STRATEGIES: 'ftt_strategies',
  SETTINGS: 'ftt_settings',
};

// 默认设置
export const DEFAULT_SETTINGS = {
  refreshInterval: 30,
  soundEnabled: true,
  theme: 'dark' as const,
  watchlist: [],
  strategies: [
    {
      id: 'default_late_goal',
      name: '80分钟后进球策略',
      enabled: true,
      params: {
        minScore: 70,
        minMinute: 80,
        maxMinute: 90,
        alertSound: true,
      },
    },
  ],
};

// 路由路径
export const ROUTES = {
  HOME: '/',
  MATCH_DETAIL: '/match/:matchId',
  CORNER_ANALYSIS: '/corners/:matchId',
  MONITOR: '/monitor',
};

// 导航菜单
export const NAV_ITEMS = [
  { path: ROUTES.HOME, label: '比赛大厅', icon: 'Home' },
  { path: ROUTES.MONITOR, label: '大屏监控', icon: 'Monitor' },
];
