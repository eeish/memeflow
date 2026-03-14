import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { ArrowLeft, ChevronDown, Users } from '../ui-simple/Icons';
import { Button } from '../ui-simple/Button';
import { Card } from '../ui-simple/Card';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useShareMarket, calculatePriceMist, formatMistToSui } from '../../hooks/useShareMarket';
import { useDeepBook, type DeepBookQuote } from '../../hooks/useDeepBook';
import { useContractAddresses } from '../../hooks/useContractsSocial';
import { apiService } from '../../lib/api';
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
const DEFAULT_SLIPPAGE_BPS = 100;

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
  poolAvailable,
  marketState,
}: {
  symbol: string;
  launchPriceSui: number;
  poolAvailable: boolean;
  marketState: ReturnType<typeof useDeepBook>['marketState'];
}) {
  const displayedPrice = marketState.midPriceSui ?? launchPriceSui;

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatSui(displayedPrice)} SUI
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {poolAvailable ? `DeepBook mid price · $${symbol}` : `Launch reference price · $${symbol}`}
          </div>
        </div>
        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${
          poolAvailable
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-amber-50 text-amber-600'
        }`}>
          {poolAvailable ? 'Pool live' : 'Awaiting pool'}
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
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Current Mid</div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-900">
            {marketState.midPriceSui != null ? `${formatSui(marketState.midPriceSui)} SUI` : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Tick Size</div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-900">
            {marketState.tickSize != null ? formatAssetAmount(marketState.tickSize) : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Minimum Size</div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-900">
            {marketState.minSize != null ? `${formatAssetAmount(marketState.minSize)} ${symbol}` : '—'}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        {poolAvailable
          ? 'Swaps execute against current DeepBook orderbook liquidity. Review output and DEEP fee before confirming.'
          : 'Token trading becomes available after the creator registers a DeepBook pool for this token.'}
      </p>
    </Card>
  );
}

function TokenTradePanel({
  symbol,
  tokenType,
  deepBook,
  onTradeComplete,
}: {
  symbol: string;
  tokenType?: string;
  deepBook: ReturnType<typeof useDeepBook>;
  onTradeComplete: () => void;
}) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { poolAvailable, isLoading: poolLoading, error: poolError, marketState, getQuote, placeOrder } = deepBook;

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amountInput, setAmountInput] = useState('');
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [quote, setQuote] = useState<DeepBookQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [suiBalance, setSuiBalance] = useState<bigint | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  const parsedAmount = Number.parseFloat(amountInput) || 0;
  const tokenBalanceValue = tokenBalance === null ? null : Number(tokenBalance) / TOKEN_SCALAR;
  const suiBalanceValue = suiBalance === null ? null : Number(suiBalance) / MIST_PER_SUI;

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

  useEffect(() => {
    if (!poolAvailable || parsedAmount <= 0) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);

    getQuote(side, parsedAmount, slippageBps)
      .then((nextQuote) => {
        if (!cancelled) {
          setQuote(nextQuote);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(error instanceof Error ? error.message : 'Failed to load quote.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getQuote, parsedAmount, poolAvailable, side, slippageBps]);

  const resetTradeState = (nextSide?: 'buy' | 'sell') => {
    setAmountInput('');
    setQuote(null);
    setQuoteError(null);
    setFeedback(null);
    setReviewMode(false);
    if (nextSide) {
      setSide(nextSide);
    }
  };

  const quoteOutput = side === 'buy' ? quote?.baseOut : quote?.suiOut;
  const tokenBalanceDisplay = tokenBalanceValue === null ? '…' : formatAssetAmount(tokenBalanceValue);
  const suiBalanceDisplay = suiBalanceValue === null ? '…' : `${formatAssetAmount(suiBalanceValue)} SUI`;
  const deepBalanceDisplay = marketState.deepBalance === null ? '—' : `${formatAssetAmount(marketState.deepBalance)} DEEP`;

  let validationError: string | null = null;
  if (parsedAmount <= 0 && amountInput.trim()) {
    validationError = 'Enter an amount greater than zero.';
  } else if (side === 'sell' && tokenBalanceValue !== null && parsedAmount > tokenBalanceValue + 1e-9) {
    validationError = `Insufficient ${symbol} balance.`;
  } else if (side === 'buy' && suiBalanceValue !== null && parsedAmount > suiBalanceValue + 1e-9) {
    validationError = 'Insufficient SUI balance.';
  } else if (quote && marketState.deepBalance !== null && quote.deepRequired > marketState.deepBalance + 1e-9) {
    validationError = `This trade needs ${formatAssetAmount(quote.deepRequired)} DEEP for fees.`;
  }

  const handleReview = () => {
    if (!quote || !quoteOutput || validationError) return;
    setReviewMode(true);
    setFeedback(null);
  };

  const handleConfirmTrade = async () => {
    if (!quote || !parsedAmount) return;

    setIsSubmitting(true);
    setFeedback(null);
    const result = await placeOrder(side, parsedAmount, quote);

    if (result.success) {
      setFeedback({
        kind: 'success',
        text: `${side === 'buy' ? 'Buy' : 'Sell'} trade submitted.`,
      });
      setReviewMode(false);
      setAmountInput('');
      setQuote(null);
      setBalanceRefreshKey((value) => value + 1);
      onTradeComplete();
    } else {
      setFeedback({
        kind: 'error',
        text: result.error || 'Transaction failed.',
      });
    }

    setIsSubmitting(false);
  };

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">${symbol} Token</h3>
        <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">Phase 2</span>
      </div>

      {!poolAvailable ? (
        <div className="space-y-3">
          <div className="rounded-md border border-dashed border-gray-200 px-4 py-5 text-center">
            <p className="text-sm font-medium text-gray-700">${symbol} has launched</p>
            <p className="mt-1 text-xs text-gray-400">
              No DeepBook pool is registered yet.
              <br />
              Trading will appear here once the pool is live.
            </p>
          </div>

          {tokenType && (
            <div className="flex items-center justify-between px-1 text-xs text-gray-500">
              <span>Your {symbol} balance</span>
              <span className="font-mono font-medium text-gray-700">{tokenBalanceDisplay} {symbol}</span>
            </div>
          )}

          {poolError && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {poolError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex rounded-md overflow-hidden border border-gray-200 text-sm font-medium">
            <button
              onClick={() => resetTradeState('buy')}
              className={`flex-1 py-1.5 transition-colors ${
                side === 'buy' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => resetTradeState('sell')}
              className={`flex-1 py-1.5 transition-colors ${
                side === 'sell' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              Sell
            </button>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
              <label>
                {side === 'buy' ? 'You pay (SUI)' : `You sell (${symbol})`}
              </label>
              <span>
                {side === 'buy'
                  ? `Balance: ${suiBalanceDisplay}`
                  : `Balance: ${tokenBalanceDisplay} ${symbol}`}
              </span>
            </div>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={amountInput}
              onChange={(event) => {
                setAmountInput(event.target.value);
                setFeedback(null);
                setReviewMode(false);
              }}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-900 outline-none focus:ring-1 focus:ring-gray-300"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
            <span className="text-gray-500">
              {side === 'buy' ? `Estimated receive (${symbol})` : 'Estimated receive (SUI)'}
            </span>
            <span className="font-mono font-semibold text-gray-900">
              {poolLoading || quoteLoading
                ? '…'
                : quoteOutput
                ? side === 'buy'
                  ? `${formatAssetAmount(quoteOutput)} ${symbol}`
                  : `${formatAssetAmount(quoteOutput)} SUI`
                : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between px-0.5 text-xs text-gray-500">
            <span>DEEP fee budget</span>
            <span className="font-mono text-gray-700">
              {quote ? `${formatAssetAmount(quote.deepRequired)} DEEP` : deepBalanceDisplay}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:bg-gray-50"
          >
            <span>Advanced</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>

          {advancedOpen && (
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-xs text-gray-600">
              <div className="mb-2 font-medium text-gray-700">Slippage tolerance</div>
              <div className="flex gap-2">
                {[50, 100, 200].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSlippageBps(preset);
                      setReviewMode(false);
                    }}
                    className={`rounded px-2 py-1 font-medium ${
                      slippageBps === preset
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-600 ring-1 ring-gray-200'
                    }`}
                  >
                    {(preset / 100).toFixed(preset === 50 ? 1 : 0)}%
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Tick Size</div>
                  <div className="mt-1 font-mono text-gray-700">
                    {marketState.tickSize != null ? formatAssetAmount(marketState.tickSize) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Minimum Order</div>
                  <div className="mt-1 font-mono text-gray-700">
                    {marketState.minSize != null ? `${formatAssetAmount(marketState.minSize)} ${symbol}` : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {quote && reviewMode ? (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
              <div className="text-sm font-medium text-gray-900">Review trade</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{side === 'buy' ? 'You pay' : 'You sell'}</span>
                  <span className="font-mono text-gray-900">
                    {formatAssetAmount(parsedAmount)} {side === 'buy' ? 'SUI' : symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Estimated receive</span>
                  <span className="font-mono text-gray-900">
                    {quoteOutput
                      ? `${formatAssetAmount(quoteOutput)} ${side === 'buy' ? symbol : 'SUI'}`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Minimum receive</span>
                  <span className="font-mono text-gray-900">
                    {quote.minOut != null
                      ? `${formatAssetAmount(quote.minOut)} ${side === 'buy' ? symbol : 'SUI'}`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Mid price</span>
                  <span className="font-mono text-gray-900">
                    {quote.midPriceSui != null ? `${formatSui(quote.midPriceSui)} SUI` : '—'}
                  </span>
                </div>
                {quote.priceImpactPct != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Price impact</span>
                    <span className="font-mono text-gray-900">{quote.priceImpactPct.toFixed(2)}%</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">DEEP fee</span>
                  <span className="font-mono text-gray-900">{formatAssetAmount(quote.deepRequired)} DEEP</span>
                </div>
              </div>

              <p className="text-[11px] text-gray-500">
                Slippage tolerance is set to {(slippageBps / 100).toFixed(slippageBps === 50 ? 1 : 0)}%.
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setReviewMode(false)}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmTrade}
                  disabled={isSubmitting || !!validationError}
                  className="flex-1 bg-gray-900 text-white hover:bg-gray-700"
                >
                  {isSubmitting ? 'Confirming…' : 'Confirm trade'}
                </Button>
              </div>
            </div>
          ) : !account ? (
            <p className="py-1 text-center text-xs text-gray-400">Connect wallet to trade</p>
          ) : (
            <Button
              onClick={handleReview}
              disabled={poolLoading || quoteLoading || !parsedAmount || !quoteOutput || !!validationError}
              className="w-full bg-gray-900 text-white hover:bg-gray-700"
            >
              {quoteLoading ? 'Loading quote…' : 'Review trade'}
            </Button>
          )}

          {(poolError || quoteError || validationError) && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {validationError || quoteError || poolError}
            </div>
          )}

          {feedback && (
            <div
              className={`rounded-md px-3 py-2 text-xs font-medium ${
                feedback.kind === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>
      )}
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

  const deepBook = useDeepBook(
    snapshot.isGraduated ? activeMarket.poolId : undefined,
    snapshot.isGraduated ? activeMarket.tokenType : undefined,
  );

  const bondingPoints = useMemo(() => buildBondingCurve(snapshot.holders), [snapshot.holders]);
  const progress = graduationProgressPercent(snapshot.holders);
  const launchPriceSui = useMemo(() => mistToSui(calculatePriceMist(MAX_SUPPLY)), []);

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
              <TokenMarketOverviewCard
                symbol={symbol}
                launchPriceSui={launchPriceSui}
                poolAvailable={deepBook.poolAvailable}
                marketState={deepBook.marketState}
              />
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
                tokenType={activeMarket.tokenType}
                deepBook={deepBook}
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
