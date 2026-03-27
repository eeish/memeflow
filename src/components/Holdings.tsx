import React, { useState, useCallback } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { useShareMarket, formatMistToSui } from '../hooks/useShareMarket';
import { TrendingUp, TrendingDown, Users, Loader2 } from './ui-simple/Icons';
import { GRADUATION_THRESHOLD, graduationProgressPercent } from '../lib/graduation';
import type { UserSummary } from '../types/users';
import type { Holding } from '../hooks/usePortfolio';

// Creator tokens use 9 decimals (same as SUI)
const TOKEN_DECIMALS = 1_000_000_000n;

function formatTokenQuantity(raw: bigint): string {
  if (raw === 0n) return '0';
  const whole = raw / TOKEN_DECIMALS;
  const frac = raw % TOKEN_DECIMALS;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fracStr.slice(0, 4)}`;
}

interface HoldingsProps {
  onNavigateToProfile?: (user: UserSummary) => void;
}

export const Holdings: React.FC<HoldingsProps> = ({ onNavigateToProfile }) => {
  const { holdings, totalValueMist, isLoading, error, refetch } = usePortfolio();
  const { sellShare } = useShareMarket();

  // Track which Phase-1 holding is pending sell confirmation
  const [sellConfirmId, setSellConfirmId] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);

  const handleSellClick = useCallback((e: React.MouseEvent, marketId: string) => {
    e.stopPropagation();
    setSellError(null);
    setSellConfirmId(marketId);
  }, []);

  const handleSellCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSellConfirmId(null);
    setSellError(null);
  }, []);

  const handleSellConfirm = useCallback(async (e: React.MouseEvent, holding: Holding) => {
    e.stopPropagation();
    setSelling(true);
    setSellError(null);
    const result = await sellShare(holding.marketId);
    setSelling(false);
    if (result.success) {
      setSellConfirmId(null);
      refetch();
    } else {
      setSellError(result.error || 'Transaction failed');
    }
  }, [sellShare, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-500">
        <p>{error}</p>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="text-gray-400 mb-2 text-lg">No holdings yet</div>
        <p className="text-gray-400 text-sm">
          You haven't purchased any shares yet. Discover creators in the Plaza.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Summary bar */}
      <div className="px-4 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Portfolio value</div>
          <div className="text-xl font-semibold text-gray-900">
            {formatMistToSui(totalValueMist)} SUI
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Creators</div>
          <div className="text-xl font-semibold text-gray-900">{holdings.length}</div>
        </div>
      </div>

      {/* Creator list */}
      <div className="bg-white">
        {holdings.map((holding) => {
          const pnlPositive = holding.pnlPercent >= 0;
          const progress = graduationProgressPercent(holding.holders);
          const displaySymbol = holding.tokenSymbol
            ? `$${holding.tokenSymbol.replace('$', '')}`
            : null;
          const isConfirming = sellConfirmId === holding.marketId;

          return (
            <div
              key={holding.marketId}
              className={`border-b border-gray-100 transition-colors ${
                isConfirming ? 'bg-gray-50' : 'hover:bg-gray-50/60'
              }`}
            >
              {/* Main row */}
              <div className="px-4 py-3 flex items-center gap-3">
                {/* Avatar — always navigates to profile */}
                <button
                  className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded-full"
                  onClick={() => onNavigateToProfile?.(holding.creator)}
                  aria-label={`View ${holding.creator.username}'s profile`}
                >
                  {holding.creator.avatar_url ? (
                    <img
                      src={holding.creator.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-600" />
                  )}
                </button>

                {/* Creator info — clicking name navigates to profile */}
                <button
                  className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                  onClick={() => onNavigateToProfile?.(holding.creator)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {holding.creator.username}
                    </span>
                    {holding.isGraduated ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium flex-shrink-0">
                        {displaySymbol ?? 'Token'}
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium flex-shrink-0">
                        Share
                      </span>
                    )}
                  </div>

                  {holding.isGraduated ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <span>
                        {holding.tokenQuantity > 0n
                          ? `${formatTokenQuantity(holding.tokenQuantity)} tokens`
                          : '1 token'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <Users className="h-3 w-3" />
                      <span>1 share</span>
                      <span className="text-gray-300">·</span>
                      <span>{holding.holders}/{GRADUATION_THRESHOLD}</span>
                      <span className="text-gray-400">({progress}%)</span>
                      <span className="text-gray-300">·</span>
                      <span>cost {formatMistToSui(holding.purchasePriceMist)} SUI</span>
                    </div>
                  )}
                </button>

                {/* Right side: value + action */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <div className="text-sm font-medium text-gray-900">
                    {formatMistToSui(holding.currentValueMist)} SUI
                  </div>
                  <div className={`flex items-center gap-0.5 text-xs ${pnlPositive ? 'text-green-600' : 'text-red-500'}`}>
                    {pnlPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span>{pnlPositive ? '+' : ''}{holding.pnlPercent.toFixed(1)}%</span>
                  </div>

                  {/* Sell button — Phase 1 only, not while confirming */}
                  {!holding.isGraduated && !isConfirming && (
                    <button
                      onClick={(e) => handleSellClick(e, holding.marketId)}
                      className="mt-0.5 text-xs text-gray-400 hover:text-red-500 transition-colors underline underline-offset-2"
                    >
                      Sell
                    </button>
                  )}
                </div>
              </div>

              {/* Inline sell confirmation strip */}
              {isConfirming && (
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2.5">
                    <div className="text-xs text-gray-600">
                      Sell for{' '}
                      <span className="font-semibold text-gray-900">
                        {formatMistToSui(holding.currentValueMist)} SUI
                      </span>
                      ?
                      {sellError && (
                        <span className="block text-red-500 mt-0.5">{sellError}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        onClick={(e) => handleSellCancel(e)}
                        disabled={selling}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={(e) => handleSellConfirm(e, holding)}
                        disabled={selling}
                        className="text-xs font-medium bg-gray-900 hover:bg-gray-700 disabled:opacity-50
                          text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {selling && <Loader2 className="h-3 w-3 animate-spin" />}
                        {selling ? 'Selling…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
