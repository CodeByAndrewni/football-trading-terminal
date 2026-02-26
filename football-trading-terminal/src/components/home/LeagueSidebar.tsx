// ============================================
// 联赛侧边栏 - 按地区分类
// ============================================

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, Globe } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';

interface LeagueSidebarProps {
  matches: AdvancedMatch[];
  selectedLeague: string | null;
  onSelectLeague: (league: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface LeagueGroup {
  name: string;
  leagues: { id: number; name: string; liveCount: number }[];
}

// 联赛分类映射
const LEAGUE_REGIONS: Record<string, string> = {
  // 欧洲
  '英超': 'europe', '西甲': 'europe', '德甲': 'europe', '意甲': 'europe', '法甲': 'europe',
  '欧冠': 'europe', '欧联': 'europe', '欧协联': 'europe', '葡超': 'europe', '荷甲': 'europe',
  '比甲': 'europe', '苏超': 'europe', '俄超': 'europe', '土超': 'europe', '乌超': 'europe',
  '英冠': 'europe', '英甲': 'europe', '英乙': 'europe', '西乙': 'europe', '德乙': 'europe',
  '意乙': 'europe', '法乙': 'europe', '瑞士超': 'europe', '奥甲': 'europe', '丹超': 'europe',
  '挪超': 'europe', '瑞典超': 'europe', '芬超': 'europe', '波甲': 'europe', '捷甲': 'europe',
  'Championship': 'europe', 'Premier League': 'europe', 'La Liga': 'europe',
  'Bundesliga': 'europe', 'Serie A': 'europe', 'Ligue 1': 'europe',

  // 南美
  '巴甲': 'south_america', '阿甲': 'south_america', '智甲': 'south_america',
  '哥甲': 'south_america', '秘甲': 'south_america', '厄甲': 'south_america',
  '乌拉甲': 'south_america', '巴拉甲': 'south_america', '委内超': 'south_america',
  'CONMEBOL Libertadores': 'south_america', 'Copa Libertadores': 'south_america',
  'CONMEBOL Sudamericana': 'south_america', 'Copa Do Brasil': 'south_america',
  'Liga Profesional Argentina': 'south_america', 'Primera B': 'south_america',
  'Liga Nacional': 'south_america',

  // 北美/中美
  '美职': 'north_america', '墨超': 'north_america', '加超': 'north_america',
  'MLS': 'north_america', 'Liga MX': 'north_america',
  'CONCACAF': 'north_america', 'CONCACAF U20': 'north_america',
  'CONCACAF Champions': 'north_america',

  // 亚洲
  '中超': 'asia', '日职': 'asia', 'J联赛': 'asia', 'K联赛': 'asia',
  '澳超': 'asia', '沙特联': 'asia', '阿联酋联': 'asia', '卡塔尔联': 'asia',
  '伊朗超': 'asia', '泰超': 'asia', '越南联': 'asia', '印尼超': 'asia',
  'AFC Champions': 'asia', '亚冠': 'asia',

  // 非洲
  '埃及超': 'africa', '南非超': 'africa', '摩洛哥甲': 'africa',
  'CAF Champions': 'africa', '非冠': 'africa',
};

// 根据联赛名称猜测地区
function guessRegion(leagueName: string): string {
  // 检查是否包含关键词
  if (leagueName.includes('CONMEBOL') || leagueName.includes('Libertadores') ||
      leagueName.includes('Sudamericana') || leagueName.includes('Argentina') ||
      leagueName.includes('Brasil') || leagueName.includes('Chile') ||
      leagueName.includes('Colombia') || leagueName.includes('Peru') ||
      leagueName.includes('Ecuador') || leagueName.includes('Uruguay') ||
      leagueName.includes('Paraguay') || leagueName.includes('Venezuela') ||
      leagueName.includes('Bolivia') || leagueName.includes('Primera B')) {
    return 'south_america';
  }
  if (leagueName.includes('CONCACAF') || leagueName.includes('MLS') ||
      leagueName.includes('Mexico') || leagueName.includes('USA') ||
      leagueName.includes('Canada') || leagueName.includes('Caribbean')) {
    return 'north_america';
  }
  if (leagueName.includes('AFC') || leagueName.includes('Japan') ||
      leagueName.includes('Korea') || leagueName.includes('China') ||
      leagueName.includes('Saudi') || leagueName.includes('Australia')) {
    return 'asia';
  }
  if (leagueName.includes('CAF') || leagueName.includes('Africa') ||
      leagueName.includes('Egypt') || leagueName.includes('Morocco')) {
    return 'africa';
  }
  // 默认其他
  return 'other';
}

const REGION_NAMES: Record<string, string> = {
  europe: '欧洲',
  south_america: '南美',
  north_america: '北美/中美',
  asia: '亚洲',
  africa: '非洲',
  other: '其他',
};

export function LeagueSidebar({
  matches,
  selectedLeague,
  onSelectLeague,
  collapsed = false,
  onToggleCollapse,
}: LeagueSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['europe', 'south_america', 'north_america']);

  // 按地区分组联赛
  const groupedLeagues = useMemo(() => {
    const leagueCounts = new Map<string, number>();
    for (const match of matches) {
      leagueCounts.set(match.league, (leagueCounts.get(match.league) || 0) + 1);
    }

    const groups: Record<string, { name: string; liveCount: number }[]> = {
      europe: [],
      south_america: [],
      north_america: [],
      asia: [],
      africa: [],
      other: [],
    };

    leagueCounts.forEach((count, leagueName) => {
      const region = LEAGUE_REGIONS[leagueName] || guessRegion(leagueName);
      groups[region].push({
        name: leagueName,
        liveCount: count,
      });
    });

    // 按比赛数量排序
    for (const region in groups) {
      groups[region].sort((a, b) => b.liveCount - a.liveCount);
    }

    return groups;
  }, [matches]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  // 折叠状态
  if (collapsed) {
    return (
      <div className="hidden lg:flex w-12 bg-[#0d0d0d] border-r border-[#222] flex-col items-center py-4">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-lg text-[#666] hover:text-[#00d4ff] hover:bg-[#1a1a1a] transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  const totalMatches = matches.length;

  return (
    <div className="hidden lg:flex w-52 bg-[#0d0d0d] border-r border-[#222] flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b border-[#222]">
        <span className="text-sm font-medium text-[#888]">联赛目录</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1 rounded text-[#666] hover:text-[#00d4ff] hover:bg-[#1a1a1a] transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 全部联赛 */}
      <div className="p-2">
        <button
          type="button"
          onClick={() => onSelectLeague('ALL')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            selectedLeague === 'ALL' || !selectedLeague
              ? 'bg-[#00d4ff]/20 text-[#00d4ff]'
              : 'text-[#888] hover:bg-[#1a1a1a] hover:text-white'
          }`}
        >
          <span>全部联赛</span>
          <span className="text-[#00d4ff] font-bold">{totalMatches}</span>
        </button>
      </div>

      {/* 分组列表 */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {Object.entries(groupedLeagues).map(([region, leagues]) => {
          if (leagues.length === 0) return null;

          const isExpanded = expandedGroups.includes(region);
          const regionName = REGION_NAMES[region];
          const totalInRegion = leagues.reduce((sum, l) => sum + l.liveCount, 0);

          return (
            <div key={region}>
              {/* 地区标题 */}
              <button
                type="button"
                onClick={() => toggleGroup(region)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-[#666] hover:text-[#888] transition-all"
              >
                <div className="flex items-center gap-1">
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="font-medium">{regionName}</span>
                </div>
                <span className="text-[#555]">{totalInRegion}</span>
              </button>

              {/* 联赛列表 */}
              {isExpanded && (
                <div className="ml-2 space-y-0.5">
                  {leagues.map(league => (
                    <button
                      key={league.name}
                      type="button"
                      onClick={() => onSelectLeague(league.name)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-all ${
                        selectedLeague === league.name
                          ? 'bg-[#00d4ff]/10 text-[#00d4ff]'
                          : 'text-[#888] hover:bg-[#1a1a1a] hover:text-white'
                      }`}
                    >
                      <span className="truncate">{league.name}</span>
                      <span className="text-[#00d4ff] text-xs font-medium ml-2">{league.liveCount}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default LeagueSidebar;
