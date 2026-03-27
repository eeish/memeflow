import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OhlcvCandle, OhlcvInterval } from '../../lib/api';
import { Card } from '../ui-simple/Card';

const INTERVALS: OhlcvInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const INTERVAL_LABELS: Record<OhlcvInterval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
};

const PAD_L = 56;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 32;
const CANDLE_GAP = 0.2;
const CHART_H = 240;
const VOL_H = 32;

// Compact format for Y-axis labels (scientific notation OK at tiny scale)
function formatPriceTick(v: number): string {
  if (v === 0) return '0';
  if (v < 0.00001) return v.toExponential(2);
  if (v < 0.001) return v.toFixed(6);
  if (v < 1) return v.toFixed(4);
  if (v < 100) return v.toFixed(3);
  return v.toFixed(2);
}

// Human-readable format for the header price — never uses scientific notation
function formatHeaderPrice(v: number): string {
  if (v === 0) return '0';
  if (v < 0.00001) return v.toFixed(8); // e.g. 0.00000462
  if (v < 0.001) return v.toFixed(6);
  if (v < 1) return v.toFixed(4);
  if (v < 100) return v.toFixed(3);
  return v.toFixed(2);
}

function formatTimeLabel(ms: number, interval: OhlcvInterval): string {
  const d = new Date(ms);
  if (interval === '1d') {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

interface TooltipInfo {
  x: number;
  y: number;
  candle: OhlcvCandle;
}

function IntervalSelector({
  interval,
  onIntervalChange,
}: {
  interval: OhlcvInterval;
  onIntervalChange: (i: OhlcvInterval) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md border border-gray-200 p-0.5">
      {INTERVALS.map((iv) => (
        <button
          key={iv}
          onClick={() => onIntervalChange(iv)}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
            interval === iv
              ? 'bg-gray-900 text-white'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          {INTERVAL_LABELS[iv]}
        </button>
      ))}
    </div>
  );
}

interface CandlestickChartProps {
  candles: OhlcvCandle[];
  interval: OhlcvInterval;
  onIntervalChange: (i: OhlcvInterval) => void;
  isLoading?: boolean;
  symbol?: string;
}

export function CandlestickChart({
  candles,
  interval,
  onIntervalChange,
  isLoading = false,
  symbol = 'TOKEN',
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  // Always observe the container so width is correct regardless of candle state
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = containerWidth || 600; // fallback until ResizeObserver fires
  const innerW = width - PAD_L - PAD_R;
  const innerH = CHART_H - PAD_T - PAD_B;

  const maxCandles = Math.max(10, Math.floor(innerW / 6));
  const visible = candles.slice(-maxCandles);

  const { minPrice, maxPrice, yTicks } = useMemo(() => {
    if (visible.length === 0) return { minPrice: 0, maxPrice: 1, yTicks: [] };
    const allPrices = visible.flatMap((c) => [c.low, c.high]);
    const rawMin = Math.min(...allPrices);
    const rawMax = Math.max(...allPrices);
    const pad = (rawMax - rawMin) * 0.08 || rawMax * 0.08 || 0.0001;
    const minP = Math.max(0, rawMin - pad); // prices can never be negative
    const maxP = rawMax + pad;
    const step = (maxP - minP) / 4;
    const ticks = Array.from({ length: 5 }, (_, i) => minP + i * step);
    return { minPrice: minP, maxPrice: maxP, yTicks: ticks };
  }, [visible]);

  const toY = useCallback(
    (price: number) => PAD_T + innerH - ((price - minPrice) / (maxPrice - minPrice || 1)) * innerH,
    [minPrice, maxPrice, innerH],
  );

  const slotWidth = visible.length > 0 ? innerW / visible.length : innerW;
  // Cap body width so candles don't become absurdly wide when only a few are visible
  const candleW = Math.max(2, Math.min(20, slotWidth * (1 - CANDLE_GAP)));

  const toX = useCallback(
    (i: number) => PAD_L + i * slotWidth + slotWidth / 2,
    [slotWidth],
  );

  const timeTickStep = Math.max(1, Math.floor(visible.length / 5));
  const timeTickIndices = visible
    .map((_, i) => i)
    .filter((i) => i % timeTickStep === 0 || i === visible.length - 1);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const idx = Math.round((mx - PAD_L) / slotWidth - 0.5);
    if (idx >= 0 && idx < visible.length) {
      setTooltip({
        x: toX(idx),
        y: toY((visible[idx].high + visible[idx].low) / 2),
        candle: visible[idx],
      });
    } else {
      setTooltip(null);
    }
  };

  const lastCandle = visible[visible.length - 1];
  // Show the current bar's own change (close vs open of the last candle).
  // This matches TradingView-style header behaviour and avoids misleading
  // "-100.00%" when the full window spans a large historical drawdown.
  const priceChange = lastCandle
    ? ((lastCandle.close - lastCandle.open) / (lastCandle.open || 1)) * 100
    : 0;
  const priceUp = !lastCandle || lastCandle.close >= lastCandle.open;

  const maxVol = visible.length > 0 ? Math.max(...visible.map((c) => c.volume_sui), 0.000001) : 1;

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          {visible.length > 0 ? (
            <>
              <span className="text-xl font-semibold text-gray-900">
                {formatHeaderPrice(lastCandle.close)} SUI
              </span>
              <span
                className={`ml-2 text-xs font-medium ${priceChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
              >
                {priceChange >= 0 ? '+' : ''}
                {priceChange.toFixed(2)}%
              </span>
              <div className="mt-0.5 text-[11px] text-gray-400">${symbol} · Phase 2</div>
            </>
          ) : (
            <h3 className="text-sm font-semibold text-gray-700">Price Chart</h3>
          )}
        </div>
        <IntervalSelector interval={interval} onIntervalChange={onIntervalChange} />
      </div>

      {/* Container div always in DOM so ResizeObserver always has a target */}
      <div ref={containerRef} className="w-full">
        {visible.length === 0 ? (
          <div
            className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50"
            style={{ height: CHART_H }}
          >
            <p className="text-xs text-gray-400">
              {isLoading
                ? 'Loading chart…'
                : 'No trades yet — chart will appear after first swap'}
            </p>
          </div>
        ) : (
          <>
            <svg
              width={width}
              height={CHART_H}
              className="overflow-visible"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Grid lines */}
              {yTicks.map((tick, i) => (
                <line
                  key={i}
                  x1={PAD_L}
                  x2={width - PAD_R}
                  y1={toY(tick)}
                  y2={toY(tick)}
                  stroke="#f0f0f0"
                  strokeWidth={1}
                />
              ))}

              {/* Y-axis labels */}
              {yTicks.map((tick, i) => (
                <text
                  key={i}
                  x={PAD_L - 4}
                  y={toY(tick) + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="#9ca3af"
                >
                  {formatPriceTick(tick)}
                </text>
              ))}

              {/* Candles */}
              {visible.map((c, i) => {
                const x = toX(i);
                const openY = toY(c.open);
                const closeY = toY(c.close);
                const highY = toY(c.high);
                const lowY = toY(c.low);
                const isGreen = c.close >= c.open;
                const color = isGreen ? '#10b981' : '#ef4444';
                const bodyTop = Math.min(openY, closeY);
                const bodyH = Math.max(1, Math.abs(closeY - openY));
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth={1} />
                    <rect
                      x={x - candleW / 2}
                      y={bodyTop}
                      width={candleW}
                      height={bodyH}
                      fill={color}
                      fillOpacity={0.85}
                      rx={1}
                    />
                  </g>
                );
              })}

              {/* Current price line */}
              <line
                x1={PAD_L}
                x2={width - PAD_R}
                y1={toY(lastCandle.close)}
                y2={toY(lastCandle.close)}
                stroke={priceUp ? '#10b981' : '#ef4444'}
                strokeWidth={1}
                strokeDasharray="3 2"
                opacity={0.6}
              />

              {/* Time axis labels */}
              {timeTickIndices.map((i) => (
                <text
                  key={i}
                  x={toX(i)}
                  y={CHART_H - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#9ca3af"
                >
                  {formatTimeLabel(visible[i].time_ms, interval)}
                </text>
              ))}

              {/* Tooltip crosshair */}
              {tooltip && (
                <g>
                  <line
                    x1={tooltip.x}
                    x2={tooltip.x}
                    y1={PAD_T}
                    y2={CHART_H - PAD_B}
                    stroke="#9ca3af"
                    strokeWidth={1}
                    strokeDasharray="3 2"
                  />
                  <TooltipBox tooltip={tooltip} width={width} />
                </g>
              )}
            </svg>

            {/* Volume bars */}
            <svg width={width} height={VOL_H + 4} className="mt-1">
              {visible.map((c, i) => {
                const x = toX(i);
                const barH = Math.max(1, (c.volume_sui / maxVol) * VOL_H);
                const isGreen = c.close >= c.open;
                return (
                  <rect
                    key={i}
                    x={x - candleW / 2}
                    y={VOL_H - barH}
                    width={candleW}
                    height={barH}
                    fill={isGreen ? '#10b981' : '#ef4444'}
                    fillOpacity={0.35}
                    rx={1}
                  />
                );
              })}
            </svg>
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <span>Vol</span>
              <span className="font-mono">{lastCandle.volume_sui.toFixed(3)} SUI</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function TooltipBox({ tooltip, width }: { tooltip: TooltipInfo; width: number }) {
  const c = tooltip.candle;
  const isGreen = c.close >= c.open;
  const lines = [
    `O: ${formatPriceTick(c.open)}`,
    `H: ${formatPriceTick(c.high)}`,
    `L: ${formatPriceTick(c.low)}`,
    `C: ${formatPriceTick(c.close)}`,
    `Vol: ${c.volume_sui.toFixed(3)} SUI`,
  ];
  const BOX_W = 110;
  const BOX_H = lines.length * 14 + 10;
  const tooltipX = tooltip.x + BOX_W + PAD_R > width ? tooltip.x - BOX_W - 8 : tooltip.x + 8;
  const tooltipY = Math.max(4, tooltip.y - BOX_H / 2);
  return (
    <g>
      <rect
        x={tooltipX}
        y={tooltipY}
        width={BOX_W}
        height={BOX_H}
        rx={4}
        fill="white"
        stroke="#e5e7eb"
        strokeWidth={1}
        filter="drop-shadow(0 1px 3px rgba(0,0,0,0.08))"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={tooltipX + 8}
          y={tooltipY + 16 + i * 14}
          fontSize={10}
          fill={i === 3 ? (isGreen ? '#10b981' : '#ef4444') : '#374151'}
          fontFamily="monospace"
        >
          {line}
        </text>
      ))}
    </g>
  );
}
