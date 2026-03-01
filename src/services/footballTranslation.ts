// ============================================
// 足球名称中英文翻译服务
// ============================================
// 使用静态映射表 + 内存缓存，零性能影响
// ============================================

// ============================================
// 联赛映射表
// ============================================
export const LEAGUE_MAP: Record<string, string> = {
  // 英格兰
  "Premier League": "英超",
  "Championship": "英冠",
  "League One": "英甲",
  "League Two": "英乙",
  "FA Cup": "足总杯",
  "EFL Cup": "联赛杯",
  "Community Shield": "社区盾",

  // 西班牙
  "La Liga": "西甲",
  "Segunda División": "西乙",
  "Copa del Rey": "国王杯",
  "Supercopa de España": "西班牙超级杯",

  // 意大利
  "Serie A": "意甲",
  "Serie B": "意乙",
  "Coppa Italia": "意大利杯",
  "Supercoppa Italiana": "意大利超级杯",

  // 德国
  "Bundesliga": "德甲",
  "2. Bundesliga": "德乙",
  "DFB Pokal": "德国杯",
  "DFL-Supercup": "德国超级杯",

  // 法国
  "Ligue 1": "法甲",
  "Ligue 2": "法乙",
  "Coupe de France": "法国杯",
  "Trophée des Champions": "法国超级杯",

  // 欧洲赛事
  "UEFA Champions League": "欧冠",
  "Champions League": "欧冠",
  "UEFA Europa League": "欧联",
  "Europa League": "欧联",
  "UEFA Europa Conference League": "欧协联",
  "Europa Conference League": "欧协联",
  "UEFA Super Cup": "欧洲超级杯",
  "UEFA Nations League": "欧国联",

  // 荷兰
  "Eredivisie": "荷甲",
  "Eerste Divisie": "荷乙",
  "KNVB Beker": "荷兰杯",

  // 葡萄牙
  "Primeira Liga": "葡超",
  "Liga Portugal": "葡超",
  "Taça de Portugal": "葡萄牙杯",

  // 苏格兰
  "Scottish Premiership": "苏超",
  "Scottish Championship": "苏冠",

  // 比利时
  "Jupiler Pro League": "比甲",
  "Pro League": "比甲",

  // 土耳其
  "Süper Lig": "土超",
  "Super Lig": "土超",

  // 俄罗斯
  "Russian Premier League": "俄超",
  "Premier League Russia": "俄超",

  // 乌克兰
  "Ukrainian Premier League": "乌超",

  // 亚洲
  "Chinese Super League": "中超",
  "CSL": "中超",
  "J1 League": "日职",
  "J.League": "日职",
  "J2 League": "日乙",
  "K League 1": "韩K",
  "K League": "韩K",
  "Saudi Pro League": "沙特联",
  "Saudi Professional League": "沙特联",
  "A-League": "澳超",
  "A-League Men": "澳超",
  "Indian Super League": "印超",
  "Thai League 1": "泰超",
  "Thai Premier League": "泰超",

  // 南美
  "Brasileirão": "巴甲",
  "Serie A Brazil": "巴甲",
  "Campeonato Brasileiro Série A": "巴甲",
  "Liga Profesional Argentina": "阿甲",
  "Argentine Primera División": "阿甲",
  "Copa Libertadores": "解放者杯",
  "Copa Sudamericana": "南美杯",

  // 北美
  "MLS": "美职联",
  "Major League Soccer": "美职联",
  "Liga MX": "墨超",
  "CONCACAF Champions League": "中北美冠",

  // 国际赛事
  "World Cup": "世界杯",
  "FIFA World Cup": "世界杯",
  "World Cup Qualification": "世预赛",
  "Euro Championship": "欧洲杯",
  "UEFA Euro": "欧洲杯",
  "Copa America": "美洲杯",
  "Africa Cup of Nations": "非洲杯",
  "AFCON": "非洲杯",
  "Asian Cup": "亚洲杯",
  "AFC Asian Cup": "亚洲杯",
  "Friendlies": "友谊赛",
  "International Friendly": "友谊赛",
  "Club Friendlies": "俱乐部友谊赛",

  // 其他
  "National League": "全国联赛",
};

// ============================================
// 球队映射表（按联赛分组）
// ============================================
export const TEAM_MAP: Record<string, string> = {
  // ========== 英超 ==========
  "Manchester United": "曼联",
  "Manchester City": "曼城",
  "Liverpool": "利物浦",
  "Arsenal": "阿森纳",
  "Chelsea": "切尔西",
  "Tottenham": "热刺",
  "Tottenham Hotspur": "热刺",
  "Newcastle": "纽卡斯尔",
  "Newcastle United": "纽卡斯尔",
  "Aston Villa": "阿斯顿维拉",
  "West Ham": "西汉姆",
  "West Ham United": "西汉姆",
  "Brighton": "布莱顿",
  "Brighton & Hove Albion": "布莱顿",
  "Wolverhampton": "狼队",
  "Wolves": "狼队",
  "Wolverhampton Wanderers": "狼队",
  "Crystal Palace": "水晶宫",
  "Fulham": "富勒姆",
  "Brentford": "布伦特福德",
  "Everton": "埃弗顿",
  "Nottingham Forest": "诺丁汉森林",
  "Bournemouth": "伯恩茅斯",
  "AFC Bournemouth": "伯恩茅斯",
  "Luton": "卢顿",
  "Luton Town": "卢顿",
  "Burnley": "伯恩利",
  "Sheffield United": "谢菲尔德联",
  "Leicester": "莱斯特城",
  "Leicester City": "莱斯特城",
  "Leeds": "利兹联",
  "Leeds United": "利兹联",
  "Southampton": "南安普顿",
  "Ipswich": "伊普斯维奇",
  "Ipswich Town": "伊普斯维奇",

  // ========== 西甲 ==========
  "Real Madrid": "皇家马德里",
  "Barcelona": "巴塞罗那",
  "Atletico Madrid": "马德里竞技",
  "Atlético Madrid": "马德里竞技",
  "Sevilla": "塞维利亚",
  "Real Sociedad": "皇家社会",
  "Real Betis": "皇家贝蒂斯",
  "Villarreal": "比利亚雷亚尔",
  "Athletic Bilbao": "毕尔巴鄂竞技",
  "Athletic Club": "毕尔巴鄂竞技",
  "Valencia": "瓦伦西亚",
  "Osasuna": "奥萨苏纳",
  "Celta Vigo": "塞尔塔",
  "Celta de Vigo": "塞尔塔",
  "Getafe": "赫塔费",
  "Rayo Vallecano": "巴列卡诺",
  "Girona": "赫罗纳",
  "Mallorca": "马略卡",
  "RCD Mallorca": "马略卡",
  "Almeria": "阿尔梅里亚",
  "UD Almería": "阿尔梅里亚",
  "Las Palmas": "拉斯帕尔马斯",
  "Alaves": "阿拉维斯",
  "Deportivo Alavés": "阿拉维斯",
  "Granada": "格拉纳达",
  "Cadiz": "加的斯",
  "Cádiz": "加的斯",
  "Espanyol": "西班牙人",
  "RCD Espanyol": "西班牙人",
  "Leganes": "莱加内斯",
  "Valladolid": "巴拉多利德",
  "Real Valladolid": "巴拉多利德",

  // ========== 意甲 ==========
  "Juventus": "尤文图斯",
  "Inter": "国际米兰",
  "Inter Milan": "国际米兰",
  "Internazionale": "国际米兰",
  "AC Milan": "AC米兰",
  "Milan": "AC米兰",
  "Napoli": "那不勒斯",
  "Roma": "罗马",
  "AS Roma": "罗马",
  "Lazio": "拉齐奥",
  "SS Lazio": "拉齐奥",
  "Atalanta": "亚特兰大",
  "Fiorentina": "佛罗伦萨",
  "ACF Fiorentina": "佛罗伦萨",
  "Bologna": "博洛尼亚",
  "Torino": "都灵",
  "Monza": "蒙扎",
  "AC Monza": "蒙扎",
  "Udinese": "乌迪内斯",
  "Sassuolo": "萨索洛",
  "Empoli": "恩波利",
  "Lecce": "莱切",
  "US Lecce": "莱切",
  "Cagliari": "卡利亚里",
  "Genoa": "热那亚",
  "Verona": "维罗纳",
  "Hellas Verona": "维罗纳",
  "Frosinone": "弗罗西诺内",
  "Salernitana": "萨勒尼塔纳",
  "Spezia": "斯佩齐亚",
  "Sampdoria": "桑普多利亚",
  "Parma": "帕尔马",
  "Venezia": "威尼斯",
  "Como": "科莫",

  // ========== 德甲 ==========
  "Bayern Munich": "拜仁慕尼黑",
  "Bayern": "拜仁慕尼黑",
  "FC Bayern München": "拜仁慕尼黑",
  "Borussia Dortmund": "多特蒙德",
  "Dortmund": "多特蒙德",
  "BVB": "多特蒙德",
  "RB Leipzig": "RB莱比锡",
  "Leipzig": "RB莱比锡",
  "Bayer Leverkusen": "勒沃库森",
  "Leverkusen": "勒沃库森",
  "Eintracht Frankfurt": "法兰克福",
  "Frankfurt": "法兰克福",
  "Union Berlin": "柏林联合",
  "1. FC Union Berlin": "柏林联合",
  "Wolfsburg": "沃尔夫斯堡",
  "VfL Wolfsburg": "沃尔夫斯堡",
  "Borussia Monchengladbach": "门兴格拉德巴赫",
  "Borussia M'gladbach": "门兴格拉德巴赫",
  "Gladbach": "门兴格拉德巴赫",
  "Freiburg": "弗赖堡",
  "SC Freiburg": "弗赖堡",
  "Hoffenheim": "霍芬海姆",
  "TSG Hoffenheim": "霍芬海姆",
  "Mainz": "美因茨",
  "Mainz 05": "美因茨",
  "FC Koln": "科隆",
  "1. FC Köln": "科隆",
  "Cologne": "科隆",
  "Augsburg": "奥格斯堡",
  "FC Augsburg": "奥格斯堡",
  "Werder Bremen": "不莱梅",
  "Bremen": "不莱梅",
  "VfB Stuttgart": "斯图加特",
  "Stuttgart": "斯图加特",
  "Bochum": "波鸿",
  "VfL Bochum": "波鸿",
  "Heidenheim": "海登海姆",
  "1. FC Heidenheim": "海登海姆",
  "Darmstadt": "达姆施塔特",
  "SV Darmstadt 98": "达姆施塔特",
  "Hertha Berlin": "柏林赫塔",
  "Hertha BSC": "柏林赫塔",
  "Schalke": "沙尔克04",
  "Schalke 04": "沙尔克04",
  "Hamburg": "汉堡",
  "Hamburger SV": "汉堡",
  "Holstein Kiel": "基尔",
  "St. Pauli": "圣保利",
  "FC St. Pauli": "圣保利",

  // ========== 法甲 ==========
  "Paris Saint Germain": "巴黎圣日耳曼",
  "Paris Saint-Germain": "巴黎圣日耳曼",
  "PSG": "巴黎圣日耳曼",
  "Marseille": "马赛",
  "Olympique Marseille": "马赛",
  "Lyon": "里昂",
  "Olympique Lyon": "里昂",
  "Olympique Lyonnais": "里昂",
  "Monaco": "摩纳哥",
  "AS Monaco": "摩纳哥",
  "Lille": "里尔",
  "LOSC Lille": "里尔",
  "Nice": "尼斯",
  "OGC Nice": "尼斯",
  "Rennes": "雷恩",
  "Stade Rennais": "雷恩",
  "Lens": "朗斯",
  "RC Lens": "朗斯",
  "Strasbourg": "斯特拉斯堡",
  "RC Strasbourg": "斯特拉斯堡",
  "Nantes": "南特",
  "FC Nantes": "南特",
  "Montpellier": "蒙彼利埃",
  "Montpellier HSC": "蒙彼利埃",
  "Reims": "兰斯",
  "Stade de Reims": "兰斯",
  "Toulouse": "图卢兹",
  "Toulouse FC": "图卢兹",
  "Brest": "布雷斯特",
  "Stade Brestois": "布雷斯特",
  "Lorient": "洛里昂",
  "FC Lorient": "洛里昂",
  "Clermont": "克莱蒙",
  "Clermont Foot": "克莱蒙",
  "Metz": "梅斯",
  "FC Metz": "梅斯",
  "Le Havre": "勒阿弗尔",
  "Le Havre AC": "勒阿弗尔",
  "Auxerre": "欧塞尔",
  "AJ Auxerre": "欧塞尔",
  "Angers": "昂热",
  "Angers SCO": "昂热",
  "Saint-Etienne": "圣艾蒂安",
  "AS Saint-Étienne": "圣艾蒂安",

  // ========== 荷甲 ==========
  "Ajax": "阿贾克斯",
  "AFC Ajax": "阿贾克斯",
  "PSV": "埃因霍温",
  "PSV Eindhoven": "埃因霍温",
  "Feyenoord": "费耶诺德",
  "AZ": "阿尔克马尔",
  "AZ Alkmaar": "阿尔克马尔",
  "FC Twente": "特温特",
  "Twente": "特温特",
  "FC Utrecht": "乌得勒支",
  "Utrecht": "乌得勒支",

  // ========== 葡超 ==========
  "Benfica": "本菲卡",
  "SL Benfica": "本菲卡",
  "Porto": "波尔图",
  "FC Porto": "波尔图",
  "Sporting CP": "葡萄牙体育",
  "Sporting Lisbon": "葡萄牙体育",
  "Sporting": "葡萄牙体育",
  "Braga": "布拉加",
  "SC Braga": "布拉加",

  // ========== 其他欧洲 ==========
  "Celtic": "凯尔特人",
  "Rangers": "流浪者",
  "Glasgow Rangers": "流浪者",
  "Galatasaray": "加拉塔萨雷",
  "Fenerbahce": "费内巴切",
  "Fenerbahçe": "费内巴切",
  "Besiktas": "贝西克塔斯",
  "Beşiktaş": "贝西克塔斯",
  "Club Brugge": "布鲁日",
  "Anderlecht": "安德莱赫特",
  "RSC Anderlecht": "安德莱赫特",
  "Red Bull Salzburg": "萨尔茨堡红牛",
  "Salzburg": "萨尔茨堡红牛",
  "Shakhtar Donetsk": "顿涅茨克矿工",
  "Shakhtar": "顿涅茨克矿工",
  "Dynamo Kyiv": "基辅迪纳摩",
  "Dinamo Zagreb": "萨格勒布迪纳摩",
  "Olympiacos": "奥林匹亚科斯",
  "PAOK": "塞萨洛尼基",
  "Sparta Prague": "布拉格斯巴达",
  "Slavia Prague": "布拉格斯拉维亚",
  "Young Boys": "伯尔尼年轻人",
  "BSC Young Boys": "伯尔尼年轻人",
  "FC Basel": "巴塞尔",
  "Basel": "巴塞尔",
  "Copenhagen": "哥本哈根",
  "FC Copenhagen": "哥本哈根",
  "Malmo": "马尔默",
  "Malmö FF": "马尔默",

  // ========== 亚洲 ==========
  // 中超
  "Shanghai Port": "上海海港",
  "Shanghai SIPG": "上海海港",
  "Shandong Taishan": "山东泰山",
  "Beijing Guoan": "北京国安",
  "Guangzhou FC": "广州队",
  "Guangzhou Evergrande": "广州恒大",
  "Wuhan Three Towns": "武汉三镇",
  "Chengdu Rongcheng": "成都蓉城",
  "Zhejiang FC": "浙江队",
  "Tianjin Jinmen Tiger": "天津津门虎",
  "Changchun Yatai": "长春亚泰",
  "Henan Songshan Longmen": "河南嵩山龙门",
  "Dalian Pro": "大连人",
  "Shenzhen FC": "深圳队",

  // 日职
  "Vissel Kobe": "神户胜利船",
  "Yokohama F. Marinos": "横滨水手",
  "Yokohama F Marinos": "横滨水手",
  "Kawasaki Frontale": "川崎前锋",
  "Urawa Red Diamonds": "浦和红钻",
  "Urawa Reds": "浦和红钻",
  "Kashima Antlers": "�的岛鹿角",
  "FC Tokyo": "东京FC",
  "Cerezo Osaka": "大阪樱花",
  "Gamba Osaka": "大阪钢巴",
  "Nagoya Grampus": "名古屋鲸八",
  "Sanfrecce Hiroshima": "广岛三箭",
  "Kashiwa Reysol": "柏太阳神",
  "Sagan Tosu": "�的栖砂岩",

  // 韩K
  "Jeonbuk Hyundai Motors": "全北现代",
  "Jeonbuk Motors": "全北现代",
  "Ulsan Hyundai": "蔚山现代",
  "Ulsan HD": "蔚山现代",
  "FC Seoul": "首尔FC",
  "Pohang Steelers": "浦项制铁",
  "Suwon Samsung Bluewings": "水原三星",
  "Suwon Bluewings": "水原三星",
  "Daegu FC": "大邱FC",
  "Incheon United": "仁川联",
  "Gangwon FC": "江原FC",

  // 沙特
  "Al-Hilal": "利雅得新月",
  "Al Hilal": "利雅得新月",
  "Al-Nassr": "利雅得胜利",
  "Al Nassr": "利雅得胜利",
  "Al-Ittihad": "吉达联合",
  "Al Ittihad": "吉达联合",
  "Al-Ahli": "吉达国民",
  "Al Ahli": "吉达国民",

  // ========== 南美 ==========
  "Flamengo": "弗拉门戈",
  "Palmeiras": "帕尔梅拉斯",
  "Corinthians": "科林蒂安",
  "Sao Paulo": "圣保罗",
  "São Paulo": "圣保罗",
  "Santos": "桑托斯",
  "Fluminense": "弗鲁米嫩塞",
  "Gremio": "格雷米奥",
  "Grêmio": "格雷米奥",
  "Internacional": "国际体育",
  "Atletico Mineiro": "米内罗竞技",
  "Atlético Mineiro": "米内罗竞技",
  "Botafogo": "博塔弗戈",
  "Boca Juniors": "博卡青年",
  "River Plate": "河床",
  "Racing Club": "竞技俱乐部",
  "Independiente": "独立队",
  "San Lorenzo": "圣洛伦索",

  // ========== 北美 ==========
  "LA Galaxy": "洛杉矶银河",
  "Los Angeles Galaxy": "洛杉矶银河",
  "LAFC": "洛杉矶FC",
  "Los Angeles FC": "洛杉矶FC",
  "Inter Miami": "迈阿密国际",
  "Inter Miami CF": "迈阿密国际",
  "New York Red Bulls": "纽约红牛",
  "NY Red Bulls": "纽约红牛",
  "Seattle Sounders": "西雅图海湾人",
  "Atlanta United": "亚特兰大联",
  "Club America": "墨西哥美洲",
  "Club América": "墨西哥美洲",
  "Guadalajara": "瓜达拉哈拉",
  "Chivas": "瓜达拉哈拉",
  "Cruz Azul": "蓝十字",
  "UNAM": "美洲狮",
  "Pumas UNAM": "美洲狮",
  "Tigres UANL": "老虎队",
  "Tigres": "老虎队",
  "Monterrey": "蒙特雷",
  "CF Monterrey": "蒙特雷",
};

// ============================================
// 国家映射表
// ============================================
export const COUNTRY_MAP: Record<string, string> = {
  // 欧洲
  "England": "英格兰",
  "Spain": "西班牙",
  "Italy": "意大利",
  "Germany": "德国",
  "France": "法国",
  "Netherlands": "荷兰",
  "Portugal": "葡萄牙",
  "Belgium": "比利时",
  "Scotland": "苏格兰",
  "Turkey": "土耳其",
  "Russia": "俄罗斯",
  "Ukraine": "乌克兰",
  "Greece": "希腊",
  "Switzerland": "瑞士",
  "Austria": "奥地利",
  "Czech Republic": "捷克",
  "Czech-Republic": "捷克",
  "Poland": "波兰",
  "Croatia": "克罗地亚",
  "Serbia": "塞尔维亚",
  "Denmark": "丹麦",
  "Sweden": "瑞典",
  "Norway": "挪威",
  "Finland": "芬兰",
  "Romania": "罗马尼亚",
  "Hungary": "匈牙利",
  "Bulgaria": "保加利亚",
  "Slovakia": "斯洛伐克",
  "Slovenia": "斯洛文尼亚",
  "Ireland": "爱尔兰",
  "Wales": "威尔士",
  "Northern Ireland": "北爱尔兰",
  "Iceland": "冰岛",
  "Cyprus": "塞浦路斯",
  "Israel": "以色列",
  "Belarus": "白俄罗斯",
  "Kazakhstan": "哈萨克斯坦",
  "Azerbaijan": "阿塞拜疆",
  "Georgia": "格鲁吉亚",
  "Armenia": "亚美尼亚",
  "Moldova": "摩尔多瓦",
  "Bosnia": "波黑",
  "Bosnia and Herzegovina": "波黑",
  "Montenegro": "黑山",
  "North Macedonia": "北马其顿",
  "Albania": "阿尔巴尼亚",
  "Luxembourg": "卢森堡",
  "Malta": "马耳他",
  "Liechtenstein": "列支敦士登",
  "Andorra": "安道尔",
  "San Marino": "圣马力诺",
  "Faroe Islands": "法罗群岛",
  "Gibraltar": "直布罗陀",
  "Kosovo": "科索沃",
  "Estonia": "爱沙尼亚",
  "Latvia": "拉脱维亚",
  "Lithuania": "立陶宛",

  // 亚洲
  "China": "中国",
  "Japan": "日本",
  "South Korea": "韩国",
  "South-Korea": "韩国",
  "Korea Republic": "韩国",
  "Saudi Arabia": "沙特阿拉伯",
  "Saudi-Arabia": "沙特阿拉伯",
  "UAE": "阿联酋",
  "United Arab Emirates": "阿联酋",
  "Qatar": "卡塔尔",
  "Iran": "伊朗",
  "Iraq": "伊拉克",
  "Australia": "澳大利亚",
  "Thailand": "泰国",
  "Vietnam": "越南",
  "Indonesia": "印度尼西亚",
  "Malaysia": "马来西亚",
  "Singapore": "新加坡",
  "India": "印度",
  "Uzbekistan": "乌兹别克斯坦",
  "Jordan": "约旦",
  "Oman": "阿曼",
  "Bahrain": "巴林",
  "Kuwait": "科威特",
  "Lebanon": "黎巴嫩",
  "Syria": "叙利亚",
  "Palestine": "巴勒斯坦",
  "Hong Kong": "中国香港",
  "Taiwan": "中国台湾",
  "Macau": "中国澳门",
  "Philippines": "菲律宾",
  "Myanmar": "缅甸",
  "Cambodia": "柬埔寨",
  "Laos": "老挝",

  // 北美/南美
  "USA": "美国",
  "United States": "美国",
  "United-States": "美国",
  "Mexico": "墨西哥",
  "Canada": "加拿大",
  "Brazil": "巴西",
  "Argentina": "阿根廷",
  "Colombia": "哥伦比亚",
  "Chile": "智利",
  "Peru": "秘鲁",
  "Ecuador": "厄瓜多尔",
  "Uruguay": "乌拉圭",
  "Venezuela": "委内瑞拉",
  "Paraguay": "巴拉圭",
  "Bolivia": "玻利维亚",
  "Costa Rica": "哥斯达黎加",
  "Panama": "巴拿马",
  "Honduras": "洪都拉斯",
  "Jamaica": "牙买加",
  "Trinidad and Tobago": "特立尼达和多巴哥",
  "El Salvador": "萨尔瓦多",
  "Guatemala": "危地马拉",
  "Cuba": "古巴",

  // 非洲
  "Egypt": "埃及",
  "Morocco": "摩洛哥",
  "Nigeria": "尼日利亚",
  "South Africa": "南非",
  "South-Africa": "南非",
  "Senegal": "塞内加尔",
  "Algeria": "阿尔及利亚",
  "Tunisia": "突尼斯",
  "Ghana": "加纳",
  "Cameroon": "喀麦隆",
  "Ivory Coast": "科特迪瓦",
  "Cote D'Ivoire": "科特迪瓦",
  "DR Congo": "刚果(金)",
  "Mali": "马里",
  "Burkina Faso": "布基纳法索",
  "Guinea": "几内亚",
  "Kenya": "肯尼亚",
  "Uganda": "乌干达",
  "Tanzania": "坦桑尼亚",
  "Zimbabwe": "津巴布韦",
  "Zambia": "赞比亚",
  "Ethiopia": "埃塞俄比亚",
  "Madagascar": "马达加斯加",
  "Angola": "安哥拉",
  "Mozambique": "莫桑比克",

  // 大洋洲
  "New Zealand": "新西兰",
  "New-Zealand": "新西兰",

  // 国际
  "World": "世界",
  "Europe": "欧洲",
  "Asia": "亚洲",
  "Africa": "非洲",
  "South America": "南美洲",
  "North America": "北美洲",
  "CONCACAF": "中北美及加勒比",
  "CONMEBOL": "南美足联",
  "UEFA": "欧足联",
  "AFC": "亚足联",
  "CAF": "非洲足联",
  "OFC": "大洋洲足联",
};

// ============================================
// 翻译函数
// ============================================

// 内存缓存
const cache = new Map<string, string>();

/**
 * 翻译名称（通用函数）
 * @param name 原始名称
 * @param type 类型：team | league | country
 * @returns 中文名称（如果有映射）或原始名称
 */
export function t(
  name: string | null | undefined,
  type: 'team' | 'league' | 'country' = 'team'
): string {
  if (!name) return '';

  // 查缓存
  const cacheKey = `${type}:${name}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 查映射表
  let result: string;
  switch (type) {
    case 'league':
      result = LEAGUE_MAP[name] ?? name;
      break;
    case 'country':
      result = COUNTRY_MAP[name] ?? name;
      break;
    case 'team':
    default:
      result = TEAM_MAP[name] ?? name;
      break;
  }

  // 存入缓存
  cache.set(cacheKey, result);
  return result;
}

/**
 * 翻译球队名
 */
export function tTeam(name: string | null | undefined): string {
  return t(name, 'team');
}

/**
 * 翻译联赛名
 */
export function tLeague(name: string | null | undefined): string {
  return t(name, 'league');
}

/**
 * 翻译国家名
 */
export function tCountry(name: string | null | undefined): string {
  return t(name, 'country');
}

/**
 * 批量翻译比赛数据
 */
export function translateMatch<T extends {
  home_team?: string;
  away_team?: string;
  league_name?: string;
  country?: string;
}>(match: T): T & {
  home_team_zh: string;
  away_team_zh: string;
  league_name_zh: string;
  country_zh: string;
} {
  return {
    ...match,
    home_team_zh: tTeam(match.home_team),
    away_team_zh: tTeam(match.away_team),
    league_name_zh: tLeague(match.league_name),
    country_zh: tCountry(match.country),
  };
}

/**
 * 批量翻译多场比赛
 */
export function translateMatches<T extends {
  home_team?: string;
  away_team?: string;
  league_name?: string;
  country?: string;
}>(matches: T[]): Array<T & {
  home_team_zh: string;
  away_team_zh: string;
  league_name_zh: string;
  country_zh: string;
}> {
  return matches.map(translateMatch);
}

/**
 * 检查是否有中文翻译
 */
export function hasTranslation(name: string, type: 'team' | 'league' | 'country' = 'team'): boolean {
  switch (type) {
    case 'league':
      return name in LEAGUE_MAP;
    case 'country':
      return name in COUNTRY_MAP;
    case 'team':
    default:
      return name in TEAM_MAP;
  }
}

/**
 * 获取映射表统计
 */
export function getTranslationStats(): {
  teams: number;
  leagues: number;
  countries: number;
  total: number;
} {
  return {
    teams: Object.keys(TEAM_MAP).length,
    leagues: Object.keys(LEAGUE_MAP).length,
    countries: Object.keys(COUNTRY_MAP).length,
    total: Object.keys(TEAM_MAP).length + Object.keys(LEAGUE_MAP).length + Object.keys(COUNTRY_MAP).length,
  };
}

/**
 * 添加自定义翻译（运行时）
 */
export function addTranslation(
  name: string,
  translation: string,
  type: 'team' | 'league' | 'country' = 'team'
): void {
  switch (type) {
    case 'league':
      LEAGUE_MAP[name] = translation;
      break;
    case 'country':
      COUNTRY_MAP[name] = translation;
      break;
    case 'team':
    default:
      TEAM_MAP[name] = translation;
      break;
  }
  // 清除缓存
  cache.delete(`${type}:${name}`);
}

// 导出映射表供外部使用
export { LEAGUE_MAP as leagueMap, TEAM_MAP as teamMap, COUNTRY_MAP as countryMap };
