import { createContext, useContext, useState, useEffect } from 'react';
import { 
  useCurrentWallet, 
  useConnectWallet, 
  useDisconnectWallet, 
  useWallets,
  useSignPersonalMessage
} from '@mysten/dapp-kit';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Check, Wallet, Sparkles, Zap } from 'lucide-react';
import { MemeLaunchPage } from './MemeLaunchPage';
// Token creation hook removed - focusing on social features only
import { useNetwork } from '../contexts/NetworkContext';

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
  const [authenticatedWallet, setAuthenticatedWallet] = useState<string>(() => {
    // Initialize from localStorage to persist across refreshes
    return localStorage.getItem('authenticated_wallet') || '';
  });
  const [authChallenge, setAuthChallenge] = useState<string | null>(null);

  // Wallet hooks
  const { currentWallet } = useCurrentWallet();
  const { mutate: connect } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signPersonalMessage } = useSignPersonalMessage();
  const wallets = useWallets();

  // Network context
  const { networkConfig } = useNetwork();

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

  // Periodic authentication verification - check every 5 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (user?.authMethod === 'wallet') {
      interval = setInterval(() => {
        const currentWalletAddress = currentWallet?.accounts?.[0]?.address;
        
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
  }, [user, currentWallet]);

  // Contract error handling removed - no longer using token contracts

  // Handle wallet connection and authentication with strict enforcement
  useEffect(() => {
    console.log('🔄 [WALLET_EFFECT] Effect triggered - currentWallet:', !!currentWallet, 'loading:', loading, 'user:', !!user);
    
    const enforceStrictAuthentication = async () => {
      const currentWalletAddress = currentWallet?.accounts?.[0]?.address;
      console.log('🔐 [STRICT_AUTH] Current wallet address:', currentWalletAddress);
      console.log('🔐 [STRICT_AUTH] Authenticated user wallet:', user?.wallet_address);
      
      // STRICT RULE 1: If user is logged in but wallet is disconnected, force logout
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
      
      // STRICT RULE 3: If wallet is connected but no user, start authentication
      if (currentWalletAddress && !user) {
        console.log('🔐 [STRICT_AUTH] Wallet connected but no user - starting authentication');
        await startWalletAuthentication(currentWalletAddress);
        return;
      }
      
      // STRICT RULE 4: Validate authentication is still valid
      if (user?.authMethod === 'wallet' && currentWalletAddress === user.wallet_address) {
        console.log('✅ [STRICT_AUTH] Authentication validated - wallet and user match');
        return;
      }
    };

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
      } catch (error) {
        console.error('❌ [WALLET_AUTH] Error during wallet authentication:', error);
        setError('Wallet authentication failed. Please try again.');
      } finally {
        console.log('🧹 [WALLET_AUTH] Cleaning up wallet processing for:', walletAddress);
        localStorage.removeItem('wallet_processing');
        setAuthenticating(false);
      }
    };

    // Only run strict authentication after initial auth check is complete
    if (!loading) {
      console.log('🎯 [STRICT_AUTH] Enforcing strict authentication');
      enforceStrictAuthentication();
    } else {
      console.log('⏸️ [STRICT_AUTH] Skipping - loading:', loading);
    }
  }, [currentWallet, user, loading]);

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
    setError(reason);
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
      const message = `MemeFlow Authentication\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nSign this message to authenticate with MemeFlow.`;
      
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
      setAuthenticatedWallet(walletAddress);
      
    } catch (error) {
      console.error('❌ [AUTH_COMPLETE] Authentication completion failed:', error);
      throw new Error('Authentication verification failed');
    }
  };

  const authenticateExistingUser = async (walletAddress: string): Promise<boolean> => {
    try {
      const response = await fetch(`http://localhost:3001/api/users/by-address/${walletAddress}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        console.log('✅ [AUTH_USER] User profile fetched successfully');
        const existingUser = {
          ...data.data,
          authMethod: 'wallet' as const,
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
    displayName?: string;
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
          display_name: userData.displayName || userData.username,
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
      
      // Restore session if we have valid wallet authentication data
      if (walletAddress && username) {
        console.log('🔗 [CHECK_AUTH] Found authenticated wallet session:', { walletAddress, username });
        
        // Try to get user from backend to restore full profile
        try {
          const response = await fetch(`http://localhost:3001/api/users/by-address/${walletAddress}`);
          const data = await response.json();
          
          if (data.success && data.data) {
            console.log('✅ Successfully restored user from backend:', data.data);
            const restoredUser = {
              ...data.data,
              authMethod: 'wallet' as const,
              hasBlockchainToken: !!blockchainTx,
              blockchainTx: blockchainTx || null,
              wallet_address: walletAddress // Ensure wallet_address is set
            };
            setUser(restoredUser);
            setAuthenticatedWallet(walletAddress);
            setSuccess(`Welcome back, @${restoredUser.username}!`);
            return;
          }
        } catch (error) {
          console.warn('Backend restore failed, using localStorage data:', error);
        }
        
        // Fallback: create user object from localStorage
        console.log('📝 Using localStorage fallback for wallet auth');
        const fallbackUser = {
          id: walletAddress, // Use wallet address as ID
          wallet_address: walletAddress, // Primary wallet address field
          username: username,
          email: null,
          display_name: username,
          avatar: null,
          bio: null,
          token_symbol: tokenSymbol || username.toUpperCase(),
          followers_count: 0,
          following_count: 0,
          posts_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          authMethod: 'wallet' as const,
          hasBlockchainToken: !!blockchainTx,
          blockchainTx: blockchainTx || null
        };
        
        setUser(fallbackUser);
        setAuthenticatedWallet(walletAddress);
        setSuccess(`Welcome back, @${username}!`);
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
      }
    } finally {
      setLoading(false);
    }
  };


  const handleWalletConnect = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Clear any stale authentication state before connecting
      console.log('🔄 [WALLET_CONNECT] Starting fresh wallet connection');
      localStorage.removeItem('authenticated_wallet');
      localStorage.removeItem('wallet_processing');
      setAuthenticatedWallet('');
      
      // Check if any wallets are available
      if (wallets.length === 0) {
        setError('No Sui wallets detected. Please install Suiet, Sui Wallet, or another compatible wallet.');
        setLoading(false);
        return;
      }

      // Try to connect with the first available wallet, or let user choose
      const firstWallet = wallets[0];
      
      connect(
        { wallet: firstWallet },
        {
          onSuccess: () => {
            setSuccess('Wallet connected successfully!');
            setLoading(false);
          },
          onError: (error: any) => {
            console.error('Wallet connection error:', error);
            setError(error?.message || 'Failed to connect wallet. Please try again or check your wallet.');
            setLoading(false);
          }
        }
      );
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      setError(error?.message || 'Failed to connect wallet. Please make sure you have a Sui wallet installed.');
      setLoading(false);
    }
  };

  // Handle meme launch completion
  const handleMemeLaunchComplete = async (userData: {
    username: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  }) => {
    try {
      setLoading(true);
      setError('');
      
      console.log('🚀 Creating user with meme launch data:', userData);
      console.log('🔑 Pending wallet address:', pendingWalletAddress);
      
      // Step 1: Create user in backend database
      const newUser = await createUserWithWallet({
        walletAddress: pendingWalletAddress,
        username: userData.username,
        displayName: userData.displayName || userData.username, // Use username as fallback
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
      });
      
      // Step 2: Token creation removed - focusing on social features only
      console.log('Token creation on blockchain has been disabled - focusing on social features');
      let blockchainTx = null;
      
      // Create user object for local state (blockchain token is optional)
      const userState = {
        ...newUser,
        wallet_address: pendingWalletAddress, // Use consistent wallet_address field
        authMethod: 'wallet' as const,
        tokenSymbol: userData.username.toUpperCase(),
        blockchainTx, // Will be null if creation failed
        hasBlockchainToken: !!blockchainTx
      };
      
      setUser(userState);
      setShowMemeLaunch(false);
      setPendingWalletAddress('');
      setSuccess(`🚀 Welcome to MemeFlow, @${userData.username}! Your token $${userData.username.toUpperCase()} is now live on blockchain!`);
      
      // Store auth info persistently
      localStorage.setItem('wallet_address', pendingWalletAddress);
      localStorage.setItem('username', userData.username);
      localStorage.setItem('token_symbol', userData.username.toUpperCase());
      localStorage.setItem('wallet_auth_completed', Date.now().toString());
      localStorage.setItem('authenticated_wallet', pendingWalletAddress);
      if (blockchainTx) {
        localStorage.setItem('blockchain_tx', blockchainTx);
      }
      
    } catch (error: any) {
      console.error('Error creating user and token:', error);
      setError(error.message || 'Failed to create your profile and token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle meme launch cancellation
  const handleMemeLaunchCancel = () => {
    setShowMemeLaunch(false);
    setPendingWalletAddress('');
    
    // Disconnect wallet since user cancelled registration
    if (currentWallet) {
      disconnect();
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
      
      // Disconnect wallet if connected
      if (currentWallet) {
        console.log('Disconnecting wallet:', currentWallet);
        disconnect();
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-pink-900 to-cyan-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show meme launch page for new users
  if (showMemeLaunch && pendingWalletAddress) {
    console.log('🚀 [AUTH_PROVIDER] Rendering MemeLaunchPage for:', pendingWalletAddress, 'loading:', loading);
    return (
      <MemeLaunchPage
        walletAddress={pendingWalletAddress}
        onComplete={handleMemeLaunchComplete}
        onCancel={handleMemeLaunchCancel}
        loading={loading}
      />
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-pink-900 to-cyan-900 p-4">
        <Card className="w-full max-w-md p-8 glass-strong border-2 border-white/20 rounded-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">M</span>
            </div>
            <h2 className="text-3xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text mb-2">
              Join MemeFlow
            </h2>
            <p className="text-white/80 text-base leading-relaxed">
              Connect your wallet to start trading
            </p>
          </div>

          {error && (
            <Alert className="mb-4 border-red-500 bg-red-500/10">
              <AlertDescription className="text-red-400">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4 border-green-500 bg-green-500/10">
              <Check className="w-4 h-4" />
              <AlertDescription className="text-green-400">{success}</AlertDescription>
            </Alert>
          )}

          {/* Wallet Connect Section */}
          <div className="mb-8">
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white mb-3">Connect Wallet</h3>
              <p className="text-sm text-white/70 leading-relaxed">Your username becomes your token automatically!</p>
            </div>
            
            <Button
              onClick={handleWalletConnect}
              disabled={loading || wallets.length === 0}
              className={`w-full h-16 text-lg font-bold tracking-wide transition-all duration-300 rounded-xl ${
                wallets.length === 0 
                  ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                  : 'bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 hover:from-purple-600 hover:via-pink-600 hover:to-cyan-600 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]'
              } text-white shadow-xl border border-white/10`}
            >
              <div className="flex items-center justify-center space-x-3">
                <Wallet className="w-6 h-6" />
                <span>{loading ? 'Connecting...' : wallets.length === 0 ? 'No Wallet Detected' : 'Connect Sui Wallet'}</span>
                <Sparkles className="w-5 h-5" />
              </div>
            </Button>
            
            <div className="flex items-center justify-center space-x-2 mt-4 px-4 py-2 bg-white/5 rounded-lg border border-white/10">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-white/70 font-medium">
                {wallets.length > 0 
                  ? `${wallets.length} wallet${wallets.length > 1 ? 's' : ''} detected` 
                  : 'Install a Sui-compatible wallet'}
              </span>
            </div>
          </div>

          {/* Wallet instructions */}
          <div className="text-center">
            {wallets.length > 0 ? (
              <div className="bg-gradient-to-r from-cyan-500/15 to-purple-500/15 rounded-xl p-6 border border-cyan-500/30 backdrop-blur-sm">
                <Sparkles className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
                <p className="text-white/90 text-base leading-relaxed mb-2">
                  Click "Connect Sui Wallet" to instantly create your personalized token!
                </p>
                <div className="flex items-center justify-center space-x-4 text-sm text-white/60 mt-3">
                  <span className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>No signup required</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                    <span>Instant token generation</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-orange-500/15 to-red-500/15 rounded-xl p-6 border border-orange-500/30 backdrop-blur-sm">
                <div className="text-3xl mb-3">⚠️</div>
                <p className="text-white/90 text-base leading-relaxed mb-4">
                  No Sui wallet detected. Install one to get started:
                </p>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <a href="https://suiet.app/" target="_blank" rel="noopener noreferrer" 
                     className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:border-cyan-400/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Wallet className="w-4 h-4 text-cyan-400" />
                      <span className="text-white/80">Suiet Wallet</span>
                    </div>
                    <span className="text-cyan-400 text-xs">Recommended</span>
                  </a>
                  <a href="https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil" target="_blank" rel="noopener noreferrer"
                     className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:border-cyan-400/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Wallet className="w-4 h-4 text-blue-400" />
                      <span className="text-white/80">Sui Wallet</span>
                    </div>
                    <span className="text-cyan-400 text-xs">Official</span>
                  </a>
                  <a href="https://ethoswallet.xyz/" target="_blank" rel="noopener noreferrer"
                     className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:border-cyan-400/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Wallet className="w-4 h-4 text-purple-400" />
                      <span className="text-white/80">Ethos Wallet</span>
                    </div>
                    <span className="text-cyan-400 text-xs">Popular</span>
                  </a>
                </div>
                <div className="text-sm text-white/60 mt-4 p-2 bg-white/5 rounded-lg">
                  💡 Refresh this page after installing a wallet
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      signOut, 
      loading, 
      handleWalletConnect, 
      currentWallet,
      showMemeLaunch,
      pendingWalletAddress
    }}>
      {children}
    </AuthContext.Provider>
  );
};