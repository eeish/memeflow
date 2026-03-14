import React from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { formatMistToSui } from '../hooks/useShareMarket';
import { TrendingUp, TrendingDown, Users, Loader2 } from './ui-simple/Icons';
import { GRADUATION_THRESHOLD, graduationProgressPercent } from '../lib/graduation';
import type { UserSummary } from '../types/users';

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
  const { holdings, totalValueMist, isLoading, error } = usePortfolio();

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
          // Use only the on-chain-resolved symbol; never fall back to creator.token_symbol
          // which is an unrelated profile field (often set to the username).
          const displaySymbol = holding.tokenSymbol
            ? `$${holding.tokenSymbol.replace('$', '')}`
            : null;

          return (
            <button
              key={holding.marketId}
              className="w-full px-4 py-3 flex items-center gap-3 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
              onClick={() => onNavigateToProfile?.(holding.creator)}
            >
              {/* Avatar */}
              {holding.creator.avatar_url ? (
                <img
                  src={holding.creator.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex-shrink-0" />
              )}

              {/* Creator info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">
                    {holding.creator.username}
                  </span>
                  {holding.isGraduated ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                      {displaySymbol ?? 'Token'}
                    </span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                      Share
                    </span>
                  )}
                </div>

                {holding.isGraduated ? (
                  /* Graduated: show token quantity */
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    <span>
                      {holding.tokenQuantity > 0n
                        ? `${formatTokenQuantity(holding.tokenQuantity)} tokens`
                        : '1 token'}
                    </span>
                  </div>
                ) : (
                  /* Phase 1: show "1 share" + graduation progress + cost price */
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
              </div>

              {/* Value & P&L */}
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-medium text-gray-900">
                  {formatMistToSui(holding.currentValueMist)} SUI
                </div>
                <div className={`flex items-center justify-end gap-0.5 text-xs ${pnlPositive ? 'text-green-600' : 'text-red-500'}`}>
                  {pnlPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{pnlPositive ? '+' : ''}{holding.pnlPercent.toFixed(1)}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
