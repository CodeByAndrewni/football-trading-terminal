// ============================================
// Sparkline 迷你折线图组件
// ============================================

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDot?: boolean;
}

export function Sparkline({
  data,
  width = 60,
  height = 20,
  color = '#00d4ff',
  showDot = true
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const lastValue = data[data.length - 1];
  const lastX = width;
  const lastY = height - ((lastValue - min) / range) * height;

  // 根据最后一个值决定颜色
  const getColor = () => {
    if (lastValue >= 70) return '#ff4444';
    if (lastValue >= 50) return '#ffaa00';
    return color;
  };

  const lineColor = getColor();

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* 背景网格线 */}
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#30363d" strokeWidth="0.5" strokeDasharray="2" />

      {/* 折线 */}
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drop-shadow-sm"
      />

      {/* 最后一个点 */}
      {showDot && (
        <circle
          cx={lastX}
          cy={lastY}
          r="2.5"
          fill={lineColor}
          className="animate-pulse"
        />
      )}
    </svg>
  );
}
