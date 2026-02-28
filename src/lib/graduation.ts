// Phase 2: Token Graduation types, constants, and helpers

export type MarketPhase = 'shares' | 'graduating' | 'graduated';

export interface GraduationState {
  phase: MarketPhase;
  holdersCount: number;
  graduationThreshold: number;
  treasuryBalanceMist: bigint;
  tokenName?: string;
  tokenSymbol?: string;
  tokenPackageId?: string;
  tokenType?: string;
  tokenVaultId?: string;
  graduatedAt?: number; // timestamp ms
  liquidityPooled?: bigint;
}

export interface GraduationConfig {
  tokenName: string;
  tokenSymbol: string;
}

const MIN_SUPPLY = 2;
const TERM2_GAP = 8;

function parseMaxSupply(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return MIN_SUPPLY;
  const normalized = Math.floor(value);
  if (normalized < MIN_SUPPLY) return MIN_SUPPLY;
  return normalized;
}

export const MAX_SUPPLY = parseMaxSupply(import.meta.env.VITE_MAX_SUPPLY);
export const TERM2_DENOM_BASE = MAX_SUPPLY + TERM2_GAP;
export const GRADUATION_THRESHOLD = MAX_SUPPLY;

export function getMarketPhase(holders: number): MarketPhase {
  if (holders >= GRADUATION_THRESHOLD) return 'graduating';
  return 'shares';
}

export function graduationProgress(holders: number): number {
  return Math.min(1, Math.max(0, holders / GRADUATION_THRESHOLD));
}

export function graduationProgressPercent(holders: number): number {
  return Math.round(graduationProgress(holders) * 100);
}
