/**
 * Sui zkLogin Hook
 *
 * Implements zkLogin authentication flow with Google OAuth.
 * Allows users to sign in with their Google account and derive a Sui address.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { API_BASE_URL } from '../lib/api';
import {
  clearZkLoginSession,
  createZkLoginSession,
  decodeZkLoginJwt,
  deriveZkLoginAddress,
  fetchZkLoginProofInputs,
  requireZkLoginSession,
  saveZkLoginSession,
  ZKLOGIN_STORAGE_KEYS,
} from '../lib/zkLogin';

// zkLogin configuration
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const REDIRECT_URI = typeof window !== 'undefined'
  ? `${window.location.origin}/auth/callback`
  : '';

// Backend proxy endpoints (avoid browser CORS)
const SALT_SERVICE_URL = `${API_BASE_URL}/zklogin/salt`;

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
      const storedAddress = localStorage.getItem(ZKLOGIN_STORAGE_KEYS.ADDRESS);
      const storedJwt = sessionStorage.getItem(ZKLOGIN_STORAGE_KEYS.JWT);

      if (storedAddress && storedJwt) {
        try {
          // Decode JWT to get user info
          const decoded = decodeZkLoginJwt(storedJwt) as any;

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
      const session = createZkLoginSession(maxEpoch);
      saveZkLoginSession(session);
      const nonce = session.nonce;

      // Build Google OAuth URL
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce: nonce,
      });
      sessionStorage.setItem(ZKLOGIN_STORAGE_KEYS.NONCE, nonce);

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
    sessionStorage.setItem(ZKLOGIN_STORAGE_KEYS.JWT, jwt);

    // Decode JWT
    const decoded = decodeZkLoginJwt(jwt) as any;
    console.log('JWT decoded:', { sub: decoded.sub, email: decoded.email });

    if (!decoded.nonce) {
      throw new Error('Missing nonce in id_token. Please restart login.');
    }

    const session = requireZkLoginSession();
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
    localStorage.setItem(ZKLOGIN_STORAGE_KEYS.USER_SALT, salt);
    await fetchZkLoginProofInputs(jwt, salt);

    const address = deriveZkLoginAddress(jwt, salt);

    localStorage.setItem(ZKLOGIN_STORAGE_KEYS.ADDRESS, address);

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

  return {
    ...state,
    user: zkLoginUser,
    startGoogleLogin,
    signOut,
    isConfigured: !!GOOGLE_CLIENT_ID,
  };
}
