#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { requestSuiFromFaucetV2, getFaucetHost, FaucetRateLimitError } from '@mysten/sui/faucet';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';

const NETWORK = 'testnet';
const RPC_URL = 'https://fullnode.testnet.sui.io:443';
const SUI_COIN_TYPE = '0x2::sui::SUI';
const DEFAULT_ATTEMPTS = 1;
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BALANCE_POLL_MS = 5_000;
const DEFAULT_SETTLE_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 20;

function loadEnvFiles() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'scripts/.env'),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;

    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function parseArgs(argv) {
  const parsed = {
    attempts: DEFAULT_ATTEMPTS,
    intervalMs: DEFAULT_INTERVAL_MS,
    balancePollMs: DEFAULT_BALANCE_POLL_MS,
    watchBalance: false,
    privateKey:
      process.env.TESTNET_FAUCET_PRIVATE_KEY ||
      process.env.GRADUATION_OPERATOR_PRIVATE_KEY ||
      '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--attempts') {
      parsed.attempts = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--interval-ms') {
      parsed.intervalMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--balance-poll-ms') {
      parsed.balancePollMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--watch-balance') {
      parsed.watchBalance = true;
      continue;
    }
    if (arg === '--private-key') {
      parsed.privateKey = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/claim-testnet-sui.mjs [--attempts 1] [--interval-ms 60000] [--balance-poll-ms 5000] [--watch-balance] [--private-key suiprivkey...]

Claims testnet SUI from the official faucet with detailed logging and live balance polling.
This script is intentionally bounded. It does not run an infinite claim loop.

Environment:
  TESTNET_FAUCET_PRIVATE_KEY     Preferred private key source
  GRADUATION_OPERATOR_PRIVATE_KEY Fallback private key source

Examples:
  node scripts/claim-testnet-sui.mjs
  node scripts/claim-testnet-sui.mjs --attempts 3 --interval-ms 90000
  node scripts/claim-testnet-sui.mjs --watch-balance
`);
      process.exit(0);
    }
  }

  if (!Number.isInteger(parsed.attempts) || parsed.attempts <= 0 || parsed.attempts > MAX_ATTEMPTS) {
    throw new Error(`--attempts must be an integer between 1 and ${MAX_ATTEMPTS}.`);
  }
  if (!Number.isFinite(parsed.intervalMs) || parsed.intervalMs < 30_000) {
    throw new Error('--interval-ms must be at least 30000.');
  }
  if (!Number.isFinite(parsed.balancePollMs) || parsed.balancePollMs < 1_000) {
    throw new Error('--balance-poll-ms must be at least 1000.');
  }

  return parsed;
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
      throw new Error(`Unsupported key scheme: ${parsed.scheme}`);
  }
}

function now() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`[${now()}] ${message}`);
}

function formatSui(mist) {
  return (Number(mist) / 1e9).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSuiBalance(client, owner) {
  return client.getBalance({ owner, coinType: SUI_COIN_TYPE });
}

async function waitForBalanceIncrease(client, owner, previousBalance, pollMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DEFAULT_SETTLE_TIMEOUT_MS) {
    const current = await getSuiBalance(client, owner);
    log(`Current SUI balance: ${formatSui(current.totalBalance)} SUI`);
    if (BigInt(current.totalBalance) > BigInt(previousBalance)) {
      return current;
    }
    await sleep(pollMs);
  }

  return getSuiBalance(client, owner);
}

async function watchBalanceLoop(client, owner, pollMs) {
  for (;;) {
    const current = await getSuiBalance(client, owner);
    log(`Current SUI balance: ${formatSui(current.totalBalance)} SUI`);
    await sleep(pollMs);
  }
}

async function claimOnce(client, owner) {
  const host = getFaucetHost(NETWORK);
  log(`Requesting faucet funds from ${host} for ${owner}`);
  return requestSuiFromFaucetV2({
    host,
    recipient: owner,
  });
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  if (!args.privateKey) {
    throw new Error(
      'Missing private key. Set TESTNET_FAUCET_PRIVATE_KEY or GRADUATION_OPERATOR_PRIVATE_KEY, or pass --private-key.',
    );
  }

  const signer = keypairFromPrivateKey(args.privateKey);
  const address = signer.toSuiAddress();
  const client = new SuiJsonRpcClient({ url: RPC_URL, network: NETWORK });

  log(`Wallet address: ${address}`);
  log(`Network: ${NETWORK}`);
  log(`RPC URL: ${RPC_URL}`);

  const startingBalance = await getSuiBalance(client, address);
  log(`Starting SUI balance: ${formatSui(startingBalance.totalBalance)} SUI`);

  let previousBalance = startingBalance.totalBalance;

  for (let attempt = 1; attempt <= args.attempts; attempt += 1) {
    log(`Claim attempt ${attempt}/${args.attempts}`);

    try {
      const response = await claimOnce(client, address);
      const coins = response.coins_sent || [];
      if (coins.length === 0) {
        log('Faucet returned success but no coin records were included.');
      } else {
        for (const coin of coins) {
          log(
            `Faucet sent ${formatSui(coin.amount)} SUI via coin ${coin.id} in tx ${coin.transferTxDigest}`,
          );
        }
      }
    } catch (error) {
      if (error instanceof FaucetRateLimitError) {
        log(`Faucet rate-limited this address or client: ${error.message}`);
        break;
      }
      throw error;
    }

    const settledBalance = await waitForBalanceIncrease(
      client,
      address,
      previousBalance,
      args.balancePollMs,
    );
    const delta = BigInt(settledBalance.totalBalance) - BigInt(previousBalance);
    log(`Settled SUI balance: ${formatSui(settledBalance.totalBalance)} SUI`);
    log(`Balance delta: ${formatSui(delta)} SUI`);
    previousBalance = settledBalance.totalBalance;

    if (attempt < args.attempts) {
      log(`Waiting ${args.intervalMs} ms before the next claim attempt`);
      await sleep(args.intervalMs);
    }
  }

  if (args.watchBalance) {
    log(`Continuing with balance watch mode at ${args.balancePollMs} ms intervals`);
    await watchBalanceLoop(client, address, args.balancePollMs);
  }
}

main().catch((error) => {
  console.error(`\n[${now()}] Faucet claim failed`);
  if (error instanceof Error) {
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
