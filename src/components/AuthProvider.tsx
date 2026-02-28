import { createContext, useContext, useState, useEffect } from 'react';
import {
  useCurrentWallet,
  useConnectWallet,
  useDisconnectWallet,
  useWallets,
  useSignPersonalMessage
} from '@mysten/dapp-kit';
import { Button } from './ui-simple/Button';
import { Card } from './ui-simple/Card';
import { Alert, AlertDescription } from './ui-simple/Alert';
import { WalletPickerModal } from './ui-simple/WalletPickerModal';
import { Check, Wallet, Sparkles, Zap } from './ui-simple/Icons';
import { ProfileSetupFlow } from './ProfileSetupFlow';
import { useNetwork } from '../contexts/NetworkContext';
import { useZkLogin } from '../hooks/useZkLogin';

const AuthContext = createContext<any>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children, onAuthChange }: { children: any, onAuthChange?: any }) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showMemeLaunch, setShowMemeLaunch] = useState(false);
  const [pendingWalletAddress, setPendingWalletAddress] = useState<string>('');
  const [pendingAuthMethod, setPendingAuthMethod] = useState<'wallet' | 'zklogin'>('wallet');
  const [authenticatedWallet, setAuthenticatedWallet] = useState<string>(() => {
    // Initialize from localStorage to persist across refreshes
    return localStorage.getItem('authenticated_wallet') || '';
  });
  const [authChallenge, setAuthChallenge] = useState<string | null>(null);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [userInitiatedConnection, setUserInitiatedConnection] = useState(false);
  const [zkAuthenticating, setZkAuthenticating] = useState(false);

  // Wallet hooks
  const { currentWallet, connectionStatus, isConnecting } = useCurrentWallet();
  const { mutate: connect } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signPersonalMessage } = useSignPersonalMessage();
  const wallets = useWallets();

  // Network context
  const { networkConfig } = useNetwork();

  const {
    loading: zkLoading,
    error: zkError,
    address: zkAddress,
    isAuthenticated: zkAuthenticated,
    startGoogleLogin,
    signOut: zkLoginSignOut,
    isConfigured: zkLoginConfigured,
  } = useZkLogin();

  useEffect(() => {
    console.log('🏁 [AUTH_PROVIDER] Component mounted, starting initial auth check');
    checkAuth();
    
    return () => {
      console.log('🏁 [AUTH_PROVIDER] Component unmounting, cleaning up');
      localStorage.removeItem('wallet_processing');
    };
  }, []);

  useEffect(() => {
    onAuthChange?.(user);
  }, [user, onAuthChange]);

  useEffect(() => {
    if (!zkAuthenticated || !zkAddress || user || loading || zkAuthenticating) {
      return;
    }

    const runZkLoginAuthentication = async () => {
      setZkAuthenticating(true);
      setError('');

      try {
        const userExists = await checkUserExists(zkAddress);

        if (userExists) {
          await authenticateExistingUser(zkAddress, 'zklogin');
        } else {
          setPendingWalletAddress(zkAddress);
          setPendingAuthMethod('zklogin');
          setShowMemeLaunch(true);
          setSuccess('Google account authenticated! Let\'s create your profile.');
        }
      } catch (error: any) {
        console.error('❌ [ZKLOGIN_AUTH] Failed to authenticate:', error);
        setError(error.message || 'Failed to complete Google sign-in');
      } finally {
        setZkAuthenticating(false);
      }
    };

    runZkLoginAuthentication();
  }, [zkAuthenticated, zkAddress, user, loading, zkAuthenticating]);

  // Periodic authentication verification - check every 5 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (user?.authMethod === 'wallet') {
      interval = setInterval(() => {
        const currentWalletAddress = currentWallet?.accounts?.[0]?.address;

        // Skip verification if wallet is reconnecting (prevents false positives)
        if (connectionStatus === 'connecting') {
          console.log('⏸️ [PERIODIC_VERIFY] Wallet reconnecting - skipping verification');
          return;
        }

        // Critical security check: verify wallet is still connected and matches user
        if (!currentWalletAddress) {
          console.log('🚨 [PERIODIC_VERIFY] Wallet disconnected during session - forcing logout');
          forceLogout('Wallet was disconnected during your session');
        } else if (currentWalletAddress !== user.wallet_address) {
          console.log('🚨 [PERIODIC_VERIFY] Wallet address changed during session - forcing logout');
          forceLogout('Wallet address changed during your session');
        } else {
          console.log('✅ [PERIODIC_VERIFY] Authentication verified - wallet still connected and matches');
        }
      }, 5000); // Check every 5 seconds
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [user, currentWallet, connectionStatus]);

  // Contract error handling removed - no longer using token contracts

  // Wallet authentication function - accessible from anywhere in component
  const startWalletAuthentication = async (walletAddress: string) => {
    // Check if we already authenticated this wallet (persisted across refreshes)
    const storedAuthWallet = localStorage.getItem('authenticated_wallet');
    const existingUsername = localStorage.getItem('username');

    if ((authenticatedWallet === walletAddress || storedAuthWallet === walletAddress) && existingUsername) {
      console.log('🔐 [WALLET_AUTH] Wallet already authenticated with existing user, attempting restore');
      // Try to restore user data without requiring new signature
      const restored = await authenticateExistingUser(walletAddress);
      if (restored) {
        return;
      }
      // If restore failed, clear auth state and continue with new authentication
      console.log('⚠️ [WALLET_AUTH] User restore failed, proceeding with new authentication');
      localStorage.removeItem('authenticated_wallet');
      localStorage.removeItem('username');
      localStorage.removeItem('wallet_address');
      setAuthenticatedWallet('');
    }

    // Prevent infinite loop - check if we're already processing this wallet
    const isProcessing = localStorage.getItem('wallet_processing');
    if (isProcessing === walletAddress) {
      console.log('⏳ [WALLET_AUTH] Already processing wallet:', walletAddress);
      return;
    }

    try {
      console.log('🔄 [WALLET_AUTH] Starting Sui wallet authentication for:', walletAddress);
      localStorage.setItem('wallet_processing', walletAddress);
      setAuthenticating(true);
      setError('');

      // Generate authentication challenge
      const challenge = await generateAuthChallenge(walletAddress);
      console.log('🔐 [WALLET_AUTH] Generated authentication challenge');

      // Request user to sign the challenge
      await authenticateWithSignature(walletAddress, challenge);
    } catch (error: any) {
      console.error('❌ [WALLET_AUTH] Error during wallet authentication:', error);
      const errorMsg = error?.message || '';
      if (errorMsg.includes('rejected') || errorMsg.includes('declined')) {
        setError('Signature declined. Try again.');
      } else if (errorMsg.includes('timeout')) {
        setError('Connection failed. Please retry.');
      } else {
        setError('Connection failed. Please retry.');
      }
    } finally {
      console.log('🧹 [WALLET_AUTH] Cleaning up wallet processing for:', walletAddress);
      localStorage.removeItem('wallet_processing');
      setAuthenticating(false);
    }
  };

  // Handle wallet connection and authentication with strict enforcement
  useEffect(() => {
    console.log('🔄 [WALLET_EFFECT] Effect triggered - currentWallet:', !!currentWallet, 'loading:', loading, 'user:', !!user);

    const enforceStrictAuthentication = async () => {
      const currentWalletAddress = currentWallet?.accounts?.[0]?.address;
      console.log('🔐 [STRICT_AUTH] Current wallet address:', currentWalletAddress);
      console.log('🔐 [STRICT_AUTH] Authenticated user wallet:', user?.wallet_address);
      console.log('🔐 [STRICT_AUTH] Connection status:', connectionStatus);

      // CRITICAL: Wait for wallet to finish reconnecting before enforcing security checks
      // This prevents false logouts on page refresh when wallet is still connecting
      if (connectionStatus === 'connecting') {
        console.log('⏸️ [STRICT_AUTH] Wallet is reconnecting - skipping security checks');
        return;
      }

      // STRICT RULE 1: If user is logged in but wallet is disconnected, force logout
      // Only enforce this AFTER wallet has finished connection attempt
      if (user?.authMethod === 'wallet' && !currentWalletAddress) {
        console.log('🚨 [STRICT_AUTH] SECURITY VIOLATION: User authenticated but no wallet connected - FORCING LOGOUT');
        await forceLogout('Wallet disconnected');
        return;
      }

      // STRICT RULE 2: If user is logged in but wallet address doesn't match, force logout
      if (user?.authMethod === 'wallet' && currentWalletAddress && user.wallet_address !== currentWalletAddress) {
        console.log('🚨 [STRICT_AUTH] SECURITY VIOLATION: Wallet address mismatch - FORCING LOGOUT');
        console.log('🚨 [STRICT_AUTH] Expected:', user.wallet_address);
        console.log('🚨 [STRICT_AUTH] Actual:', currentWalletAddress);
        await forceLogout('Wallet address mismatch - please reconnect your wallet');
        return;
      }

      // RULE 3: Trigger authentication if user initiated connection and wallet is now connected
      if (userInitiatedConnection && currentWalletAddress && !user && !authenticating) {
        console.log('🚀 [STRICT_AUTH] User-initiated connection detected, starting authentication');
        setUserInitiatedConnection(false); // Reset flag to prevent re-triggering
        startWalletAuthentication(currentWalletAddress);
        return;
      }

      // STRICT RULE 4: Validate authentication is still valid
      if (user?.authMethod === 'wallet' && currentWalletAddress === user.wallet_address) {
        console.log('✅ [STRICT_AUTH] Authentication validated - wallet and user match');
        return;
      }

      // Log if wallet is connected but not authenticated (but don't take action on page load)
      if (currentWalletAddress && !user && !userInitiatedConnection) {
        console.log('ℹ️ [STRICT_AUTH] Wallet connected but user not authenticated - waiting for user action');
      }
    };

    // Only run strict authentication after initial auth check is complete
    if (!loading) {
      console.log('🎯 [STRICT_AUTH] Enforcing strict authentication');
      enforceStrictAuthentication();
    } else {
      console.log('⏸️ [STRICT_AUTH] Skipping - loading:', loading);
    }
  }, [currentWallet, user, loading, userInitiatedConnection, authenticating, connectionStatus]);

  const generateUsernameFromAddress = (address: string): string => {
    // Generate a readable username from wallet address
    // Take first 6 characters after 0x and make it more readable
    const shortAddr = address.slice(2, 8);
    const username = 'user' + shortAddr;
    return username.toLowerCase();
  };

  const forceLogout = async (reason: string) => {
    console.log('🚨 [FORCE_LOGOUT] Forcing logout due to:', reason);

    // Clear all authentication state
    setUser(null);
    setAuthenticatedWallet('');
    setShowMemeLaunch(false);
    setPendingWalletAddress('');
    // Don't set error on logout - user will see clean login screen
    setError('');
    setSuccess('');
    setLoading(false);
    
    // Clear all localStorage
    localStorage.removeItem('wallet_address');
    localStorage.removeItem('username');
    localStorage.removeItem('token_symbol');
    localStorage.removeItem('blockchain_tx');
    localStorage.removeItem('wallet_auth_completed');
    localStorage.removeItem('wallet_processing');
    localStorage.removeItem('authenticated_wallet');
    localStorage.removeItem('auth_method');

    if (user?.authMethod === 'zklogin') {
      zkLoginSignOut();
    }
    
    // Disconnect wallet if still connected
    if (currentWallet) {
      console.log('🚨 [FORCE_LOGOUT] Disconnecting wallet');
      disconnect();
    }
    
    console.log('🚨 [FORCE_LOGOUT] Logout completed');
  };

  // Sui Wallet Authentication Methods
  const generateAuthChallenge = async (walletAddress: string): Promise<string> => {
    try {
      console.log('🔐 [AUTH_CHALLENGE] Generating challenge for:', walletAddress);
      
      // Create a secure authentication challenge message
      const timestamp = Date.now();
      const nonce = Math.random().toString(36).substring(2, 15);
      const message = `Cord Authentication\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nSign this message to authenticate with Cord.`;
      
      setAuthChallenge(message);
      return message;
    } catch (error) {
      console.error('❌ [AUTH_CHALLENGE] Failed to generate challenge:', error);
      throw new Error('Failed to generate authentication challenge');
    }
  };

  const authenticateWithSignature = async (walletAddress: string, challenge: string): Promise<void> => {
    try {
      console.log('🔐 [AUTH_SIGNATURE] Requesting signature for challenge');
      
      // Request user to sign the authentication challenge
      return new Promise((resolve, reject) => {
        signPersonalMessage(
          {
            message: new TextEncoder().encode(challenge),
          },
          {
            onSuccess: async (result) => {
              console.log('✅ [AUTH_SIGNATURE] Message signed successfully');
              try {
                // Verify signature and complete authentication
                await completeWalletAuthentication(walletAddress, challenge, result.signature);
                resolve();
              } catch (error) {
                console.error('❌ [AUTH_SIGNATURE] Authentication completion failed:', error);
                reject(error);
              }
            },
            onError: (error) => {
              console.error('❌ [AUTH_SIGNATURE] Signature failed:', error);
              reject(new Error('User rejected signature request or signing failed'));
            },
          }
        );
      });
    } catch (error) {
      console.error('❌ [AUTH_SIGNATURE] Signature request failed:', error);
      throw new Error('Failed to request signature');
    }
  };

  const completeWalletAuthentication = async (walletAddress: string, challenge: string, signature: string): Promise<void> => {
    try {
      console.log('🔐 [AUTH_COMPLETE] Completing wallet authentication');
      
      // Verify signature on backend (this would be implemented on the backend)
      // For now, we'll proceed with user creation/authentication
      
      // Check if user already exists
      const userExists = await checkUserExists(walletAddress);
      console.log('📊 [AUTH_COMPLETE] User exists:', userExists);
      
      if (userExists) {
        // Existing user - fetch their profile
        console.log('✅ [AUTH_COMPLETE] Authenticating existing user');
        await authenticateExistingUser(walletAddress);
      } else {
        // New user - show meme launch page
        console.log('🆕 [AUTH_COMPLETE] New user detected, showing meme launch page');
        setPendingWalletAddress(walletAddress);
        setShowMemeLaunch(true);
        setSuccess('Wallet authenticated! Let\'s create your meme token!');
      }
      
      // Store successful authentication persistently
      localStorage.setItem('wallet_auth_completed', Date.now().toString());
      localStorage.setItem('authenticated_wallet', walletAddress);
      localStorage.setItem('auth_method', 'wallet');
      setAuthenticatedWallet(walletAddress);
      
    } catch (error) {
      console.error('❌ [AUTH_COMPLETE] Authentication completion failed:', error);
      throw new Error('Authentication verification failed');
    }
  };

  const authenticateExistingUser = async (walletAddress: string, authMethod: 'wallet' | 'zklogin' = 'wallet'): Promise<boolean> => {
    try {
      const response = await fetch(`http://localhost:3001/api/users/by-address/${walletAddress}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        console.log('✅ [AUTH_USER] User profile fetched successfully');
        const existingUser = {
          ...data.data,
          authMethod: authMethod as 'wallet' | 'zklogin',
          hasBlockchainToken: !!localStorage.getItem('blockchain_tx'),
          // Ensure consistent wallet_address property
          wallet_address: walletAddress
        };
        setUser(existingUser);
        setSuccess(`Welcome back, @${existingUser.username}!`);
        
        // Store auth info
        localStorage.setItem('wallet_address', walletAddress);
        localStorage.setItem('username', existingUser.username);
        localStorage.setItem('token_symbol', existingUser.token_symbol);
        localStorage.setItem('auth_method', authMethod);
        return true;
      } else {
        console.log('⚠️ [AUTH_USER] User not found in database');
        return false;
      }
    } catch (error) {
      console.error('❌ [AUTH_USER] Failed to authenticate existing user:', error);
      setError('Failed to load user profile');
      return false;
    }
  };

  // API service functions
  const checkUserExists = async (walletAddress: string): Promise<boolean> => {
    try {
      const response = await fetch(`http://localhost:3001/api/verify/user-exists/${walletAddress}`);
      const data = await response.json();
      return data.success && data.data === true;
    } catch (error) {
      console.error('Error checking user existence:', error);
      return false;
    }
  };

  const verifyWalletAddress = async (walletAddress: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/verify/address/${walletAddress}`);
      const data = await response.json();
      return data.success ? data.data : null;
    } catch (error) {
      console.error('Error verifying wallet address:', error);
      return null;
    }
  };

  const createUserWithWallet = async (userData: {
    walletAddress: string;
    username: string;
    bio?: string;
    avatarUrl?: string;
  }) => {
    try {
      console.log('📝 Creating user with data:', userData);
      
      const response = await fetch('http://localhost:3001/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: userData.walletAddress,
          username: userData.username,
          bio: userData.bio,
          avatar_url: userData.avatarUrl,
        }),
      });
      
      const data = await response.json();
      console.log('📬 Backend response:', { status: response.status, ok: response.ok, data });
      
      if (response.ok && data.success) {
        return data.data;
      } else {
        console.error('❌ Backend error details:', data);
        throw new Error(data.error || data.message || 'Failed to create user');
      }
    } catch (error: any) {
      console.error('❌ Error creating user:', error);
      
      // If it's a network error, provide more specific message
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to backend server. Please ensure the server is running.');
      }
      
      throw error;
    }
  };

  const checkAuth = async () => {
    try {
      console.log('🔍 [CHECK_AUTH] Starting authentication check...');
      console.log('🔍 [CHECK_AUTH] Current state - user:', !!user, 'loading:', loading);
      
      // Check for Sui wallet authentication
      const walletAddress = localStorage.getItem('wallet_address');
      const username = localStorage.getItem('username');
      const tokenSymbol = localStorage.getItem('token_symbol');
      const blockchainTx = localStorage.getItem('blockchain_tx');
      const authCompleted = localStorage.getItem('wallet_auth_completed');
      const authenticatedWalletStored = localStorage.getItem('authenticated_wallet');
      const authMethod = localStorage.getItem('auth_method') === 'zklogin' ? 'zklogin' : 'wallet';
      
      // Restore session if we have valid wallet authentication data
      if (walletAddress && username) {
        console.log('🔗 [CHECK_AUTH] Found authenticated wallet session:', { walletAddress, username });
        
        // Try to get user from backend to restore full profile
        // Backend is required for proper user ID (UUID) - no fallback to wallet address
        try {
          const response = await fetch(`http://localhost:3001/api/users/by-address/${walletAddress}`);
          const data = await response.json();

          if (data.success && data.data) {
            console.log('✅ Successfully restored user from backend:', data.data);
            const restoredUser = {
              ...data.data,
              authMethod: authMethod as 'wallet' | 'zklogin',
              hasBlockchainToken: !!blockchainTx,
              blockchainTx: blockchainTx || null,
              wallet_address: walletAddress // Ensure wallet_address is set
            };
            setUser(restoredUser);
            setAuthenticatedWallet(walletAddress);
            setSuccess(`Welcome back, @${restoredUser.username}!`);
            return;
          } else {
            // User not found in backend - clear stale localStorage and require re-auth
            console.warn('⚠️ User not found in backend, clearing stale session');
            localStorage.removeItem('wallet_address');
            localStorage.removeItem('username');
            localStorage.removeItem('token_symbol');
            localStorage.removeItem('authenticated_wallet');
            localStorage.removeItem('auth_method');
          }
        } catch (error) {
          console.warn('⚠️ Backend unavailable, cannot restore session:', error);
          // Don't use fallback - backend is required for proper user ID
          // Clear potentially stale data
          localStorage.removeItem('wallet_address');
          localStorage.removeItem('username');
          localStorage.removeItem('token_symbol');
          localStorage.removeItem('authenticated_wallet');
          localStorage.removeItem('auth_method');
        }

        // No fallback - user must authenticate properly through backend
        console.log('❌ [CHECK_AUTH] Could not restore user session - backend required');
        return;
      }

      console.log('❌ [CHECK_AUTH] No authenticated wallet session found');
    } catch (error) {
      console.error('Auth check failed:', error);
      // Only clear localStorage if there's a real error, not just missing data
      if (error instanceof Error && error.message.includes('network')) {
        console.warn('Network error during auth check, keeping localStorage');
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_email');
        localStorage.removeItem('username');
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('token_symbol');
        localStorage.removeItem('blockchain_tx');
        localStorage.removeItem('auth_method');
      }
    } finally {
      setLoading(false);
    }
  };


  const handleWalletConnect = async () => {
    setError('');

    // Check if any wallets are available
    if (wallets.length === 0) {
      setShowWalletPicker(true);
      return;
    }

    // Show wallet picker modal
    setShowWalletPicker(true);
  };

  const connectToWallet = async (walletToConnect: any) => {
    try {
      setLoading(true);
      setError('');
      setShowWalletPicker(false);

      // Clear any stale authentication state before connecting
      console.log('🔄 [WALLET_CONNECT] Starting fresh wallet connection');
      localStorage.removeItem('authenticated_wallet');
      localStorage.removeItem('wallet_processing');
      setAuthenticatedWallet('');

      // Mark that user initiated this connection
      setUserInitiatedConnection(true);

      connect(
        { wallet: walletToConnect },
        {
          onSuccess: () => {
            console.log('✅ [WALLET_CONNECT] Wallet connected successfully, authentication will start automatically');
            setSuccess('Wallet connected successfully!');
            setLoading(false);
          },
          onError: (error: any) => {
            console.error('Wallet connection error:', error);
            // Parse error for specific messages
            const errorMsg = error?.message || '';
            if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
              setError('Signature declined. Try again.');
            } else if (errorMsg.includes('timeout')) {
              setError('Connection failed. Please retry.');
            } else {
              setError('Connection failed. Please retry.');
            }
            setLoading(false);
            setUserInitiatedConnection(false); // Reset flag on error
          }
        }
      );
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      setError('Connection failed. Please retry.');
      setLoading(false);
      setUserInitiatedConnection(false); // Reset flag on error
    }
  };

  // Handle profile setup completion - on-chain profile is already created
  const handleMemeLaunchComplete = async (userData: {
    username: string;
  }) => {
    try {
      setLoading(true);
      setError('');

      console.log('🚀 Creating backend user', pendingAuthMethod === 'wallet' ? '(on-chain profile already created)' : '(zkLogin user)');
      console.log('🔑 Pending wallet address:', pendingWalletAddress);

      // Create user in backend database (on-chain profile was created in ProfileSetupFlow)
      const newUser = await createUserWithWallet({
        walletAddress: pendingWalletAddress,
        username: userData.username,
        bio: undefined,
        avatarUrl: undefined,
      });

      console.log('✅ Backend user created successfully');

      // Create user object for local state
      const userState = {
        ...newUser,
        wallet_address: pendingWalletAddress,
        authMethod: pendingAuthMethod as 'wallet' | 'zklogin',
        tokenSymbol: userData.username.toUpperCase(),
        hasOnChainProfile: pendingAuthMethod === 'wallet'
      };

      setUser(userState);
      setShowMemeLaunch(false);
      setPendingWalletAddress('');

      // Store auth info persistently
      localStorage.setItem('wallet_address', pendingWalletAddress);
      localStorage.setItem('username', userData.username);
      localStorage.setItem('token_symbol', userData.username.toUpperCase());
      localStorage.setItem('wallet_auth_completed', Date.now().toString());
      localStorage.setItem('authenticated_wallet', pendingWalletAddress);
      localStorage.setItem('auth_method', pendingAuthMethod);

      setSuccess(`Welcome to Cord, @${userData.username}!`);

    } catch (error: any) {
      console.error('Error creating backend user:', error);
      setError(error.message || 'Failed to complete profile setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle meme launch cancellation
  const handleMemeLaunchCancel = () => {
    const currentAuthMethod = pendingAuthMethod;
    setShowMemeLaunch(false);
    setPendingWalletAddress('');
    setPendingAuthMethod('wallet');
    
    // Disconnect wallet since user cancelled registration
    if (currentWallet) {
      disconnect();
    }

    if (currentAuthMethod === 'zklogin') {
      zkLoginSignOut();
    }
    
    setError('');
    setSuccess('');
  };


  const signOut = async () => {
    try {
      console.log('Signing out user:', user);
      
      // Clear all localStorage items
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_email');
      localStorage.removeItem('username');
      localStorage.removeItem('wallet_address');
      localStorage.removeItem('session_token');
      localStorage.removeItem('wallet_auth_completed');
      localStorage.removeItem('authenticated_wallet');
      localStorage.removeItem('token_symbol');
      localStorage.removeItem('blockchain_tx');
      localStorage.removeItem('auth_method');
      
      // Disconnect wallet if connected
      if (currentWallet) {
        console.log('Disconnecting wallet:', currentWallet);
        disconnect();
      }

      if (user?.authMethod === 'zklogin') {
        zkLoginSignOut();
      }
      
      // Reset all states
      setUser(null);
      setError('');
      setSuccess('');
      setLoading(false);
      setAuthenticatedWallet('');
      
      console.log('Sign out completed');
    } catch (error) {
      console.error('Sign out error:', error);
      // Even if there's an error, still clear the user state
      setUser(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-900 text-lg">Loading...</div>
      </div>
    );
  }

  // Show profile setup flow for new users
  if (showMemeLaunch && pendingWalletAddress) {
    console.log('🚀 [AUTH_PROVIDER] Rendering ProfileSetupFlow for:', pendingWalletAddress);
    return (
      <ProfileSetupFlow
        walletAddress={pendingWalletAddress}
        skipOnChain={false}
        onComplete={handleMemeLaunchComplete}
        onCancel={handleMemeLaunchCancel}
      />
    );
  }

  if (!user) {
    return (
      <>
        {/* Wallet Picker Modal */}
        <WalletPickerModal
          open={showWalletPicker}
          onClose={() => setShowWalletPicker(false)}
          wallets={wallets}
          onSelectWallet={connectToWallet}
          network="Sui"
        />

        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            {/* Logo/Brand */}
            <div className="text-center mb-12">
              <h1 className="text-4xl tracking-tight text-gray-900 mb-2">Cord</h1>
              <p className="text-sm text-gray-600">Connect your Sui wallet or sign in with Google</p>
            </div>

            {/* Error state */}
            {(error || zkError) && (
              <Alert variant="error" className="mb-6">
                <AlertDescription>{error || zkError}</AlertDescription>
              </Alert>
            )}

            {/* Waiting state */}
            {(authenticating || zkAuthenticating || zkLoading) && (
              <Alert className="mb-6">
                <AlertDescription>
                  <span className="font-medium">{authenticating ? 'Waiting for signature…' : 'Completing Google sign-in…'}</span>
                  <br />
                  <span className="text-xs text-gray-600">
                    {authenticating ? 'Check your wallet and approve the request.' : 'Returning you to Cord.'}
                  </span>
                </AlertDescription>
              </Alert>
            )}

            {/* Wallet Options */}
            <div className="space-y-3">
              <button
                onClick={handleWalletConnect}
                disabled={loading || authenticating || zkLoading || zkAuthenticating}
                className={`w-full bg-white border border-gray-200 p-4 hover:border-gray-300 transition-colors text-left ${
                  loading || authenticating || zkLoading || zkAuthenticating ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base text-gray-900 mb-1">Sui</div>
                    <div className="text-xs text-gray-500">Slush, Sui Wallet, Suiet, Ethos</div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex-shrink-0" />
                </div>
                {(loading || authenticating) && (
                  <div className="mt-3 text-xs text-gray-600">
                    {loading ? 'Connecting...' : 'Waiting for signature...'}
                  </div>
                )}
              </button>

              <button
                onClick={startGoogleLogin}
                disabled={!zkLoginConfigured || loading || authenticating || zkLoading || zkAuthenticating}
                className={`w-full bg-white border border-gray-200 p-4 hover:border-gray-300 transition-colors text-left ${
                  !zkLoginConfigured || loading || authenticating || zkLoading || zkAuthenticating ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base text-gray-900 mb-1">Google</div>
                    <div className="text-xs text-gray-500">Sign in with zkLogin</div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 to-red-400 flex-shrink-0" />
                </div>
                {(zkLoading || zkAuthenticating) && (
                  <div className="mt-3 text-xs text-gray-600">Redirecting to Google...</div>
                )}
              </button>

              {!zkLoginConfigured && (
                <div className="text-xs text-gray-500">
                  Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in.
                </div>
              )}

            </div>

            {/* Cancel button when authenticating */}
            {authenticating && (
              <Button
                onClick={() => {
                  setAuthenticating(false);
                  setError('');
                  localStorage.removeItem('wallet_processing');
                }}
                variant="outline"
                className="w-full h-10 text-sm mt-4"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </>
    );
  }

  // Refresh user data from backend
  const refreshUser = async () => {
    if (!user?.wallet_address) {
      console.log('⚠️ [REFRESH_USER] No wallet address to refresh');
      return;
    }

    try {
      console.log('🔄 [REFRESH_USER] Refreshing user data for:', user.wallet_address);
      const response = await fetch(`http://localhost:3001/api/users/by-address/${user.wallet_address}`);
      const data = await response.json();

      if (data.success && data.data) {
        console.log('✅ [REFRESH_USER] User data refreshed');
        const refreshedUser = {
          ...data.data,
          authMethod: 'wallet' as const,
          wallet_address: user.wallet_address
        };
        setUser(refreshedUser);

        // Update localStorage
        localStorage.setItem('username', refreshedUser.username);
        localStorage.setItem('token_symbol', refreshedUser.token_symbol);
      } else {
        console.warn('⚠️ [REFRESH_USER] Failed to refresh user data');
      }
    } catch (error) {
      console.error('❌ [REFRESH_USER] Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      signOut,
      loading,
      handleWalletConnect,
      currentWallet,
      showMemeLaunch,
      pendingWalletAddress,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};
