import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { ArrowLeft, TrendingDown, TrendingUp, Users } from '../ui-simple/Icons';
import { Button } from '../ui-simple/Button';
import { Card } from '../ui-simple/Card';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useShareMarket, calculatePriceMist, formatMistToSui } from '../../hooks/useShareMarket';
import { apiService } from '../../lib/api';
import { GRADUATION_THRESHOLD, MAX_SUPPLY, graduationProgressPercent } from '../../lib/graduation';
import type { TradePageContext } from '../../types/trade';

type OrderSide = 'buy' | 'sell';

interface BondingPoint {
  slot: number; // 1-indexed holder position
  priceSui: number;
  filled: boolean; // already purchased
}

interface ResolvedHolder {
  rank: number;
  username: string;
  address: string;
}

interface MarketSnapshot {
  objectId: string;
  holders: number;
  holderList: ResolvedHolder[];
  isLoading: boolean;
}

interface TradePageProps {
  market: TradePageContext;
  onClose: () => void;
}

// Avatar palette — consistent colours for gradient fallback avatars
const AVATAR_GRADIENTS = [
  'from-purple-400 to-pink-400',
  'from-cyan-400 to-blue-500',
  'from-emerald-400 to-teal-500',
  'from-orange-400 to-red-400',
  'from-yellow-400 to-orange-500',
  'from-indigo-400 to-violet-500',
  'from-rose-400 to-pink-500',
  'from-lime-400 to-green-500',
];

const MIST_PER_SUI = 1_000_000_000;

function mistToSui(mist: bigint): number {
  return Number(mist) / MIST_PER_SUI;
}

function normalizeSymbol(symbol: string): string {
  return symbol.replace('$', '').trim().toUpperCase() || 'TOKEN';
}

function formatSui(value: number): string {
  if (value < 0.0001) return '<0.0001';
  if (value < 1) return value.toFixed(4);
  if (value < 100) return value.toFixed(3);
  return value.toFixed(2);
}

function holderTier(rank: number): { label: string; className: string } {
  if (rank <= 3) return { label: 'Early', className: 'bg-amber-100 text-amber-700' };
  if (rank <= 10) return { label: 'Supporter', className: 'bg-blue-100 text-blue-700' };
  return { label: 'Holder', className: 'bg-gray-100 text-gray-600' };
}

/** Build the bonding curve data points for all holder slots 1..MAX_SUPPLY */
function buildBondingCurve(currentHolders: number): BondingPoint[] {
  return Array.from({ length: MAX_SUPPLY }, (_, i) => {
    const slot = i + 1;
    return {
      slot,
      priceSui: mistToSui(calculatePriceMist(slot)),
      filled: slot <= currentHolders,
    };
  });
}

// ─── Bonding Curve Chart ──────────────────────────────────────────────────────

function BondingCurveChart({
  points,
  currentHolders,
}: {
  points: BondingPoint[];
  currentHolders: number;
}) {
  if (points.length === 0) return null;

  const prices = points.map((p) => p.priceSui);
  const minP = Math.min(...prices) * 0.94;
  const maxP = Math.max(...prices) * 1.06;
  const W = 900;
  const H = 180;

  const toX = (slot: number) => ((slot - 1) / Math.max(points.length - 1, 1)) * W;
  const toY = (price: number) => H - ((price - minP) / (maxP - minP || 1)) * H;

  // Split into filled and upcoming segments
  const filledPts = points.filter((p) => p.filled);
  const allPts = points;

  const fullLine = allPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.slot)} ${toY(p.priceSui)}`)
    .join(' ');

  const areaPath =
    allPts.length > 0
      ? `${fullLine} L ${toX(allPts[allPts.length - 1].slot)} ${H} L ${toX(1)} ${H} Z`
      : '';

  const filledLine =
    filledPts.length > 1
      ? filledPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.slot)} ${toY(p.priceSui)}`).join(' ')
      : null;

  // Current price = next buyer's price (slot = holders + 1), or last slot if full
  const nextSlot = Math.min(currentHolders + 1, MAX_SUPPLY);
  const currentPriceSui = mistToSui(calculatePriceMist(nextSlot));

  // Marker position
  const markerX = toX(currentHolders > 0 ? currentHolders : 0.5);
  const markerY = currentHolders > 0 ? toY(mistToSui(calculatePriceMist(currentHolders))) : H;

  return (
    <Card className="p-4">
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatSui(currentPriceSui)} SUI
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {currentHolders >= MAX_SUPPLY ? 'Market full · next buyer price' : `Slot ${nextSlot} price`}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 px-2.5 py-1 rounded bg-gray-100">
          <span className="font-medium">Bonding Curve</span>
          <span className="text-gray-400">·</span>
          <span>{currentHolders}/{MAX_SUPPLY} filled</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[140px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bc-area-upcoming" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bc-area-filled" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Full curve — lighter background */}
        <path d={areaPath} fill="url(#bc-area-upcoming)" />
        <path d={fullLine} stroke="#c4b5fd" strokeWidth="1.5" fill="none" strokeDasharray="4 3" />

        {/* Filled segment — solid green */}
        {filledLine && (
          <>
            <path d={filledLine} stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
          </>
        )}

        {/* Current position marker */}
        {currentHolders > 0 && (
          <>
            <line x1={markerX} y1={0} x2={markerX} y2={H} stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={markerX} cy={markerY} r="5" fill="#10b981" />
            <circle cx={markerX} cy={markerY} r="8" fill="#10b981" fillOpacity="0.2" />
          </>
        )}
      </svg>

      <div className="mt-2 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-emerald-500 rounded" />
          Purchased
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 border-t border-dashed border-violet-300" />
          Available
        </span>
      </div>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TradePage({ market: initialMarket, onClose }: TradePageProps) {
  const client = useSuiClient();
  const { findMarketByOwner } = useShareMarket();
  const [activeMarket, setActiveMarket] = useState<TradePageContext>(initialMarket);
  const symbol = useMemo(() => normalizeSymbol(activeMarket.tokenSymbol), [activeMarket.tokenSymbol]);

  const [orderSide, setOrderSide] = useState<OrderSide>('buy');
  const [amountInput, setAmountInput] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const { holdings, totalValueMist, isLoading: portfolioLoading } = usePortfolio();

  // ── Real market snapshot ────────────────────────────────────────────────────
  const [snapshot, setSnapshot] = useState<MarketSnapshot>({
    objectId: '',
    holders: 0,
    holderList: [],
    isLoading: false,
  });

  const cancelRef = useRef(false);

  useEffect(() => {
    const creatorAddress = activeMarket.creatorAddress;
    if (!creatorAddress) {
      setSnapshot({ objectId: '', holders: 0, holderList: [], isLoading: false });
      return;
    }

    cancelRef.current = false;
    setSnapshot({ objectId: '', holders: 0, holderList: [], isLoading: true });

    (async () => {
      try {
        // 1. Locate the market on-chain
        const info = await findMarketByOwner(creatorAddress);
        if (cancelRef.current || !info) {
          if (!cancelRef.current) setSnapshot({ objectId: '', holders: 0, holderList: [], isLoading: false });
          return;
        }

        // 2. Fetch holder_list from object content
        const obj = await client.getObject({ id: info.objectId, options: { showContent: true } });
        if (cancelRef.current) return;

        const rawList: string[] = (obj.data?.content as any)?.fields?.holder_list ?? [];

        // 3. Resolve each address to a username
        const resolved = await Promise.all(
          rawList.map(async (addr, idx): Promise<ResolvedHolder> => {
            const fallback = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
            try {
              const resp = await apiService.getUserByAddress(addr);
              const username = resp.success && resp.data ? resp.data.username : fallback;
              return { rank: idx + 1, username, address: addr };
            } catch {
              return { rank: idx + 1, username: fallback, address: addr };
            }
          })
        );

        if (!cancelRef.current) {
          setSnapshot({ objectId: info.objectId, holders: info.holders, holderList: resolved, isLoading: false });
        }
      } catch {
        if (!cancelRef.current) {
          setSnapshot((prev) => ({ ...prev, isLoading: false }));
        }
      }
    })();

    return () => {
      cancelRef.current = true;
    };
  }, [activeMarket.creatorAddress, findMarketByOwner, client]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const bondingPoints = useMemo(() => buildBondingCurve(snapshot.holders), [snapshot.holders]);
  const nextSlot = Math.min(snapshot.holders + 1, MAX_SUPPLY);
  const nextPriceMist = calculatePriceMist(nextSlot);
  const progress = graduationProgressPercent(snapshot.holders);

  // ── Portfolio switching ─────────────────────────────────────────────────────
  const handleSwitchMarket = (holding: (typeof holdings)[number]) => {
    setActiveMarket({
      tokenSymbol: holding.creator.token_symbol || holding.creator.username,
      tokenName: holding.creator.username,
      username: holding.creator.username,
      creatorAddress: holding.creatorAddress,
      source: 'profile',
    });
    setAmountInput('');
    setFeedback(null);
  };

  const handleSubmit = () => {
    const parsed = Number(amountInput);
    if (!parsed || parsed <= 0) {
      setFeedback({ kind: 'error', text: 'Enter a valid SUI amount.' });
      return;
    }
    setFeedback({ kind: 'success', text: `${orderSide === 'buy' ? 'Buy' : 'Sell'} order placed (mock).` });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-gray-100 flex-shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>

          {/* Creator identity */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">
                {activeMarket.username ? `@${activeMarket.username}` : `$${symbol}`}
              </div>
              <div className="text-xs text-gray-500">${symbol}</div>
            </div>
          </div>

          {/* Graduation progress */}
          <div className="flex-shrink-0 text-right">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 justify-end">
              <Users className="h-3.5 w-3.5" />
              <span>
                {snapshot.isLoading ? '…' : snapshot.holders}/{GRADUATION_THRESHOLD}
              </span>
            </div>
            <div className="mt-1 w-28 h-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          {/* Left column: bonding curve chart + top holders */}
          <section className="space-y-4">
            <BondingCurveChart points={bondingPoints} currentHolders={snapshot.holders} />

            {/* Top Holders — real on-chain data */}
            <Card className="p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Top Holders</h3>

              {snapshot.isLoading ? (
                <div className="py-6 text-center text-xs text-gray-400">Loading holders…</div>
              ) : snapshot.holderList.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">
                  {activeMarket.creatorAddress ? 'No holders found.' : 'Open from a creator profile to see holders.'}
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {snapshot.holderList.map((holder) => {
                    const tier = holderTier(holder.rank);
                    const gradientIdx = holder.address
                      .split('')
                      .reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length;
                    return (
                      <div key={holder.address} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="text-xs text-gray-400 w-5 text-right tabular-nums">
                          {holder.rank}
                        </span>
                        <div
                          className={`w-7 h-7 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[gradientIdx]} flex-shrink-0`}
                        />
                        <span className="text-sm text-gray-800 flex-1 truncate">
                          @{holder.username}
                        </span>
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${tier.className}`}
                        >
                          {tier.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </section>

          {/* Right column: trade action + portfolio */}
          <aside className="space-y-4">
            {/* Trade action panel */}
            <Card className="p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                Trade ${symbol}
              </h3>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <Button
                  size="sm"
                  onClick={() => setOrderSide('buy')}
                  className={
                    orderSide === 'buy'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                >
                  Buy
                </Button>
                <Button
                  size="sm"
                  onClick={() => setOrderSide('sell')}
                  className={
                    orderSide === 'sell'
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                >
                  Sell
                </Button>
              </div>

              {/* Next price (real bonding curve) */}
              <div className="mb-3 flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">
                  {orderSide === 'buy' ? 'Buy price' : 'Sell price'}
                </span>
                <span className="font-mono font-medium text-gray-900">
                  {snapshot.isLoading ? '…' : `${formatMistToSui(nextPriceMist)} SUI`}
                </span>
              </div>

              <label className="block text-xs font-medium text-gray-600 mb-3">
                Amount (SUI)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-cyan-200 focus:ring"
                />
              </label>

              <Button
                onClick={handleSubmit}
                className={
                  orderSide === 'buy'
                    ? 'w-full bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'w-full bg-red-600 text-white hover:bg-red-700'
                }
              >
                {orderSide === 'buy' ? `Buy $${symbol}` : `Sell $${symbol}`}
              </Button>

              {feedback && (
                <div
                  className={`mt-2 rounded-md px-3 py-2 text-xs font-medium ${
                    feedback.kind === 'success'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {feedback.text}
                </div>
              )}
            </Card>

            {/* Portfolio — switch between holdings */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Your Portfolio</h3>
                {!portfolioLoading && holdings.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {formatMistToSui(totalValueMist)} SUI
                  </span>
                )}
              </div>

              {portfolioLoading ? (
                <div className="py-6 text-center text-xs text-gray-400">Loading…</div>
              ) : holdings.length === 0 ? (
                <p className="rounded-md border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-500">
                  No holdings yet.
                  <br />
                  Discover creators in the Plaza.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {holdings.map((holding, i) => {
                    const isActive = holding.creator.username === activeMarket.username;
                    const pnlPositive = holding.pnlPercent >= 0;
                    const gradientIdx = i % AVATAR_GRADIENTS.length;

                    return (
                      <button
                        key={holding.marketId}
                        onClick={() => handleSwitchMarket(holding)}
                        className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors ${
                          isActive ? 'bg-gray-100 ring-1 ring-gray-200' : 'hover:bg-gray-50'
                        }`}
                      >
                        {holding.creator.avatar_url ? (
                          <img
                            src={holding.creator.avatar_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className={`w-8 h-8 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[gradientIdx]} flex-shrink-0`}
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            @{holding.creator.username}
                          </div>
                          <div className="text-xs text-gray-400">
                            {holding.isGraduated
                              ? `$${holding.creator.token_symbol}`
                              : `${holding.holders} holders`}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-medium text-gray-700">
                            {formatMistToSui(holding.currentValueMist)} SUI
                          </div>
                          <div className={`text-xs ${pnlPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                            {pnlPositive ? '+' : ''}
                            {holding.pnlPercent.toFixed(1)}%
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
