// ============================================
// 筛选器预设服务 - 保存和加载筛选条件
// ============================================

import type { FilterType, SortType, ScenarioType } from '../components/home/FilterBar';

// 筛选器预设接口
export interface FilterPreset {
  id: string;
  name: string;
  icon?: string;           // 可选图标（emoji）
  createdAt: number;       // 创建时间戳
  isDefault?: boolean;     // 是否为默认预设
  filters: {
    activeFilter: FilterType;
    sortBy: SortType;
    showOver70Only: boolean;
    activeScenario: ScenarioType;
    searchQuery?: string;
  };
}

// 预设颜色（用于UI展示）
export const PRESET_COLORS = [
  { name: 'cyan', bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/50' },
  { name: 'orange', bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
  { name: 'green', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' },
  { name: 'purple', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' },
  { name: 'pink', bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/50' },
  { name: 'yellow', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50' },
];

// 预设图标选项
export const PRESET_ICONS = ['⚡', '🎯', '🔥', '⭐', '💎', '🚀', '📊', '🎲', '⚽', '🏆'];

// 默认预设（系统内置）
export const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: 'preset-strong-late',
    name: '强队落后 70+',
    icon: '🔥',
    createdAt: 0,
    isDefault: true,
    filters: {
      activeFilter: 'live',
      sortBy: 'score',
      showOver70Only: true,
      activeScenario: 'strong_behind',
    },
  },
  {
    id: 'preset-corner-alert',
    name: '角球密集',
    icon: '🚩',
    createdAt: 0,
    isDefault: true,
    filters: {
      activeFilter: 'live',
      sortBy: 'score',
      showOver70Only: false,
      activeScenario: 'dense_corners',
    },
  },
  {
    id: 'preset-high-score',
    name: '高评分优先',
    icon: '⭐',
    createdAt: 0,
    isDefault: true,
    filters: {
      activeFilter: 'live',
      sortBy: 'score',
      showOver70Only: false,
      activeScenario: null,
    },
  },
];

// 存储键
const STORAGE_KEY = 'ftt_filter_presets';
const ACTIVE_PRESET_KEY = 'ftt_active_preset';

// 筛选器预设服务类
class FilterPresetsService {
  private presets: FilterPreset[] = [];
  private activePresetId: string | null = null;

  constructor() {
    this.loadPresets();
  }

  // 获取所有预设（包括默认预设）
  getAllPresets(): FilterPreset[] {
    return [...DEFAULT_PRESETS, ...this.presets];
  }

  // 获取用户自定义预设
  getUserPresets(): FilterPreset[] {
    return this.presets;
  }

  // 获取当前激活的预设ID
  getActivePresetId(): string | null {
    return this.activePresetId;
  }

  // 设置激活的预设
  setActivePreset(presetId: string | null): void {
    this.activePresetId = presetId;
    try {
      if (presetId) {
        localStorage.setItem(ACTIVE_PRESET_KEY, presetId);
      } else {
        localStorage.removeItem(ACTIVE_PRESET_KEY);
      }
    } catch (error) {
      console.warn('保存激活预设失败:', error);
    }
  }

  // 根据ID获取预设
  getPresetById(id: string): FilterPreset | undefined {
    return this.getAllPresets().find(p => p.id === id);
  }

  // 创建新预设
  createPreset(
    name: string,
    filters: FilterPreset['filters'],
    icon?: string
  ): FilterPreset {
    const preset: FilterPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      icon: icon || PRESET_ICONS[Math.floor(Math.random() * PRESET_ICONS.length)],
      createdAt: Date.now(),
      isDefault: false,
      filters,
    };

    this.presets.push(preset);
    this.savePresets();
    return preset;
  }

  // 更新预设
  updatePreset(id: string, updates: Partial<Omit<FilterPreset, 'id' | 'createdAt' | 'isDefault'>>): boolean {
    const index = this.presets.findIndex(p => p.id === id);
    if (index === -1) return false;

    this.presets[index] = { ...this.presets[index], ...updates };
    this.savePresets();
    return true;
  }

  // 删除预设
  deletePreset(id: string): boolean {
    const index = this.presets.findIndex(p => p.id === id);
    if (index === -1) return false;

    this.presets.splice(index, 1);

    // 如果删除的是当前激活的预设，清除激活状态
    if (this.activePresetId === id) {
      this.activePresetId = null;
      localStorage.removeItem(ACTIVE_PRESET_KEY);
    }

    this.savePresets();
    return true;
  }

  // 重命名预设
  renamePreset(id: string, newName: string): boolean {
    return this.updatePreset(id, { name: newName });
  }

  // 更新预设图标
  updatePresetIcon(id: string, icon: string): boolean {
    return this.updatePreset(id, { icon });
  }

  // 保存预设到 localStorage
  private savePresets(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.presets));
    } catch (error) {
      console.warn('保存筛选预设失败:', error);
    }
  }

  // 从 localStorage 加载预设
  private loadPresets(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.presets = JSON.parse(saved);
      }

      const activeId = localStorage.getItem(ACTIVE_PRESET_KEY);
      if (activeId) {
        this.activePresetId = activeId;
      }
    } catch (error) {
      console.warn('加载筛选预设失败:', error);
      this.presets = [];
    }
  }

  // 导出所有预设
  exportPresets(): string {
    return JSON.stringify(this.presets, null, 2);
  }

  // 导入预设
  importPresets(jsonString: string): { success: boolean; count: number; error?: string } {
    try {
      const imported = JSON.parse(jsonString) as FilterPreset[];

      if (!Array.isArray(imported)) {
        return { success: false, count: 0, error: '无效的预设格式' };
      }

      let count = 0;
      for (const preset of imported) {
        if (preset.name && preset.filters) {
          // 生成新ID避免冲突
          const newPreset: FilterPreset = {
            ...preset,
            id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: Date.now(),
            isDefault: false,
          };
          this.presets.push(newPreset);
          count++;
        }
      }

      this.savePresets();
      return { success: true, count };
    } catch (error) {
      return { success: false, count: 0, error: '解析预设数据失败' };
    }
  }

  // 清除所有用户预设
  clearAllPresets(): void {
    this.presets = [];
    this.activePresetId = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_PRESET_KEY);
  }
}

// 导出单例
export const filterPresetsService = new FilterPresetsService();

// 便捷方法
export const getAllFilterPresets = () => filterPresetsService.getAllPresets();
export const getUserFilterPresets = () => filterPresetsService.getUserPresets();
export const getActivePresetId = () => filterPresetsService.getActivePresetId();
export const setActivePreset = (id: string | null) => filterPresetsService.setActivePreset(id);
export const getPresetById = (id: string) => filterPresetsService.getPresetById(id);
export const createFilterPreset = (name: string, filters: FilterPreset['filters'], icon?: string) =>
  filterPresetsService.createPreset(name, filters, icon);
export const deleteFilterPreset = (id: string) => filterPresetsService.deletePreset(id);
export const renameFilterPreset = (id: string, name: string) => filterPresetsService.renamePreset(id, name);
