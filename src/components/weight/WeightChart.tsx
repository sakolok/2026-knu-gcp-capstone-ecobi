type WeightChartProps = {
  points: Array<{ date: string; weightKg: number }>;
};

export function WeightChart({ points }: WeightChartProps) {
  if (points.length === 0) {
    return <div className="chart-empty">체중 기록이 없습니다</div>;
  }

  const min = Math.min(...points.map((point) => point.weightKg)) - 0.4;
  const max = Math.max(...points.map((point) => point.weightKg)) + 0.4;
  const height = 150;
  const width = 340;
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * (width - 36) + 18;
    const y = height - ((point.weightKg - min) / (max - min || 1)) * (height - 34) - 17;
    return { ...point, x, y };
  });
  const linePoints = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="weight-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="체중 변화 그래프">
        <path className="chart-grid" d={`M 18 ${height - 18} H ${width - 18}`} />
        <polyline className="chart-path" points={linePoints} />
        {coordinates.map((point, index) => (
          <g key={`${point.date}-${point.weightKg}-${index}`}>
            <circle cx={point.x} cy={point.y} r="4.5" />
            <text x={point.x} y={point.y - 10} textAnchor="middle">
              {point.weightKg.toFixed(1)}
            </text>
            <text className="date-label" x={point.x} y={height - 3} textAnchor="middle">
              {point.date.slice(5).replace("-", ".")}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
