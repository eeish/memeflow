import type { SuiTransactionBlockResponseOptions } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { Transaction } from '@mysten/sui/transactions';
import {
  genAddressSeed,
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  getZkLoginSignature,
  jwtToAddress,
} from '@mysten/zklogin';
import { decodeJwt } from 'jose';
import { API_BASE_URL } from './api';

const PROVER_URL = `${API_BASE_URL}/zklogin/proof`;

export const ZKLOGIN_LEGACY_ADDRESS = false;

export const ZKLOGIN_STORAGE_KEYS = {
  EPHEMERAL_KEY: 'zklogin_ephemeral_key',
  RANDOMNESS: 'zklogin_randomness',
  MAX_EPOCH: 'zklogin_max_epoch',
  NONCE: 'zklogin_nonce',
  SESSION: 'zklogin_session',
  JWT: 'zklogin_jwt',
  ADDRESS: 'zklogin_address',
  USER_SALT: 'zklogin_user_salt',
  PROOF_INPUTS: 'zklogin_proof_inputs',
} as const;

export interface ZkLoginSession {
  ephemeralSecretKey: string;
  randomness: string;
  maxEpoch: number;
  nonce: string;
}

export interface ZkLoginProofInputs {
  proofPoints: {
    a: string[];
    b: string[][];
    c: string[];
  };
  issBase64Details: {
    value: string;
    indexMod4: number;
  };
  headerBase64: string;
  addressSeed: string;
}

interface JwtClaims {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  name?: string;
  nonce?: string;
  picture?: string;
  sub?: string;
}

export function saveZkLoginSession(session: ZkLoginSession) {
  sessionStorage.setItem(ZKLOGIN_STORAGE_KEYS.SESSION, JSON.stringify(session));
  sessionStorage.setItem(ZKLOGIN_STORAGE_KEYS.EPHEMERAL_KEY, session.ephemeralSecretKey);
  sessionStorage.setItem(ZKLOGIN_STORAGE_KEYS.RANDOMNESS, session.randomness);
  sessionStorage.setItem(ZKLOGIN_STORAGE_KEYS.MAX_EPOCH, session.maxEpoch.toString());
  sessionStorage.setItem(ZKLOGIN_STORAGE_KEYS.NONCE, session.nonce);
}

export function loadZkLoginSession(): ZkLoginSession | null {
  const raw = sessionStorage.getItem(ZKLOGIN_STORAGE_KEYS.SESSION);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ZkLoginSession;
    if (
      !parsed ||
      typeof parsed.ephemeralSecretKey !== 'string' ||
      typeof parsed.randomness !== 'string' ||
      typeof parsed.maxEpoch !== 'number' ||
      typeof parsed.nonce !== 'string'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function requireZkLoginSession(): ZkLoginSession {
  const session = loadZkLoginSession();
  if (!session) {
    throw new Error('Missing zkLogin session. Please restart login.');
  }

  return session;
}

export function buildZkLoginEphemeralKeyPair(session: ZkLoginSession): Ed25519Keypair {
  if (!session.ephemeralSecretKey) {
    throw new Error('Missing ephemeral key. Please restart login.');
  }

  return Ed25519Keypair.fromSecretKey(session.ephemeralSecretKey);
}

export function createZkLoginSession(maxEpoch: number): ZkLoginSession {
  const keypair = new Ed25519Keypair();
  const randomness = generateRandomness();
  const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);

  return {
    ephemeralSecretKey: keypair.getSecretKey(),
    randomness,
    maxEpoch,
    nonce,
  };
}

export function storeZkLoginProofInputs(inputs: ZkLoginProofInputs) {
  sessionStorage.setItem(ZKLOGIN_STORAGE_KEYS.PROOF_INPUTS, JSON.stringify(inputs));
}

export function loadZkLoginProofInputs(): ZkLoginProofInputs | null {
  const raw = sessionStorage.getItem(ZKLOGIN_STORAGE_KEYS.PROOF_INPUTS);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ZkLoginProofInputs;
    if (!parsed?.proofPoints || !parsed?.issBase64Details || !parsed?.headerBase64 || !parsed?.addressSeed) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearZkLoginSession() {
  Object.values(ZKLOGIN_STORAGE_KEYS).forEach((key) => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  });
}

export function decodeZkLoginJwt(jwt: string): JwtClaims {
  return decodeJwt(jwt) as JwtClaims;
}

function resolveAudience(aud: JwtClaims['aud']): string {
  if (Array.isArray(aud)) {
    if (!aud[0]) {
      throw new Error('Missing audience in id_token. Please restart login.');
    }

    return aud[0];
  }

  if (!aud) {
    throw new Error('Missing audience in id_token. Please restart login.');
  }

  return aud;
}

export function deriveZkLoginAddress(jwt: string, userSalt: string) {
  return jwtToAddress(jwt, userSalt, ZKLOGIN_LEGACY_ADDRESS);
}

export async function fetchZkLoginProofInputs(jwt: string, userSalt: string): Promise<ZkLoginProofInputs> {
  const decoded = decodeZkLoginJwt(jwt);
  const session = requireZkLoginSession();
  const ephemeralKeyPair = buildZkLoginEphemeralKeyPair(session);
  const aud = resolveAudience(decoded.aud);

  if (!decoded.nonce || !decoded.sub) {
    throw new Error('Invalid zkLogin token. Please restart login.');
  }

  const recomputedNonce = generateNonce(
    ephemeralKeyPair.getPublicKey(),
    session.maxEpoch,
    session.randomness
  );

  if (decoded.nonce !== recomputedNonce) {
    throw new Error('zkLogin nonce mismatch. Please restart login.');
  }

  const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(ephemeralKeyPair.getPublicKey());
  const response = await fetch(PROVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jwt,
      extendedEphemeralPublicKey,
      maxEpoch: session.maxEpoch,
      jwtRandomness: session.randomness,
      salt: userSalt,
      keyClaimName: 'sub',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Prover error:', errorText);
    throw new Error('Failed to generate zkLogin proof');
  }

  const proofResponse = await response.json();
  const inputs: ZkLoginProofInputs = {
    proofPoints: proofResponse.proofPoints,
    issBase64Details: proofResponse.issBase64Details,
    headerBase64: proofResponse.headerBase64,
    addressSeed:
      proofResponse.addressSeed ??
      genAddressSeed(userSalt, 'sub', decoded.sub, aud).toString(),
  };

  storeZkLoginProofInputs(inputs);
  return inputs;
}

export async function ensureZkLoginProofInputs(): Promise<ZkLoginProofInputs> {
  const cachedInputs = loadZkLoginProofInputs();
  if (cachedInputs) {
    return cachedInputs;
  }

  const jwt = sessionStorage.getItem(ZKLOGIN_STORAGE_KEYS.JWT);
  const userSalt = localStorage.getItem(ZKLOGIN_STORAGE_KEYS.USER_SALT);

  if (!jwt || !userSalt) {
    throw new Error('zkLogin proof is unavailable. Please sign in again.');
  }

  return fetchZkLoginProofInputs(jwt, userSalt);
}

export async function executeZkLoginTransaction(params: {
  client: { executeTransactionBlock: (input: { transactionBlock: Uint8Array; signature: string; options?: SuiTransactionBlockResponseOptions }) => Promise<unknown> };
  transaction: Transaction;
  sender: string;
  options?: SuiTransactionBlockResponseOptions;
}) {
  const { client, transaction, sender, options } = params;
  const session = requireZkLoginSession();
  const proofInputs = await ensureZkLoginProofInputs();
  const ephemeralKeyPair = buildZkLoginEphemeralKeyPair(session);

  transaction.setSenderIfNotSet(sender);
  const txBytes = await transaction.build({ client });
  const { signature: userSignature } = await ephemeralKeyPair.signTransaction(txBytes);
  const zkLoginSignature = getZkLoginSignature({
    inputs: proofInputs,
    maxEpoch: session.maxEpoch,
    userSignature,
  });

  return client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: zkLoginSignature,
    options,
  });
}
