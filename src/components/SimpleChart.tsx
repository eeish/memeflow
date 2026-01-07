interface SimpleChartProps {
  data: { time: string; value: number }[];
}

export function SimpleChart({ data }: SimpleChartProps) {
  if (data.length === 0) return null;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const width = 100;
  const height = 60;
  const padding = 4;

  // Create SVG path
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((d.value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(' L ')}`;

  // Create area path
  const areaData = `${pathData} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

  return (
    <div className="w-full h-[300px] bg-white rounded flex items-center justify-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Area fill */}
        <path
          d={areaData}
          fill="rgba(17, 17, 17, 0.05)"
          stroke="none"
        />

        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke="#111"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
