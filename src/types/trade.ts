export type TradeSource = 'profile' | 'feed';

export interface TradePageContext {
  tokenSymbol: string;
  tokenName?: string;
  username?: string;
  creatorAddress?: string;
  /** Full Move type of the graduated token, e.g. `0xabc::my_token::MY_TOKEN` */
  tokenType?: string;
  /** Shared Phase 2 AMM pool object ID for this token/SUI pair */
  poolId?: string;
  source: TradeSource;
}
