export interface UserSummary {
  id: string;
  username: string;
  avatar_url: string | null;
  token_symbol: string;
  is_graduated?: boolean;
}
