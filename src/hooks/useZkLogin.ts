/**
 * Sui zkLogin Hook
 *
 * Implements zkLogin authentication flow with Google OAuth.
 * Allows users to sign in with their Google account and derive a Sui address.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateNonce, generateRandomness, getExtendedEphemeralPublicKey, jwtToAddress } from '@mysten/zklogin';
import { decodeJwt } from 'jose';
import { useSuiClient } from '@mysten/dapp-kit';

// zkLogin configuration
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const REDIRECT_URI = typeof window !== 'undefined'
  ? `${window.location.origin}/auth/callback`
  : '';

// Backend proxy endpoints (avoid browser CORS)
const PROVER_URL = 'http://localhost:3001/api/zklogin/proof';
const SALT_SERVICE_URL = 'http://localhost:3001/api/zklogin/salt';

// Storage keys
const STORAGE_KEYS = {
  EPHEMERAL_KEY: 'zklogin_ephemeral_key',
  RANDOMNESS: 'zklogin_randomness',
  MAX_EPOCH: 'zklogin_max_epoch',
  NONCE: 'zklogin_nonce',
  SESSION: 'zklogin_session',
  JWT: 'zklogin_jwt',
  ADDRESS: 'zklogin_address',
  USER_SALT: 'zklogin_user_salt',
};

export interface ZkLoginState {
  loading: boolean;
  error: string | null;
  address: string | null;
  isAuthenticated: boolean;
}

export interface ZkLoginUser {
  address: string;
  email?: string;
  name?: string;
  picture?: string;
  sub: string; // Google user ID
}

interface ZkLoginSession {
  ephemeralSecretKey: string;
  randomness: string;
  maxEpoch: number;
  nonce: string;
}

 

function saveSession(session: ZkLoginSession) {
  sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  sessionStorage.setItem(STORAGE_KEYS.EPHEMERAL_KEY, session.ephemeralSecretKey);
  sessionStorage.setItem(STORAGE_KEYS.RANDOMNESS, session.randomness);
  sessionStorage.setItem(STORAGE_KEYS.MAX_EPOCH, session.maxEpoch.toString());
  sessionStorage.setItem(STORAGE_KEYS.NONCE, session.nonce);
}

function loadSession(): ZkLoginSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEYS.SESSION);
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

function requireSession(): ZkLoginSession {
  const session = loadSession();
  if (!session) {
    throw new Error('Missing zkLogin session. Please restart login.');
  }
  return session;
}

function buildEphemeralKeyPair(session: ZkLoginSession): Ed25519Keypair {
  if (!session.ephemeralSecretKey) {
    throw new Error('Missing ephemeral key. Please restart login.');
  }
  return Ed25519Keypair.fromSecretKey(session.ephemeralSecretKey);
}

function createSession(maxEpoch: number): ZkLoginSession {
  const keypair = new Ed25519Keypair();
  const secretKey = keypair.getSecretKey();
  const randomness = generateRandomness();
  const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);
  return {
    ephemeralSecretKey: secretKey,
    randomness,
    maxEpoch,
    nonce,
  };
}

/**
 * Clear zkLogin session data
 */
function clearZkLoginSession() {
  Object.values(STORAGE_KEYS).forEach(key => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  });
}

export function useZkLogin() {
  const suiClient = useSuiClient();
  const [state, setState] = useState<ZkLoginState>({
    loading: false,
    error: null,
    address: null,
    isAuthenticated: false,
  });
  const [zkLoginUser, setZkLoginUser] = useState<ZkLoginUser | null>(null);
  const callbackHandledRef = useRef(false);

  // Check for existing zkLogin session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      const storedAddress = localStorage.getItem(STORAGE_KEYS.ADDRESS);
      const storedJwt = sessionStorage.getItem(STORAGE_KEYS.JWT);

      if (storedAddress && storedJwt) {
        try {
          // Decode JWT to get user info
          const decoded = decodeJwt(storedJwt) as any;

          // Check if JWT is still valid
          if (decoded.exp && decoded.exp * 1000 > Date.now()) {
            setZkLoginUser({
              address: storedAddress,
              email: decoded.email,
              name: decoded.name,
              picture: decoded.picture,
              sub: decoded.sub,
            });
            setState(prev => ({
              ...prev,
              address: storedAddress,
              isAuthenticated: true,
            }));
          } else {
            // JWT expired, clear session
            clearZkLoginSession();
          }
        } catch (e) {
          console.error('Failed to decode stored JWT:', e);
          clearZkLoginSession();
        }
      }
    };

    checkExistingSession();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const handleCallback = async () => {
      // Check if we're on the callback URL
      if (!window.location.pathname.includes('/auth/callback')) return;

      // Get JWT from URL hash (Google uses fragment for implicit flow)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const idToken = hashParams.get('id_token');

      if (!idToken) {
        // Check for error
        const error = hashParams.get('error');
        if (error) {
          setState(prev => ({
            ...prev,
            error: `OAuth error: ${error}`,
            loading: false,
          }));
        }
        return;
      }

      if (callbackHandledRef.current) return;
      callbackHandledRef.current = true;
      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        await completeZkLogin(idToken);

        // Redirect back to home
        window.history.replaceState({}, '', '/');
      } catch (error: any) {
        console.error('zkLogin completion failed:', error);
        setState(prev => ({
          ...prev,
          error: error.message || 'Failed to complete zkLogin',
          loading: false,
        }));
      }
    };

    handleCallback();
  }, []);

  /**
   * Start Google OAuth flow for zkLogin
   */
  const startGoogleLogin = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      setState(prev => ({
        ...prev,
        error: 'Google OAuth not configured. Set VITE_GOOGLE_CLIENT_ID.',
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { epoch } = await suiClient.getLatestSuiSystemState();
      const maxEpoch = Number(epoch) + 10; // Valid for ~10 epochs

      // Always create a fresh session per login attempt
      clearZkLoginSession();
      const session = createSession(maxEpoch);
      saveSession(session);
      const nonce = session.nonce;

      // Build Google OAuth URL
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce: nonce,
      });
      sessionStorage.setItem(STORAGE_KEYS.NONCE, nonce);

      // Redirect to Google
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } catch (error: any) {
      console.error('Failed to start Google login:', error);
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to start Google login',
        loading: false,
      }));
    }
  }, [suiClient]);

  /**
   * Complete zkLogin after receiving JWT from Google
   */
  const completeZkLogin = async (jwt: string) => {
    // Store JWT
    sessionStorage.setItem(STORAGE_KEYS.JWT, jwt);

    // Decode JWT
    const decoded = decodeJwt(jwt) as any;
    console.log('JWT decoded:', { sub: decoded.sub, email: decoded.email });

    if (!decoded.nonce) {
      throw new Error('Missing nonce in id_token. Please restart login.');
    }

    const session = requireSession();
    if (decoded.nonce !== session.nonce) {
      throw new Error('zkLogin nonce mismatch. Please restart login.');
    }

    // Get user salt from salt service
    const saltResponse = await fetch(SALT_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: jwt }),
    });

    if (!saltResponse.ok) {
      throw new Error('Failed to get user salt');
    }

    const { salt } = await saltResponse.json();
    localStorage.setItem(STORAGE_KEYS.USER_SALT, salt);

    // Get ephemeral keypair and session values
    const ephemeralKeyPair = buildEphemeralKeyPair(session);
    const maxEpoch = session.maxEpoch;
    const jwtRandomness = session.randomness;

    const recomputedNonce = generateNonce(
      ephemeralKeyPair.getPublicKey(),
      maxEpoch,
      jwtRandomness
    );

    if (decoded.nonce !== recomputedNonce) {
      console.warn('zkLogin nonce mismatch details:', {
        jwtNonce: decoded.nonce,
        storedNonce: session.nonce,
        recomputedNonce,
      });
      throw new Error('zkLogin nonce mismatch. Please restart login.');
    }

    // Get extended ephemeral public key
    const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
      ephemeralKeyPair.getPublicKey()
    );

    // Get zkLogin proof from prover
    const proofResponse = await fetch(PROVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt,
        extendedEphemeralPublicKey,
        maxEpoch,
        jwtRandomness,
        salt,
        keyClaimName: 'sub',
      }),
    });

    if (!proofResponse.ok) {
      const errorText = await proofResponse.text();
      console.error('Prover error:', errorText);
      throw new Error('Failed to generate zkLogin proof');
    }

    const { proofPoints, issBase64Details, headerBase64 } = await proofResponse.json();

    const address = jwtToAddress(jwt, salt);

    localStorage.setItem(STORAGE_KEYS.ADDRESS, address);

    // Update state
    const user: ZkLoginUser = {
      address,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
      sub: decoded.sub,
    };

    setZkLoginUser(user);
    setState({
      loading: false,
      error: null,
      address,
      isAuthenticated: true,
    });

    return user;
  };

  /**
   * Sign out and clear zkLogin session
   */
  const signOut = useCallback(() => {
    clearZkLoginSession();
    setZkLoginUser(null);
    setState({
      loading: false,
      error: null,
      address: null,
      isAuthenticated: false,
    });
  }, []);

  /**
   * Get zkLogin signature for a transaction
   */
  const getSignature = useCallback(async (txBytes: Uint8Array) => {
    const jwt = sessionStorage.getItem(STORAGE_KEYS.JWT);
    const salt = localStorage.getItem(STORAGE_KEYS.USER_SALT);

    if (!jwt || !salt) {
      throw new Error('zkLogin session not found');
    }

    const session = requireSession();
    const ephemeralKeyPair = buildEphemeralKeyPair(session);

    // Sign the transaction with ephemeral key
    const ephemeralSignature = await ephemeralKeyPair.signTransaction(txBytes);

    // Get the zkLogin signature
    // This would combine the ephemeral signature with the zkProof
    // For full implementation, store and use the proof from completeZkLogin

    return ephemeralSignature;
  }, []);

  return {
    ...state,
    user: zkLoginUser,
    startGoogleLogin,
    signOut,
    getSignature,
    isConfigured: !!GOOGLE_CLIENT_ID,
  };
}
