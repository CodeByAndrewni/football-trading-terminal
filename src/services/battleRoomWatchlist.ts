// ============================================
// BattleRoom Watchlist 服务（最简版手动添加）
// - 使用 localStorage + 内存缓存
// - 仅按 fixture id（number）记录
// ============================================

const STORAGE_KEY = 'battleRoomWatchlist';

let cachedIds: Set<number> | null = null;

function loadFromStorage(): Set<number> {
  if (cachedIds) return cachedIds;

  if (typeof window === 'undefined') {
    cachedIds = new Set();
    return cachedIds;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedIds = new Set();
      return cachedIds;
    }
    const parsed = JSON.parse(raw) as number[] | unknown;
    if (Array.isArray(parsed)) {
      cachedIds = new Set(parsed.filter((id) => typeof id === 'number'));
    } else {
      cachedIds = new Set();
    }
  } catch {
    cachedIds = new Set();
  }

  return cachedIds!;
}

function saveToStorage(ids: Set<number>) {
  cachedIds = ids;
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(ids);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // 忽略存储错误，避免影响主流程
  }
}

export function getWatchlist(): number[] {
  return Array.from(loadFromStorage());
}

export function isInWatchlist(id: number): boolean {
  return loadFromStorage().has(id);
}

export function addToWatchlist(id: number): void {
  const ids = loadFromStorage();
  if (!ids.has(id)) {
    ids.add(id);
    saveToStorage(ids);
  }
}

export function removeFromWatchlist(id: number): void {
  const ids = loadFromStorage();
  if (ids.has(id)) {
    ids.delete(id);
    saveToStorage(ids);
  }
}

