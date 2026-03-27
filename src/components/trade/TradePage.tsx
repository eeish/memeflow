import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { ArrowLeft, ChevronDown, Users } from '../ui-simple/Icons';
import { Button } from '../ui-simple/Button';
import { Card } from '../ui-simple/Card';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useShareMarket, calculatePriceMist, formatMistToSui } from '../../hooks/useShareMarket';
import { formatMistAmount, formatTokenAmount, useAmmPool } from '../../hooks/useAmmPool';
import { useContractAddresses } from '../../hooks/useContractsSocial';
import { apiService } from '../../lib/api';
import { useOhlcv } from '../../hooks/useOhlcv';
import { CandlestickChart } from './CandlestickChart';
import {
  GRADUATION_THRESHOLD,
  MAX_SUPPLY,
  graduationProgressPercent,
  resolveGraduationVaultMetadata,
} from '../../lib/graduation';
import type { TradePageContext } from '../../types/trade';

interface BondingPoint {
  slot: number;
  priceSui: number;
  filled: boolean;
}

interface ResolvedHolder {
  rank: number;
  username: string;
  address: string;
}

interface MarketSnapshot {
  objectId: string;
  packageId: string;
  holders: number;
  holderList: ResolvedHolder[];
  isGraduated: boolean;
  isLoading: boolean;
}

interface TradePageProps {
  market: TradePageContext;
  onClose: () => void;
}

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
const TOKEN_SCALAR = 1_000_000_000;

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

function formatAssetAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 0.0001) return '<0.0001';
  if (value < 1) return value.toFixed(4);
  if (value < 1_000) return value.toFixed(3);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function parseDecimalAmount(raw: string, decimals = 9): bigint {
  const normalized = raw.trim();
  if (!normalized) return 0n;
  const [wholePart, fractionPart = ''] = normalized.split('.');
  const whole = wholePart.replace(/[^\d]/g, '');
  const fraction = fractionPart.replace(/[^\d]/g, '').slice(0, decimals);
  if (!whole && !fraction) return 0n;
  const paddedFraction = fraction.padEnd(decimals, '0');
  const combined = `${whole || '0'}${paddedFraction}`;
  return BigInt(combined);
}

function holderTier(rank: number): { label: string; className: string } {
  if (rank <= 3) return { label: 'Early', className: 'bg-amber-100 text-amber-700' };
  if (rank <= 10) return { label: 'Supporter', className: 'bg-blue-100 text-blue-700' };
  return { label: 'Holder', className: 'bg-gray-100 text-gray-600' };
}

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

function BondingCurveChart({
  points,
  currentHolders,
}: {
  points: BondingPoint[];
  currentHolders: number;
}) {
  if (points.length === 0) return null;

  const prices = points.map((point) => point.priceSui);
  const minP = Math.min(...prices) * 0.94;
  const maxP = Math.max(...prices) * 1.06;
  const width = 900;
  const height = 180;

  const toX = (slot: number) => ((slot - 1) / Math.max(points.length - 1, 1)) * width;
  const toY = (price: number) => height - ((price - minP) / (maxP - minP || 1)) * height;

  const filledPoints = points.filter((point) => point.filled);
  const fullLine = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(point.slot)} ${toY(point.priceSui)}`)
    .join(' ');

  const areaPath = points.length > 0
    ? `${fullLine} L ${toX(points[points.length - 1].slot)} ${height} L ${toX(1)} ${height} Z`
    : '';

  const filledLine = filledPoints.length > 1
    ? filledPoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(point.slot)} ${toY(point.priceSui)}`)
        .join(' ')
    : null;

  const nextSlot = Math.min(currentHolders + 1, MAX_SUPPLY);
  const currentPriceSui = mistToSui(calculatePriceMist(nextSlot));
  const markerX = toX(currentHolders > 0 ? currentHolders : 0.5);
  const markerY = currentHolders > 0 ? toY(mistToSui(calculatePriceMist(currentHolders))) : height;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatSui(currentPriceSui)} SUI
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {currentHolders >= MAX_SUPPLY ? 'Market full · next buyer price' : `Slot ${nextSlot} price`}
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
          <span className="font-medium">Bonding Curve</span>
          <span className="text-gray-400">·</span>
          <span>{currentHolders}/{MAX_SUPPLY} filled</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-[140px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bc-area-upcoming" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#bc-area-upcoming)" />
        <path d={fullLine} stroke="#c4b5fd" strokeWidth="1.5" fill="none" strokeDasharray="4 3" />

        {filledLine && (
          <path d={filledLine} stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
        )}

        {currentHolders > 0 && (
          <>
            <line x1={markerX} y1={0} x2={markerX} y2={height} stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={markerX} cy={markerY} r="5" fill="#10b981" />
            <circle cx={markerX} cy={markerY} r="8" fill="#10b981" fillOpacity="0.2" />
          </>
        )}
      </svg>

      <div className="mt-2 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded bg-emerald-500" />
          Purchased
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 border-t border-dashed border-violet-300" />
          Available
        </span>
      </div>
    </Card>
  );
}

function ShareTradePanel({
  symbol,
  snapshot,
  onTradeComplete,
}: {
  symbol: string;
  snapshot: MarketSnapshot;
  onTradeComplete: () => void;
}) {
  const account = useCurrentAccount();
  const { buyShare, sellShare } = useShareMarket();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const isHolder = !snapshot.isLoading &&
    !!account?.address &&
    snapshot.holderList.some((holder) => holder.address === account.address);

  const marketFull = snapshot.holders >= MAX_SUPPLY;
  const buyPriceMist = calculatePriceMist(Math.min(snapshot.holders + 1, MAX_SUPPLY));
  const sellPriceMist = snapshot.holders > 0 ? calculatePriceMist(snapshot.holders) : 0n;

  const handleBuy = async () => {
    if (!snapshot.objectId) return;
    setIsSubmitting(true);
    setFeedback(null);

    const result = await buyShare(snapshot.objectId, snapshot.holders, snapshot.packageId);
    if (result.success) {
      setFeedback({ kind: 'success', text: 'Share purchased.' });
      onTradeComplete();
    } else {
      setFeedback({ kind: 'error', text: result.error || 'Transaction failed.' });
    }

    setIsSubmitting(false);
  };

  const handleSell = async () => {
    if (!snapshot.objectId) return;
    setIsSubmitting(true);
    setFeedback(null);

    const result = await sellShare(snapshot.objectId, snapshot.packageId);
    if (result.success) {
      setFeedback({ kind: 'success', text: 'Share sold.' });
      onTradeComplete();
    } else {
      setFeedback({ kind: 'error', text: result.error || 'Transaction failed.' });
    }

    setIsSubmitting(false);
  };

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{symbol} Share</h3>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Phase 1</span>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
        <span className="text-gray-500">{isHolder ? 'Sell price' : 'Buy price'}</span>
        <span className="font-mono font-semibold text-gray-900">
          {snapshot.isLoading
            ? '…'
            : isHolder
            ? `${formatMistToSui(sellPriceMist)} SUI`
            : `${formatMistToSui(buyPriceMist)} SUI`}
        </span>
      </div>

      {!account ? (
        <p className="py-2 text-center text-xs text-gray-400">Connect wallet to trade</p>
      ) : snapshot.isLoading ? (
        <div className="h-9 animate-pulse rounded-md bg-gray-100" />
      ) : isHolder ? (
        <Button
          onClick={handleSell}
          disabled={isSubmitting}
          className="w-full bg-gray-900 text-white hover:bg-gray-700"
        >
          {isSubmitting ? 'Selling…' : 'Sell Share'}
        </Button>
      ) : marketFull ? (
        <div className="rounded-md border border-dashed border-gray-200 px-3 py-3 text-center">
          <p className="text-sm font-medium text-gray-700">Market full</p>
          <p className="mt-0.5 text-xs text-gray-400">Waiting for graduation</p>
        </div>
      ) : (
        <Button
          onClick={handleBuy}
          disabled={isSubmitting}
          className="w-full bg-gray-900 text-white hover:bg-gray-700"
        >
          {isSubmitting ? 'Buying…' : 'Buy Share'}
        </Button>
      )}

      {feedback && (
        <div
          className={`mt-3 rounded-md px-3 py-2 text-xs font-medium ${
            feedback.kind === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-gray-400">
        1 share per wallet · price set by bonding curve
      </p>
    </Card>
  );
}

function TokenMarketOverviewCard({
  symbol,
  launchPriceSui,
  poolId,
  tokenType,
}: {
  symbol: string;
  launchPriceSui: number;
  poolId?: string;
  tokenType?: string;
}) {
  const { poolAvailable, marketState, isLoading } = useAmmPool(poolId, tokenType);

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatSui(launchPriceSui)} SUI
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            Launch reference price · ${symbol}
          </div>
        </div>
        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
          Phase 2
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Launch Price</div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-900">
            {formatSui(launchPriceSui)} SUI
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Current Price</div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-900">
            {poolAvailable && marketState ? `${formatSui(marketState.spotPriceSui)} SUI` : isLoading ? '…' : 'Awaiting pool'}
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Pool Reserves</div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-900">
            {poolAvailable && marketState
              ? `${formatAssetAmount(formatMistAmount(marketState.suiReserveMist))} SUI / ${formatAssetAmount(formatTokenAmount(marketState.tokenReserve))} ${symbol}`
              : isLoading
              ? '…'
              : 'Not initialized'}
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Pool Activity</div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-900">
            {poolAvailable && marketState
              ? `${(marketState.feeBps / 100).toFixed(2)}% fee · ${marketState.totalSwaps} swaps`
              : isLoading
              ? '…'
              : 'Launch pending'}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Phase 2 trades route through the protocol-owned AMM. Launch price is preserved from the
        Phase 1 graduation point, and swap fees remain inside the pool.
      </p>
    </Card>
  );
}

function TokenTradePanel({
  symbol,
  poolId,
  tokenType,
  onTradeComplete,
}: {
  symbol: string;
  poolId?: string;
  tokenType?: string;
  onTradeComplete: () => void;
}) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { poolAvailable, marketState, isLoading, isSubmitting, error, refresh, getQuote, buyExactSuiForTokens, sellExactTokensForSui } = useAmmPool(poolId, tokenType);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [suiBalance, setSuiBalance] = useState<bigint | null>(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(100);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const tokenBalanceValue = tokenBalance === null ? null : Number(tokenBalance) / TOKEN_SCALAR;
  const suiBalanceValue = suiBalance === null ? null : Number(suiBalance) / MIST_PER_SUI;
  const tokenBalanceDisplay = tokenBalanceValue === null ? '…' : formatAssetAmount(tokenBalanceValue);
  const suiBalanceDisplay = suiBalanceValue === null ? '…' : `${formatAssetAmount(suiBalanceValue)} SUI`;
  const amountInRaw = useMemo(() => parseDecimalAmount(amount), [amount]);
  const quoteOutRaw = useMemo(() => getQuote(side, amountInRaw), [amountInRaw, getQuote, side]);
  const minOutRaw = useMemo(
    () => (quoteOutRaw * BigInt(10_000 - slippageBps)) / 10_000n,
    [quoteOutRaw, slippageBps],
  );
  const quoteOutDisplay = side === 'buy'
    ? `${formatAssetAmount(formatTokenAmount(quoteOutRaw))} ${symbol}`
    : `${formatAssetAmount(formatMistAmount(quoteOutRaw))} SUI`;
  const minOutDisplay = side === 'buy'
    ? `${formatAssetAmount(formatTokenAmount(minOutRaw))} ${symbol}`
    : `${formatAssetAmount(formatMistAmount(minOutRaw))} SUI`;
  const exceedsBalance = side === 'buy'
    ? amountInRaw > (suiBalance ?? 0n)
    : amountInRaw > (tokenBalance ?? 0n);
  const canReview = !!account && poolAvailable && amountInRaw > 0n && !exceedsBalance && quoteOutRaw > 0n;

  useEffect(() => {
    if (!account?.address) {
      setTokenBalance(null);
      setSuiBalance(null);
      return;
    }

    let cancelled = false;

    Promise.all([
      tokenType
        ? client.getCoins({ owner: account.address, coinType: tokenType })
        : Promise.resolve(null),
      client.getBalance({ owner: account.address }),
    ])
      .then(([tokenCoins, sui]) => {
        if (cancelled) return;
        const totalToken = tokenCoins
          ? tokenCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n)
          : null;
        setTokenBalance(totalToken);
        setSuiBalance(BigInt(sui.totalBalance));
      })
      .catch(() => {
        if (cancelled) return;
        setTokenBalance(null);
        setSuiBalance(null);
      });

    return () => {
      cancelled = true;
    };
  }, [account?.address, balanceRefreshKey, client, tokenType]);

  const handleConfirmTrade = async () => {
    if (!canReview) return;
    setFeedback(null);

    const result = side === 'buy'
      ? await buyExactSuiForTokens(amountInRaw, minOutRaw)
      : await sellExactTokensForSui(amountInRaw, minOutRaw);

    if (result.success) {
      // Record swap for OHLCV chart
      if (poolId && account?.address && quoteOutRaw > 0n) {
        const suiMist = side === 'buy' ? Number(amountInRaw) : Number(quoteOutRaw);
        const tokenAmt = side === 'buy' ? Number(quoteOutRaw) : Number(amountInRaw);
        const priceSui = tokenAmt > 0 ? (suiMist / 1e9) / (tokenAmt / 1e9) : 0;
        apiService.recordSwap({
          pool_id: poolId,
          trader: account.address,
          side,
          sui_amount_mist: suiMist,
          token_amount: tokenAmt,
          price_sui: priceSui,
          timestamp_ms: Date.now(),
          tx_digest: result.txDigest,
        }).catch(() => undefined);
      }

      setFeedback({ kind: 'success', text: `${side === 'buy' ? 'Bought' : 'Sold'} ${symbol} successfully.` });
      setAmount('');
      setReviewOpen(false);
      setBalanceRefreshKey((value) => value + 1);
      refresh().catch(() => undefined);
      onTradeComplete();
    } else {
      setFeedback({ kind: 'error', text: result.error || 'Swap failed.' });
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">${symbol} Token</h3>
        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">Phase 2</span>
      </div>

      <div className="space-y-3">
        <div className="flex rounded-lg bg-gray-100 p-1">
          {(['buy', 'sell'] as const).map((nextSide) => (
            <button
              key={nextSide}
              onClick={() => {
                setSide(nextSide);
                setReviewOpen(false);
                setFeedback(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                side === nextSide ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {nextSide === 'buy' ? `Buy ${symbol}` : `Sell ${symbol}`}
            </button>
          ))}
        </div>

        <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Wallet SUI</span>
            <span className="font-mono font-medium text-gray-700">{suiBalanceDisplay}</span>
          </div>
          {tokenType && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-gray-500">Wallet {symbol}</span>
              <span className="font-mono font-medium text-gray-700">{tokenBalanceDisplay} {symbol}</span>
            </div>
          )}
        </div>

        {!account ? (
          <p className="py-1 text-center text-xs text-gray-400">Connect wallet to view balances</p>
        ) : !poolAvailable ? (
          <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center">
            <p className="text-sm font-medium text-gray-700">Awaiting AMM pool</p>
            <p className="mt-1 text-xs text-gray-400">
              The token has launched, but Phase 2 liquidity has not been initialized yet.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-md border border-gray-100 bg-white px-3 py-3">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span>{side === 'buy' ? 'Spend' : `Sell ${symbol}`}</span>
                <span>
                  Balance:{' '}
                  {side === 'buy'
                    ? suiBalanceDisplay
                    : `${tokenBalanceDisplay} ${symbol}`}
                </span>
              </div>
              <div className="flex items-end gap-3">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value.replace(/[^0-9.]/g, ''));
                    setReviewOpen(false);
                    setFeedback(null);
                  }}
                  placeholder="0.0"
                  className="w-full border-0 bg-transparent px-0 py-1 text-2xl font-semibold text-gray-900 outline-none placeholder:text-gray-300"
                />
                <span className="pb-2 text-sm font-medium text-gray-500">
                  {side === 'buy' ? 'SUI' : symbol}
                </span>
              </div>
            </div>

            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Expected output</span>
                <span className="font-mono font-medium text-gray-900">
                  {quoteOutRaw > 0n ? quoteOutDisplay : '—'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-500">Minimum after slippage</span>
                <span className="font-mono font-medium text-gray-700">
                  {quoteOutRaw > 0n ? minOutDisplay : '—'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-500">Pool price</span>
                <span className="font-mono font-medium text-gray-700">
                  {marketState ? `${formatSui(marketState.spotPriceSui)} SUI` : '—'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setAdvancedOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <span>Advanced</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </button>

            {advancedOpen && (
              <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm">
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Slippage tolerance
                </label>
                <input
                  type="number"
                  min={10}
                  max={2_000}
                  step={10}
                  value={slippageBps}
                  onChange={(event) => setSlippageBps(Math.max(10, Math.min(2_000, Number(event.target.value) || 100)))}
                  className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Enter basis points. `100` = 1.00% maximum slippage.
                </p>
              </div>
            )}

            {reviewOpen ? (
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-3 text-sm">
                <div className="font-medium text-blue-900">Review trade</div>
                <div className="mt-2 flex items-center justify-between text-blue-800">
                  <span>{side === 'buy' ? 'You pay' : `You sell`}</span>
                  <span className="font-mono">
                    {amount || '0'} {side === 'buy' ? 'SUI' : symbol}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-blue-800">
                  <span>{side === 'buy' ? 'You receive' : 'Estimated receive'}</span>
                  <span className="font-mono">{quoteOutDisplay}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-blue-800">
                  <span>Minimum output</span>
                  <span className="font-mono">{minOutDisplay}</span>
                </div>
              </div>
            ) : null}

            {(feedback || error || exceedsBalance) && (
              <div
                className={`rounded-md px-3 py-2 text-xs font-medium ${
                  feedback?.kind === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {feedback?.text || (exceedsBalance ? 'Entered amount exceeds your wallet balance.' : error)}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setBalanceRefreshKey((value) => value + 1);
                  refresh().catch(() => undefined);
                }}
                className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Refresh
              </Button>
              <Button
                onClick={() => {
                  if (!reviewOpen) {
                    setReviewOpen(true);
                    return;
                  }
                  void handleConfirmTrade();
                }}
                disabled={!canReview || isLoading || isSubmitting}
                className="flex-1 bg-gray-900 text-white hover:bg-gray-700"
              >
                {isSubmitting
                  ? 'Submitting…'
                  : reviewOpen
                  ? 'Confirm Swap'
                  : 'Review Trade'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function TradePage({ market: initialMarket, onClose }: TradePageProps) {
  const client = useSuiClient();
  const { findMarketByOwner } = useShareMarket();
  const { graduationRegistryId } = useContractAddresses();
  const [activeMarket, setActiveMarket] = useState<TradePageContext>(initialMarket);
  const symbol = useMemo(() => normalizeSymbol(activeMarket.tokenSymbol), [activeMarket.tokenSymbol]);

  const { holdings, totalValueMist, isLoading: portfolioLoading, refetch: refetchPortfolio } = usePortfolio();
  const [snapshot, setSnapshot] = useState<MarketSnapshot>({
    objectId: '',
    packageId: '',
    holders: 0,
    holderList: [],
    isGraduated: false,
    isLoading: false,
  });

  const cancelRef = useRef(false);

  const loadSnapshot = useCallback(async (creatorAddress: string) => {
    cancelRef.current = false;
    setSnapshot({
      objectId: '',
      packageId: '',
      holders: 0,
      holderList: [],
      isGraduated: false,
      isLoading: true,
    });

    try {
      const info = await findMarketByOwner(creatorAddress);
      if (cancelRef.current || !info) {
        if (!cancelRef.current) {
          setSnapshot({
            objectId: '',
            packageId: '',
            holders: 0,
            holderList: [],
            isGraduated: false,
            isLoading: false,
          });
        }
        return;
      }

      const marketObject = await client.getObject({
        id: info.objectId,
        options: { showContent: true },
      });
      if (cancelRef.current) return;

      const marketFields = (marketObject.data?.content as { fields?: {
            holder_list?: string[];
            graduated?: boolean;
          } } | null | undefined)?.fields as
        | {
            holder_list?: string[];
            graduated?: boolean;
          }
        | undefined;
      const rawList = marketFields?.holder_list ?? [];
      const isGraduated = Boolean(marketFields?.graduated);

      const resolvedHolders = await Promise.all(
        rawList.map(async (address, index): Promise<ResolvedHolder> => {
          const fallback = `${address.slice(0, 6)}…${address.slice(-4)}`;
          try {
            const response = await apiService.getUserByAddress(address);
            const username = response.success && response.data ? response.data.username : fallback;
            return { rank: index + 1, username, address };
          } catch {
            return { rank: index + 1, username: fallback, address };
          }
        }),
      );

      if (!cancelRef.current) {
        setSnapshot({
          objectId: info.objectId,
          packageId: info.packageId,
          holders: info.holders,
          holderList: resolvedHolders,
          isGraduated,
          isLoading: false,
        });
      }
    } catch {
      if (!cancelRef.current) {
        setSnapshot((previous) => ({ ...previous, isLoading: false }));
      }
    }
  }, [client, findMarketByOwner]);

  useEffect(() => {
    const creatorAddress = activeMarket.creatorAddress;
    if (!creatorAddress) {
      setSnapshot({
        objectId: '',
        packageId: '',
        holders: 0,
        holderList: [],
        isGraduated: false,
        isLoading: false,
      });
      return;
    }

    loadSnapshot(creatorAddress);
    return () => {
      cancelRef.current = true;
    };
  }, [activeMarket.creatorAddress, loadSnapshot]);

  useEffect(() => {
    if (!snapshot.isGraduated || !snapshot.objectId || !graduationRegistryId || graduationRegistryId === '0x0') {
      return;
    }

    let cancelled = false;

    resolveGraduationVaultMetadata(client, graduationRegistryId, snapshot.objectId)
      .then((metadata) => {
        if (!metadata || cancelled) return;
        setActiveMarket((previous) => ({
          ...previous,
          tokenSymbol: metadata.tokenSymbol || previous.tokenSymbol,
          tokenName: metadata.tokenName || previous.tokenName,
          tokenType: metadata.tokenType || previous.tokenType,
          poolId: metadata.poolId || previous.poolId,
        }));
      })
      .catch(() => {
        // Non-fatal: token metadata can still come from the route context.
      });

    return () => {
      cancelled = true;
    };
  }, [client, graduationRegistryId, snapshot.isGraduated, snapshot.objectId]);

  const bondingPoints = useMemo(() => buildBondingCurve(snapshot.holders), [snapshot.holders]);
  const progress = graduationProgressPercent(snapshot.holders);
  const launchPriceSui = useMemo(() => mistToSui(calculatePriceMist(MAX_SUPPLY)), []);

  const {
    candles,
    isLoading: ohlcvLoading,
    interval: ohlcvInterval,
    changeInterval: changeOhlcvInterval,
    refresh: refreshOhlcv,
  } = useOhlcv(snapshot.isGraduated ? activeMarket.poolId : undefined);

  const handleSwitchMarket = (holding: (typeof holdings)[number]) => {
    setActiveMarket({
      tokenSymbol: holding.tokenSymbol || holding.creator.token_symbol || holding.creator.username,
      tokenName: holding.creator.username,
      username: holding.creator.username,
      creatorAddress: holding.creatorAddress,
      tokenType: holding.tokenType || undefined,
      poolId: holding.poolId || undefined,
      source: 'profile',
    });
  };

  const handleTradeComplete = () => {
    refetchPortfolio();
    if (activeMarket.creatorAddress) {
      loadSnapshot(activeMarket.creatorAddress);
    }
    // Refresh chart after a short delay to allow the backend to record the swap
    setTimeout(() => refreshOhlcv(), 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-gray-100 flex-shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gradient-to-br from-purple-400 to-pink-400" />
            <div className="min-w-0">
              <div className="truncate font-semibold text-gray-900">
                {activeMarket.username ? `@${activeMarket.username}` : `$${symbol}`}
              </div>
              <div className="text-xs text-gray-500">${symbol}</div>
            </div>
          </div>

          <div className="flex-shrink-0 text-right">
            <div className="flex items-center justify-end gap-1.5 text-xs text-gray-500">
              <Users className="h-3.5 w-3.5" />
              <span>{snapshot.isLoading ? '…' : snapshot.holders}/{GRADUATION_THRESHOLD}</span>
            </div>
            <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-gray-100">
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
          <section className="space-y-4">
            {snapshot.isGraduated ? (
              <>
                <CandlestickChart
                  candles={candles}
                  interval={ohlcvInterval}
                  onIntervalChange={changeOhlcvInterval}
                  isLoading={ohlcvLoading}
                  symbol={symbol}
                />
                <TokenMarketOverviewCard
                  symbol={symbol}
                  launchPriceSui={launchPriceSui}
                  poolId={activeMarket.poolId}
                  tokenType={activeMarket.tokenType}
                />
              </>
            ) : (
              <BondingCurveChart points={bondingPoints} currentHolders={snapshot.holders} />
            )}

            <Card className="p-4">
              <h3 className="mb-3 text-base font-semibold text-gray-900">Top Holders</h3>

              {snapshot.isLoading ? (
                <div className="py-6 text-center text-xs text-gray-400">Loading holders…</div>
              ) : snapshot.holderList.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">
                  {activeMarket.creatorAddress ? 'No holders found.' : 'Open from a creator profile to see holders.'}
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {snapshot.holderList.map((holder) => {
                    const tier = holderTier(holder.rank);
                    const gradientIndex = holder.address
                      .split('')
                      .reduce((sum, character) => sum + character.charCodeAt(0), 0) % AVATAR_GRADIENTS.length;

                    return (
                      <div key={holder.address} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="w-5 text-right text-xs tabular-nums text-gray-400">{holder.rank}</span>
                        <div className={`h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[gradientIndex]}`} />
                        <span className="flex-1 truncate text-sm text-gray-800">@{holder.username}</span>
                        <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${tier.className}`}>
                          {tier.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </section>

          <aside className="space-y-4">
            {snapshot.isGraduated ? (
              <TokenTradePanel
                symbol={symbol}
                poolId={activeMarket.poolId}
                tokenType={activeMarket.tokenType}
                onTradeComplete={handleTradeComplete}
              />
            ) : (
              <ShareTradePanel
                symbol={symbol}
                snapshot={snapshot}
                onTradeComplete={handleTradeComplete}
              />
            )}

            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Your Portfolio</h3>
                {!portfolioLoading && holdings.length > 0 && (
                  <span className="text-xs text-gray-500">{formatMistToSui(totalValueMist)} SUI</span>
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
                  {holdings.map((holding, index) => {
                    const isActive = holding.creator.username === activeMarket.username;
                    const pnlPositive = holding.pnlPercent >= 0;
                    const gradientIndex = index % AVATAR_GRADIENTS.length;

                    return (
                      <button
                        key={holding.marketId}
                        onClick={() => handleSwitchMarket(holding)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors ${
                          isActive ? 'bg-gray-100 ring-1 ring-gray-200' : 'hover:bg-gray-50'
                        }`}
                      >
                        {holding.creator.avatar_url ? (
                          <img
                            src={holding.creator.avatar_url}
                            alt=""
                            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className={`h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[gradientIndex]}`} />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-900">@{holding.creator.username}</div>
                          <div className="text-xs text-gray-400">
                            {holding.isGraduated
                              ? `$${holding.tokenSymbol || holding.creator.token_symbol}`
                              : `${holding.holders} holders`}
                          </div>
                        </div>

                        <div className="flex-shrink-0 text-right">
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
