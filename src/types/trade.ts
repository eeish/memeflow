export type TradeSource = 'profile' | 'feed';

export interface TradePageContext {
  tokenSymbol: string;
  tokenName?: string;
  username?: string;
  creatorAddress?: string;
  source: TradeSource;
}
