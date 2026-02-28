import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui-simple/Button';
import { Label } from './ui-simple/Label';
import { apiService } from '../lib/api';
import { GRADUATION_THRESHOLD, MAX_SUPPLY, TERM2_DENOM_BASE } from '../lib/graduation';

interface MemeLaunchPageProps {
  walletAddress: string;
  onComplete: (userData: {
    username: string;
  }) => void;
  onCancel: () => void;
  loading?: boolean;
}

type ValidationStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

// Price curve: p(x) = 0.02 + 0.35/(x + 3) + 1/(TERM2_DENOM_BASE - x)
const calculatePrice = (x: number): number => {
  return 0.02 + 0.35 / (x + 3) + 1 / (TERM2_DENOM_BASE - x);
};

const PriceCurveChart: React.FC = () => {
  const width = 320;
  const height = 140;
  const padding = { top: 20, right: 40, bottom: 30, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Generate points for x = 0 to MAX_SUPPLY
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= MAX_SUPPLY; i++) {
    points.push({ x: i, y: calculatePrice(i) });
  }

  // Find min/max for scaling
  const minPrice = Math.min(...points.map(p => p.y));
  const maxPrice = Math.max(...points.map(p => p.y));
  const priceRange = maxPrice - minPrice;

  // Scale functions
  const scaleX = (x: number) => padding.left + (x / MAX_SUPPLY) * chartWidth;
  const scaleY = (y: number) => padding.top + chartHeight - ((y - minPrice) / priceRange) * chartHeight;

  // Create path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`)
    .join(' ');

  // Graduation milestone at configured threshold
  const graduationX = scaleX(GRADUATION_THRESHOLD);
  const graduationY = scaleY(calculatePrice(GRADUATION_THRESHOLD));
  const middleTick = Math.floor(MAX_SUPPLY / 2);

  return (
    <svg width={width} height={height} className="w-full h-auto">
      {/* Grid lines */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#e5e7eb" strokeWidth="1" />
      <line x1={padding.left} y1={padding.top + chartHeight} x2={width - padding.right} y2={padding.top + chartHeight} stroke="#e5e7eb" strokeWidth="1" />

      {/* Y-axis labels */}
      <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" className="text-[10px] fill-gray-400">{maxPrice.toFixed(2)}</text>
      <text x={padding.left - 8} y={padding.top + chartHeight} textAnchor="end" className="text-[10px] fill-gray-400">{minPrice.toFixed(2)}</text>

      {/* X-axis labels */}
      <text x={padding.left} y={height - 8} textAnchor="middle" className="text-[10px] fill-gray-400">0</text>
      <text x={scaleX(middleTick)} y={height - 8} textAnchor="middle" className="text-[10px] fill-gray-400">{middleTick}</text>
      <text x={scaleX(MAX_SUPPLY)} y={height - 8} textAnchor="middle" className="text-[10px] fill-gray-400">{MAX_SUPPLY}</text>

      {/* Axis labels */}
      <text x={padding.left - 35} y={padding.top + chartHeight / 2} textAnchor="middle" transform={`rotate(-90, ${padding.left - 35}, ${padding.top + chartHeight / 2})`} className="text-[9px] fill-gray-400">SUI</text>
      <text x={padding.left + chartWidth / 2} y={height - 1} textAnchor="middle" className="text-[9px] fill-gray-400">Shares</text>

      {/* Graduation line */}
      <line x1={graduationX} y1={padding.top} x2={graduationX} y2={padding.top + chartHeight} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 2" />

      {/* Price curve */}
      <path d={pathD} fill="none" stroke="#111" strokeWidth="2" />

      {/* Graduation point */}
      <circle cx={graduationX} cy={graduationY} r="4" fill="#22c55e" />

      {/* Graduation label */}
      <text x={graduationX + 4} y={padding.top + 12} textAnchor="start" className="text-[9px] fill-green-600 font-medium">Phase 2</text>
    </svg>
  );
};

// Reserved usernames that cannot be used
const RESERVED_USERNAMES = new Set([
  // System/admin
  'admin', 'administrator', 'root', 'system', 'mod', 'moderator',
  'support', 'help', 'info', 'contact', 'team', 'staff',
  // API/technical
  'api', 'app', 'www', 'mail', 'email', 'ftp', 'ssh', 'ssl',
  'cdn', 'static', 'assets', 'media', 'upload', 'uploads',
  'download', 'downloads', 'file', 'files',
  // Actions
  'create', 'mint', 'delete', 'edit', 'update', 'remove',
  'login', 'logout', 'signin', 'signout', 'signup', 'register',
  'settings', 'config', 'configure', 'preferences',
  // Platform features
  'feed', 'plaza', 'explore', 'search', 'discover', 'trending',
  'notifications', 'messages', 'dm', 'dms', 'chat',
  'profile', 'profiles', 'user', 'users', 'account', 'accounts',
  'wallet', 'wallets', 'token', 'tokens', 'share', 'shares',
  'post', 'posts', 'comment', 'comments', 'like', 'likes',
  'follow', 'following', 'followers', 'unfollow',
  // Financial
  'buy', 'sell', 'trade', 'trading', 'swap', 'exchange',
  'price', 'market', 'markets', 'order', 'orders',
  'deposit', 'withdraw', 'transfer', 'send', 'receive',
  // Common reserved
  'null', 'undefined', 'none', 'void', 'test', 'testing',
  'demo', 'example', 'sample', 'default', 'official',
  'verified', 'anonymous', 'unknown', 'private', 'public',
  // Brand protection
  'cord', 'sui', 'suinetwork', 'mysten', 'anthropic', 'claude',
]);

/**
 * Validate username according to Phase 1 rules:
 * - Length: 3-15 characters
 * - Allowed: a-z, 0-9, - (hyphen)
 * - Cannot start/end with hyphen
 * - No consecutive hyphens
 * - Must contain at least one letter
 * - Not a reserved word
 */
const validateUsername = (value: string): string => {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return 'Username is required';
  }
  if (normalized.length < 3) {
    return 'Must be at least 3 characters';
  }
  if (normalized.length > 15) {
    return 'Must be 15 characters or less';
  }
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    return 'Only letters, numbers, and hyphens allowed';
  }
  if (normalized.startsWith('-')) {
    return 'Cannot start with a hyphen';
  }
  if (normalized.endsWith('-')) {
    return 'Cannot end with a hyphen';
  }
  if (normalized.includes('--')) {
    return 'Cannot contain consecutive hyphens';
  }
  if (!/[a-z]/.test(normalized)) {
    return 'Must contain at least one letter';
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return 'This username is reserved';
  }
  return '';
};

export const MemeLaunchPage: React.FC<MemeLaunchPageProps> = ({
  walletAddress,
  onComplete,
  onCancel,
  loading = false
}) => {
  const [username, setUsername] = useState('');
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [normalizedUsername, setNormalizedUsername] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced validation check
  const checkUsername = useCallback(async (value: string) => {
    const trimmed = value.trim().toLowerCase();

    // Skip if empty or too short
    if (!trimmed || trimmed.length < 3) {
      if (trimmed.length > 0 && trimmed.length < 3) {
        setValidationStatus('invalid');
        setValidationMessage('At least 3 characters');
      } else {
        setValidationStatus('idle');
        setValidationMessage('');
      }
      setNormalizedUsername('');
      return;
    }

    // Client-side validation first
    const clientError = validateUsername(trimmed);
    if (clientError) {
      setValidationStatus('invalid');
      setValidationMessage(clientError);
      setNormalizedUsername('');
      return;
    }

    // Check availability with backend
    setValidationStatus('checking');
    setValidationMessage('');

    try {
      const response = await apiService.checkUsername(trimmed);
      if (response.success && response.data) {
        if (response.data.available) {
          setValidationStatus('available');
          setValidationMessage('');
          setNormalizedUsername(response.data.normalized);
        } else {
          setValidationStatus('taken');
          setValidationMessage(response.data.error || 'Already taken');
          setNormalizedUsername('');
        }
      } else {
        // Backend returned validation error
        setValidationStatus('invalid');
        setValidationMessage(response.data?.error || response.error || 'Invalid username');
        setNormalizedUsername('');
      }
    } catch {
      // Network error - fall back to client validation only
      setValidationStatus('available');
      setValidationMessage('');
      setNormalizedUsername(trimmed);
    }
  }, []);

  // Handle input changes with debounce
  const handleInputChange = (rawValue: string) => {
    // Allow typing but limit length loosely
    const value = rawValue.slice(0, 20);
    setUsername(value);

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Reset to idle while typing
    if (value.trim()) {
      setValidationStatus('idle');
    } else {
      setValidationStatus('idle');
      setValidationMessage('');
      setNormalizedUsername('');
      return;
    }

    // Debounce the API check
    debounceRef.current = setTimeout(() => {
      checkUsername(value);
    }, 300);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Must be available to submit
    if (validationStatus !== 'available' || !normalizedUsername) {
      return;
    }

    onComplete({
      username: normalizedUsername
    });
  };

  const canSubmit = validationStatus === 'available' && !loading;

  const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  const firstSharePrice = calculatePrice(1);
  const firstSharePriceLabel = firstSharePrice.toFixed(4);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-semibold">
              Create your Share Market
            </h1>
            <p className="text-sm text-gray-500 font-mono">
              {shortAddress}
            </p>
            <p className="text-xs text-gray-500">
              Minting requires buying your first share (~{firstSharePriceLabel} SUI)
            </p>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <Label htmlFor="username" className="sr-only">
              Username
            </Label>
            <div className="relative">
              <input
                id="username"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => handleInputChange(e.target.value)}
                className={`w-full h-14 px-4 pr-12 text-xl font-semibold tracking-wide border rounded-lg placeholder-gray-300 focus:outline-none focus:ring-1 transition-colors lowercase text-center ${
                  validationStatus === 'available'
                    ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                    : validationStatus === 'taken' || validationStatus === 'invalid'
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                    : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900'
                }`}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              {/* Status indicator */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validationStatus === 'checking' && (
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                )}
                {validationStatus === 'available' && (
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {validationStatus === 'taken' && (
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {validationStatus === 'invalid' && (
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
            </div>

            {/* Status message */}
            <div className="flex items-center justify-between h-5">
              <div className="flex items-center gap-1.5">
                {validationStatus === 'available' && (
                  <span className="text-sm text-green-600 font-medium">Available</span>
                )}
                {validationStatus === 'taken' && (
                  <span className="text-sm text-red-600">{validationMessage || 'Already taken'}</span>
                )}
                {validationStatus === 'invalid' && (
                  <span className="text-sm text-amber-600">{validationMessage}</span>
                )}
                {validationStatus === 'checking' && (
                  <span className="text-sm text-gray-400">Checking...</span>
                )}
              </div>
              {username.trim() && (
                <span className="text-xs text-gray-400">{username.trim().length}/15</span>
              )}
            </div>
          </div>

          {/* Price Curve Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-700">How Phase 1 pricing works</h2>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showDetails ? 'Hide' : 'Learn more'}
              </button>
            </div>

            {/* Chart */}
            <div className="flex justify-center">
              <PriceCurveChart />
            </div>

            {/* Expandable Details */}
            {showDetails && (
              <div className="text-xs text-gray-500 space-y-2 pt-2 border-t border-gray-100">
                <div>
                  <span className="font-medium text-gray-600">Formula:</span>{' '}
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-[10px]">
                    p(x) = 0.02 + 0.35/(x+3) + 1/({TERM2_DENOM_BASE}-x)
                  </code>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Phase 1:</span>{' '}
                  Shares 1-{MAX_SUPPLY} follow bonding curve pricing
                </div>
                <div>
                  <span className="font-medium text-gray-600">Phase 2:</span>{' '}
                  At {GRADUATION_THRESHOLD} real holders, unlock $TICKER minting
                </div>
                <div>
                  <span className="font-medium text-gray-600">Fees:</span>{' '}
                  5% protocol fee on each trade
                </div>
              </div>
            )}

            <p className="text-gray-400 text-sm">
              Goal: {GRADUATION_THRESHOLD} Real Holders to unlock $TICKER minting.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1 h-11"
              disabled={loading}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 h-11 font-medium"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin mr-2" />
                  Minting...
                </>
              ) : (
                'Mint + Buy 1st Share'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
