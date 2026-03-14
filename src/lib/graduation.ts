// Phase 2: Token Graduation types, constants, and helpers

interface GraduationMetadataClient {
  getObject: (input: { id: string; options?: Record<string, unknown> }) => Promise<{
    data?: {
      type?: string;
      content?: unknown;
    };
  }>;
  getDynamicFieldObject: (input: { parentId: string; name: { type: string; value: unknown } }) => Promise<{
    data?: {
      content?: unknown;
    };
  }>;
}

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
  /** DeepBook pool object ID for this token/SUI pair — set after pool creation */
  poolId?: string;
}

export interface GraduationConfig {
  tokenName: string;
  tokenSymbol: string;
}

export interface GraduationVaultMetadata {
  vaultId?: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenType?: string;
  poolId?: string;
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

function decodeAsciiBytes(raw: unknown): string | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  if (!raw.every((value) => typeof value === 'number')) return undefined;
  return String.fromCharCode(...raw);
}

function parseVaultTokenType(rawType: unknown): string | undefined {
  if (typeof rawType !== 'string') return undefined;
  const match = rawType.match(/::graduation::CreatorTokenVault<(.+)>$/);
  return match?.[1];
}

function normalizePoolId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || /^0x0+$/.test(trimmed)) return undefined;
  return trimmed;
}

async function loadVaultPoolId(
  client: GraduationMetadataClient,
  vaultId: string,
): Promise<string | undefined> {
  try {
    const poolField = await client.getDynamicFieldObject({
      parentId: vaultId,
      name: { type: 'u8', value: 0 },
    });
    const poolFieldFields = (poolField.data?.content as { fields?: unknown } | undefined)?.fields as
      | { value?: unknown }
      | undefined;
    return normalizePoolId(poolFieldFields?.value);
  } catch {
    return undefined;
  }
}

export async function resolveGraduationVaultMetadata(
  client: GraduationMetadataClient,
  graduationRegistryId: string | undefined,
  marketId: string | undefined,
): Promise<GraduationVaultMetadata | null> {
  if (!graduationRegistryId || graduationRegistryId === '0x0' || !marketId) {
    return null;
  }

  try {
    const registryObj = await client.getObject({
      id: graduationRegistryId,
      options: { showContent: true },
    });
    const registryFields = (registryObj.data?.content as { fields?: unknown } | undefined)?.fields as
      | {
          vault_by_market?: {
            fields?: {
              id?: {
                id?: string;
              };
            };
          };
        }
      | undefined;
    const tableId = registryFields?.vault_by_market?.fields?.id?.id;
    if (!tableId) return null;

    const vaultEntry = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: 'address', value: marketId },
    });
    const vaultEntryFields = (vaultEntry.data?.content as { fields?: unknown } | undefined)?.fields as
      | { value?: string }
      | undefined;
    const vaultId = vaultEntryFields?.value;
    if (!vaultId) return null;

    const vaultObj = await client.getObject({
      id: vaultId,
      options: { showContent: true, showType: true },
    });
    const vaultFields = (vaultObj.data?.content as { fields?: unknown; type?: string } | undefined)?.fields as
      | {
          symbol?: unknown;
          name?: unknown;
          pool_id?: unknown;
        }
      | undefined;
    const vaultContent = vaultObj.data?.content as { type?: string } | undefined;
    const vaultType = vaultObj.data?.type || vaultContent?.type;
    const resolvedPoolId =
      (await loadVaultPoolId(client, vaultId)) || normalizePoolId(vaultFields?.pool_id);

    return {
      vaultId,
      tokenSymbol: decodeAsciiBytes(vaultFields?.symbol),
      tokenName: decodeAsciiBytes(vaultFields?.name),
      tokenType: parseVaultTokenType(vaultType),
      poolId: resolvedPoolId,
    };
  } catch {
    return null;
  }
}
