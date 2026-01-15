import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

interface PriceChartProps {
  data: { time: string; value: number }[];
}

export function PriceChart({ data }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: '#666',
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      rightPriceScale: {
        borderColor: '#e0e0e0',
      },
      timeScale: {
        borderColor: '#e0e0e0',
        timeVisible: true,
      },
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#111',
      topColor: 'rgba(17, 17, 17, 0.1)',
      bottomColor: 'rgba(17, 17, 17, 0.01)',
      lineWidth: 2,
    });

    areaSeries.setData(data);

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);

  return <div ref={chartContainerRef} className="w-full" />;
}