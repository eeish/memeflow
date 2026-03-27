#!/usr/bin/env node

import fs from 'node:fs/promises';

import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { SuiClient as LegacySuiClient } from '@mysten/sui.js/client';

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function normalizeAddress(value) {
  if (typeof value !== 'string') throw new Error('Invalid address');
  return value.startsWith('0x') ? value : `0x${value}`;
}

function extractFields(content) {
  return content && typeof content === 'object' ? content.fields ?? null : null;
}

function parseVaultTokenType(rawType) {
  if (typeof rawType !== 'string') return undefined;
  const match = rawType.match(/::graduation::CreatorTokenVault<(.+)>$/);
  return match?.[1];
}

const MIST_PER_SUI = 1_000_000_000n;
const PRICE_BASE = 20_000_000n;
const PRICE_TERM1_NUM = 350_000_000n;
const PRICE_TERM2_NUM = 1_000_000_000n;
const TERM1_OFFSET = 3n;
const TERM2_GAP = 8n;
const DEFAULT_AMM_FEE_BPS = 100n;

function priceMist(x, maxSupply) {
  const slot = BigInt(x);
  const supply = BigInt(maxSupply);
  const term2DenomBase = supply + TERM2_GAP;
  return (
    PRICE_BASE +
    PRICE_TERM1_NUM / (slot + TERM1_OFFSET) +
    PRICE_TERM2_NUM / (term2DenomBase - slot)
  );
}

function calculateTreasuryMist(holders) {
  let total = 0n;
  for (let i = 1n; i <= BigInt(holders); i += 1n) {
    total += priceMist(i, holders);
  }
  return total;
}

function calculateInitialTokenLiquidity(holders) {
  const holderCount = BigInt(holders);
  if (holderCount <= 0n) {
    throw new Error('Cannot initialize AMM pool without holders');
  }

  const treasuryMist = calculateTreasuryMist(holderCount);
  const launchPriceMist = priceMist(holderCount, holderCount);
  const impliedTokenLiquidity = (treasuryMist * MIST_PER_SUI) / launchPriceMist;
  return impliedTokenLiquidity > 0n ? impliedTokenLiquidity : 1n;
}

function keypairFromPrivateKey(privateKey) {
  const parsed = decodeSuiPrivateKey(privateKey.trim());
  switch (parsed.scheme) {
    case 'ED25519':
      return Ed25519Keypair.fromSecretKey(parsed.secretKey);
    case 'Secp256k1':
      return Secp256k1Keypair.fromSecretKey(parsed.secretKey);
    case 'Secp256r1':
      return Secp256r1Keypair.fromSecretKey(parsed.secretKey);
    default:
      throw new Error(`Unsupported operator key scheme: ${parsed.scheme}`);
  }
}

function getDigest(result) {
  return (
    result?.digest ||
    result?.Transaction?.digest ||
    result?.FailedTransaction?.digest ||
    null
  );
}

async function waitForTx(legacyClient, digest) {
  const tx = await legacyClient.waitForTransactionBlock({
    digest,
    options: {
      showEffects: true,
      showObjectChanges: true,
      showEvents: true,
      showInput: true,
    },
  });
  const status = tx?.effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(tx.effects?.status?.error || `Transaction ${digest} failed`);
  }
  return tx;
}

async function executeTransaction(client, legacyClient, signer, transaction, digests) {
  transaction.setSenderIfNotSet(signer.toSuiAddress());
  const result = await client.signAndExecuteTransaction({
    signer,
    transaction,
    include: {
      effects: true,
    },
  });
  const digest = getDigest(result);
  if (!digest) {
    throw new Error('Transaction did not return a digest');
  }
  digests.push(digest);
  return waitForTx(legacyClient, digest);
}

async function getMarketSnapshot(legacyClient, marketId) {
  const marketObject = await legacyClient.getObject({
    id: marketId,
    options: { showContent: true, showType: true },
  });
  const fields = extractFields(marketObject.data?.content);
  if (!fields) throw new Error('Market object content is unavailable');
  return {
    owner: fields.owner,
    holders: Number(fields.holders ?? 0),
    graduated: Boolean(fields.graduated),
  };
}

async function resolveVaultMetadata(legacyClient, registryId, marketId) {
  const registryObject = await legacyClient.getObject({
    id: registryId,
    options: { showContent: true },
  });
  const registryFields = extractFields(registryObject.data?.content);
  const tableId = registryFields?.vault_by_market?.fields?.id?.id;
  if (!tableId) return null;

  try {
    const vaultEntry = await legacyClient.getDynamicFieldObject({
      parentId: tableId,
      name: { type: 'address', value: marketId },
    });
    const vaultId = extractFields(vaultEntry.data?.content)?.value;
    if (!vaultId) return null;

    const vaultObject = await legacyClient.getObject({
      id: vaultId,
      options: { showContent: true, showType: true },
    });
    return {
      vaultId,
      tokenType: parseVaultTokenType(vaultObject.data?.type || vaultObject.data?.content?.type),
      poolId: await resolveVaultPoolId(legacyClient, vaultId),
    };
  } catch {
    return null;
  }
}

async function resolveVaultPoolId(legacyClient, vaultId) {
  try {
    const poolField = await legacyClient.getDynamicFieldObject({
      parentId: vaultId,
      name: { type: 'u8', value: 0 },
    });
    const poolId = extractFields(poolField.data?.content)?.value;
    if (typeof poolId !== 'string' || /^0x0+$/.test(poolId)) return null;
    return normalizeAddress(poolId);
  } catch {
    return null;
  }
}

async function getRegistryAdmin(legacyClient, registryId) {
  const registryObject = await legacyClient.getObject({
    id: registryId,
    options: { showContent: true },
  });
  const fields = extractFields(registryObject.data?.content);
  return fields?.admin ? normalizeAddress(fields.admin) : null;
}

async function findOwnedTreasuryCap(legacyClient, owner, tokenType) {
  const response = await legacyClient.getOwnedObjects({
    owner,
    filter: {
      StructType: `0x2::coin::TreasuryCap<${tokenType}>`,
    },
    options: { showType: true },
  });
  return response.data?.[0]?.data?.objectId || null;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Missing graduation operator input path');
  }

  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const network = input.network === 'mainnet' ? 'mainnet' : input.network === 'devnet' ? 'devnet' : 'testnet';
  const operatorPrivateKey = requireValue(
    process.env.GRADUATION_OPERATOR_PRIVATE_KEY,
    'Missing GRADUATION_OPERATOR_PRIVATE_KEY',
  );
  const signer = keypairFromPrivateKey(operatorPrivateKey);
  const operatorAddress = normalizeAddress(input.operatorAddress);
  const derivedAddress = signer.toSuiAddress();
  if (derivedAddress.toLowerCase() !== operatorAddress.toLowerCase()) {
    throw new Error(
      `Operator address mismatch: configured ${operatorAddress}, derived ${derivedAddress}`,
    );
  }

  const client = new SuiJsonRpcClient({ url: input.rpcUrl, network });
  const legacyClient = new LegacySuiClient({ url: input.rpcUrl });
  const digests = [];

  const ownerAddress = normalizeAddress(input.ownerAddress);
  const marketId = normalizeAddress(input.marketId);
  const contractPackageId = normalizeAddress(input.contractPackageId);
  const graduationRegistryId = normalizeAddress(input.graduationRegistryId);

  const market = await getMarketSnapshot(legacyClient, marketId);
  const registryAdmin = await getRegistryAdmin(legacyClient, graduationRegistryId);
  if (!registryAdmin || registryAdmin.toLowerCase() !== operatorAddress.toLowerCase()) {
    throw new Error(
      `Graduation registry admin ${registryAdmin || 'unknown'} does not match the configured operator ${operatorAddress}`,
    );
  }
  if (normalizeAddress(market.owner).toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new Error('Market owner does not match the authorized creator');
  }
  if (market.holders <= 0) {
    throw new Error('Market has no holders');
  }

  let vaultMetadata =
    (input.existingVaultId && {
      vaultId: normalizeAddress(input.existingVaultId),
      tokenType: input.existingTokenType,
    }) ||
    (await resolveVaultMetadata(legacyClient, graduationRegistryId, marketId));

  let tokenType = vaultMetadata?.tokenType || input.existingTokenType || null;
  let packageId = input.existingPackageId || (tokenType ? tokenType.split('::')[0] : null);
  let vaultId = vaultMetadata?.vaultId || input.existingVaultId || null;
  let poolId = vaultMetadata?.poolId || input.existingPoolId || null;

  if (!vaultId) {
    let treasuryCapId = tokenType ? await findOwnedTreasuryCap(legacyClient, operatorAddress, tokenType) : null;
    if (!tokenType || !treasuryCapId) {
      const build = requireValue(input.packageBuild, 'Missing package build for token launch');
      const publishTx = new Transaction();
      const upgradeCap = publishTx.publish({
        modules: build.modules,
        dependencies: build.dependencies,
      });
      publishTx.transferObjects([upgradeCap], publishTx.pure.address(operatorAddress));

      const publishBlock = await executeTransaction(client, legacyClient, signer, publishTx, digests);
      const objectChanges = publishBlock.objectChanges || [];
      packageId =
        objectChanges.find((change) => change.type === 'published' && typeof change.packageId === 'string')
          ?.packageId || null;
      if (!packageId) {
        throw new Error('Published package ID not found');
      }
      tokenType = `${normalizeAddress(packageId)}::${build.module_name}::${build.type_name}`;
      treasuryCapId =
        objectChanges.find(
          (change) =>
            change.type === 'created' &&
            change.objectType === `0x2::coin::TreasuryCap<${tokenType}>` &&
            typeof change.objectId === 'string',
        )?.objectId || null;
      if (!treasuryCapId) {
        treasuryCapId = await findOwnedTreasuryCap(legacyClient, operatorAddress, tokenType);
      }
    }

    if (!treasuryCapId || !tokenType) {
      throw new Error('TreasuryCap for creator token was not found');
    }

    if (!market.graduated) {
      const graduateTx = new Transaction();
      graduateTx.moveCall({
        target: `${contractPackageId}::graduation::graduate`,
        arguments: [
          graduateTx.object(graduationRegistryId),
          graduateTx.object(marketId),
        ],
      });
      await executeTransaction(client, legacyClient, signer, graduateTx, digests);
    }

    const registerTx = new Transaction();
    const encoder = new TextEncoder();
    registerTx.moveCall({
      target: `${contractPackageId}::graduation::register_creator_token`,
      typeArguments: [tokenType],
      arguments: [
        registerTx.object(graduationRegistryId),
        registerTx.object(marketId),
        registerTx.object(treasuryCapId),
        registerTx.pure.vector('u8', Array.from(encoder.encode(input.tokenSymbol.trim().toUpperCase()))),
        registerTx.pure.vector('u8', Array.from(encoder.encode(input.tokenName.trim()))),
      ],
    });

    const registerBlock = await executeTransaction(client, legacyClient, signer, registerTx, digests);
    vaultId =
      registerBlock.objectChanges?.find(
        (change) =>
          change.type === 'created' &&
          typeof change.objectType === 'string' &&
          change.objectType.includes('::graduation::CreatorTokenVault<') &&
          typeof change.objectId === 'string',
      )?.objectId || null;

    if (!vaultId) {
      vaultMetadata = await resolveVaultMetadata(legacyClient, graduationRegistryId, marketId);
      vaultId = vaultMetadata?.vaultId || null;
    }
    if (!vaultId) {
      throw new Error('Creator token vault was not found after registration');
    }
  }

  vaultMetadata = await resolveVaultMetadata(legacyClient, graduationRegistryId, marketId);
  vaultId = vaultMetadata?.vaultId || vaultId;
  tokenType = vaultMetadata?.tokenType || tokenType;
  poolId = vaultMetadata?.poolId || poolId;

  if (!vaultId || !tokenType) {
    throw new Error('Vault metadata is incomplete after registration');
  }

  if (!poolId) {
    const liquidityTokenAmount = calculateInitialTokenLiquidity(market.holders);
    const initializeAmmTx = new Transaction();
    initializeAmmTx.moveCall({
      target: `${contractPackageId}::graduation::initialize_amm_pool`,
      typeArguments: [tokenType],
      arguments: [
        initializeAmmTx.object(graduationRegistryId),
        initializeAmmTx.object(marketId),
        initializeAmmTx.object(vaultId),
        initializeAmmTx.pure.u64(liquidityTokenAmount.toString()),
        initializeAmmTx.pure.u64(DEFAULT_AMM_FEE_BPS.toString()),
      ],
    });
    await executeTransaction(client, legacyClient, signer, initializeAmmTx, digests);

    vaultMetadata = await resolveVaultMetadata(legacyClient, graduationRegistryId, marketId);
    poolId = vaultMetadata?.poolId || null;
    if (!poolId) {
      throw new Error('AMM pool was not found after initialization');
    }
  }

  process.stdout.write(
    JSON.stringify({
      package_id: packageId ? normalizeAddress(packageId) : null,
      token_type: tokenType,
      vault_id: vaultId ? normalizeAddress(vaultId) : null,
      pool_id: poolId ? normalizeAddress(poolId) : null,
      tx_digests: digests,
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message);
  process.exit(1);
});
