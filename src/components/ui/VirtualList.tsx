/**
 * ============================================
 * 虚拟列表组件 - 基于 @tanstack/react-virtual
 * 用于高效渲染大量数据列表
 * ============================================
 */

import { useRef, type ReactNode, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualListProps<T> {
  /** 数据列表 */
  items: T[];
  /** 每项的预估高度 */
  estimateSize: number;
  /** 渲染每一项的函数 */
  renderItem: (item: T, index: number) => ReactNode;
  /** 容器高度 */
  height: number | string;
  /** 容器类名 */
  className?: string;
  /** 列表项之间的间距 */
  gap?: number;
  /** 过度扫描数量（预渲染可视区域外的项数） */
  overscan?: number;
  /** 空列表时显示的内容 */
  emptyContent?: ReactNode;
  /** 获取每项的唯一key */
  getItemKey?: (item: T, index: number) => string | number;
}

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  height,
  className = '',
  gap = 0,
  overscan = 5,
  emptyContent,
  getItemKey,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
    getItemKey: getItemKey ? (index) => getItemKey(items[index], index) : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (items.length === 0 && emptyContent) {
    return (
      <div
        className={className}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        {emptyContent}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto scrollbar-hide ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size - gap}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 虚拟表格组件 - 用于表格行的虚拟化
 */
interface VirtualTableProps<T> {
  /** 数据列表 */
  items: T[];
  /** 每行的预估高度 */
  rowHeight: number;
  /** 渲染表头 */
  renderHeader: () => ReactNode;
  /** 渲染每一行 */
  renderRow: (item: T, index: number) => ReactNode;
  /** 容器高度 */
  height: number | string;
  /** 表格最小宽度 */
  minWidth?: number;
  /** 容器类名 */
  className?: string;
  /** 过度扫描数量 */
  overscan?: number;
  /** 空列表时显示的内容 */
  emptyContent?: ReactNode;
  /** 获取每项的唯一key */
  getItemKey?: (item: T, index: number) => string | number;
}

export function VirtualTable<T>({
  items,
  rowHeight,
  renderHeader,
  renderRow,
  height,
  minWidth,
  className = '',
  overscan = 5,
  emptyContent,
  getItemKey,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: getItemKey ? (index) => getItemKey(items[index], index) : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (items.length === 0 && emptyContent) {
    return (
      <div className={className}>
        {emptyContent}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto scrollbar-hide ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <table
        className="w-full border-collapse"
        style={{ minWidth: minWidth ? `${minWidth}px` : undefined }}
      >
        <thead className="sticky top-0 z-10 bg-bg-deepest">
          {renderHeader()}
        </thead>
        <tbody>
          {/* 占位行 - 用于撑开滚动区域 */}
          <tr style={{ height: `${virtualizer.getTotalSize()}px`, display: 'block' }}>
            <td style={{ padding: 0, border: 'none' }} />
          </tr>
        </tbody>
      </table>

      {/* 虚拟化的行 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          minWidth: minWidth ? `${minWidth}px` : undefined,
        }}
      >
        <table
          className="w-full border-collapse"
          style={{ minWidth: minWidth ? `${minWidth}px` : undefined }}
        >
          <thead className="sticky top-0 z-10 bg-bg-deepest">
            {renderHeader()}
          </thead>
          <tbody>
            {virtualItems.map((virtualItem) => {
              const item = items[virtualItem.index];
              return (
                <tr
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${rowHeight}px`,
                    transform: `translateY(${virtualItem.start + 40}px)`, // 40px for header
                    display: 'table',
                    tableLayout: 'fixed',
                  }}
                >
                  {renderRow(item, virtualItem.index)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 虚拟网格组件 - 用于卡片网格的虚拟化
 */
interface VirtualGridProps<T> {
  /** 数据列表 */
  items: T[];
  /** 列数 */
  columns: number;
  /** 每行的预估高度 */
  rowHeight: number;
  /** 渲染每一项 */
  renderItem: (item: T, index: number) => ReactNode;
  /** 容器高度 */
  height: number | string;
  /** 容器类名 */
  className?: string;
  /** 项目间距 */
  gap?: number;
  /** 过度扫描数量 */
  overscan?: number;
  /** 空列表时显示的内容 */
  emptyContent?: ReactNode;
  /** 获取每项的唯一key */
  getItemKey?: (item: T, index: number) => string | number;
}

export function VirtualGrid<T>({
  items,
  columns,
  rowHeight,
  renderItem,
  height,
  className = '',
  gap = 16,
  overscan = 3,
  emptyContent,
  getItemKey,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // 计算行数
  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  if (items.length === 0 && emptyContent) {
    return (
      <div
        className={className}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        {emptyContent}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto scrollbar-hide ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowItems = items.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${rowHeight}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: `${gap}px`,
              }}
            >
              {rowItems.map((item, colIndex) => {
                const actualIndex = startIndex + colIndex;
                const key = getItemKey ? getItemKey(item, actualIndex) : actualIndex;
                return (
                  <div key={key}>
                    {renderItem(item, actualIndex)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
